import { ToolError } from '../errors';
import { proxyFetch, type FetchMode, type ProxyRequestOptions, type TimedResponse } from '../net';
import { matchMockRoute, renderMockBody } from './mock';
import { interpolate } from './vars';
import { finalUrl } from './params';
import { readFile } from './files';
import { isEventStream } from './response';
import { createSseState, feedSse, flushSse, type SseEvent } from './sse';
import type { WbAuth, WbMockRoute, WbRequest, WbVia } from './types';

export interface WbResponse extends TimedResponse {
  via: WbVia;
  /** 流式响应被主动叫停时，已收到的部分照样返回，只是要标出来。 */
  aborted?: boolean;
  /** 事件流结尾有一帧攒不出 `data:`（连接被切断的常见形状），按规范丢弃但要说明。 */
  sseDiscarded?: boolean;
}

export interface SendContext {
  /** 合并后的变量作用域（内置变量除外）。 */
  scope: Record<string, string>;
  mockEnabled: boolean;
  mockRoutes: WbMockRoute[];
  mode: FetchMode;
  timeoutMs?: number;
  /** 注入以便单测断言 mock 命中时零网络调用。 */
  fetcher?: (target: string, options: ProxyRequestOptions) => Promise<TimedResponse>;
  sleep?: (ms: number) => Promise<void>;
}

export interface BuiltRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | FormData;
}

/** 自定义动词优先，但只有一个生效。 */
export function requestMethod(req: WbRequest): string {
  return req.customMethod || req.method;
}

function bodyModeDefaults(mode: WbRequest['body']['mode']): string | null {
  if (mode === 'json') return 'application/json';
  if (mode === 'form') return 'application/x-www-form-urlencoded';
  if (mode === 'text') return 'text/plain';
  if (mode === 'graphql') return 'application/json';
  return null;
}

function missingError(missing: string[]): ToolError {
  return new ToolError(
    {
      zh: `存在未定义变量：${missing.join('、')}`,
      en: `Undefined variables: ${missing.join(', ')}`,
    },
    { zh: '在环境或集合变量里补上，或去掉引用', en: 'Define them in the environment or collection variables, or remove the reference' },
  );
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === name);
}

/** 把 key=value 追加到查询串，不借 URL 解析器，免得把 {{变量}} 与已编码内容改写。 */
function appendQuery(url: string, key: string, value: string): string {
  const at = url.indexOf('#');
  const head = at < 0 ? url : url.slice(0, at);
  const hash = at < 0 ? '' : url.slice(at);
  return `${head}${head.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}${hash}`;
}

function applyAuth(auth: WbAuth, headers: Record<string, string>, scope: SendContext['scope']): (value: string) => string {
  const text = (raw: string) => interpolate(raw, scope).text;
  if (auth.type === 'basic') {
    const raw = `${text(auth.username ?? '')}:${text(auth.password ?? '')}`;
    const token = typeof btoa === 'function' ? btoa(raw) : Buffer.from(raw, 'binary').toString('base64');
    headers.Authorization = `Basic ${token}`;
  } else if (auth.type === 'bearer' && auth.token) {
    headers.Authorization = `Bearer ${text(auth.token)}`;
  } else if (auth.type === 'oauth2' && auth.accessToken) {
    headers.Authorization = `${auth.tokenType?.trim() || 'Bearer'} ${text(auth.accessToken)}`;
  } else if (auth.type === 'api-key' && auth.key) {
    const value = text(auth.value ?? '');
    if (auth.in !== 'query') {
      const prefix = auth.headerPrefix?.trim();
      headers[text(auth.key)] = prefix ? `${prefix} ${value}` : value;
      return (url) => url;
    }
    const key = text(auth.key);
    return (url) => appendQuery(url, key, value);
  }
  return (url) => url;
}

function buildGraphqlBody(req: WbRequest, scope: SendContext['scope']): string {
  const graphql = req.body.graphql;
  if (!graphql?.query.trim()) {
    throw new ToolError(
      { zh: 'GraphQL 请求没有 query', en: 'The GraphQL request has no query' },
      { zh: '填写 Query 后再发送；Variables 是可选的', en: 'Fill in the query first; variables are optional' },
    );
  }
  let variables: Record<string, unknown> = {};
  const rawVars = interpolate(graphql.variables, scope).text.trim();
  if (rawVars) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawVars);
    } catch {
      parsed = undefined;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ToolError(
        { zh: 'GraphQL Variables 不是合法 JSON 对象', en: 'GraphQL variables are not a valid JSON object' },
        { zh: '需要形如 {"id":"1"} 的对象，空着表示无变量', en: 'Expected an object like {"id":"1"}; leave it empty for none' },
      );
    }
    variables = parsed as Record<string, unknown>;
  }
  const operationName = graphql.operationName?.trim();
  return JSON.stringify({
    query: interpolate(graphql.query, scope).text,
    variables,
    ...(operationName ? { operationName } : {}),
  });
}

function buildMultipartBody(req: WbRequest, scope: SendContext['scope']): FormData {
  const parts = req.body.multipart ?? [];
  const keys = parts.map((part) => interpolate(part.key, scope).text.trim());
  if (!keys.some(Boolean)) {
    throw new ToolError(
      { zh: 'multipart 表单没有任何字段', en: 'The multipart form has no fields' },
      { zh: '至少填一个 Key，或改用其它请求体类型', en: 'Add at least one key, or pick another body type' },
    );
  }
  const form = new FormData();
  parts.forEach((part, index) => {
    const key = keys[index];
    if (!key) return;
    if (part.type === 'file') {
      const file = readFile(part.fileRef);
      if (!file) {
        throw new ToolError(
          { zh: `文件「${part.fileName || key}」需要重新选择`, en: `Re-pick the file for "${part.fileName || key}"` },
          { zh: '文件字节只存在本页内存里，刷新后就没了', en: 'File bytes live only in this tab memory and are gone after a reload' },
        );
      }
      form.append(key, file, file.name);
    } else {
      form.append(key, interpolate(part.value, scope).text);
    }
  });
  return form;
}

/**
 * 插值并组装出真正要发的东西：URL（含启用的参数与 api-key）、方法、请求头、请求体。
 * 不碰网络，所以 multipart / GraphQL / 自定义动词都能在没有 fetch 的情况下测。
 */
export function buildRequest(req: WbRequest, ctx: SendContext): BuiltRequest {
  const target = interpolate(finalUrl(req.url, req.params), ctx.scope);
  if (target.missing.length > 0) throw missingError(target.missing);

  const headers: Record<string, string> = {};
  for (const row of req.headers) {
    if (!row.enabled || !row.key.trim()) continue;
    headers[interpolate(row.key, ctx.scope).text] = interpolate(row.value, ctx.scope).text;
  }
  const method = requestMethod(req);
  const sendsBody = req.body.mode !== 'none' && method !== 'GET' && method !== 'HEAD';
  let body: string | FormData | undefined;
  if (sendsBody) {
    if (req.body.mode === 'multipart') {
      if (ctx.mode !== 'direct') {
        throw new ToolError(
          { zh: '代理通道不发送 multipart 请求体', en: 'Proxy channels do not carry multipart bodies' },
          { zh: '切到直连，或改用本地 Mock', en: 'Switch to direct, or use the local mock' },
        );
      }
      body = buildMultipartBody(req, ctx.scope);
    } else if (req.body.mode === 'graphql') {
      body = buildGraphqlBody(req, ctx.scope);
    } else {
      body = interpolate(req.body.text, ctx.scope).text || undefined;
    }
  }
  if (body && req.body.mode !== 'multipart' && !hasHeader(headers, 'content-type')) {
    // multipart 交给浏览器补 boundary，写死会让服务端解不出字段。
    const contentType = bodyModeDefaults(req.body.mode);
    if (contentType) headers['Content-Type'] = contentType;
  }
  return { url: applyAuth(req.auth, headers, ctx.scope)(target.text), method, headers, body };
}

/**
 * buildRequest 真正会插值的字段清单——发送前的缺失变量检查只看这些，
 * 多列一个就会把「填不出变量的字段」变成永远按不下去的发送键。
 */
export function requestInterpolatedFields(req: WbRequest): string[] {
  const fields = [req.url, ...(req.params ?? []).flatMap((p) => [p.key, p.value])];
  for (const row of req.headers) {
    if (row.enabled) fields.push(row.key, row.value);
  }
  const auth = req.auth;
  if (auth.type === 'basic') fields.push(auth.username ?? '', auth.password ?? '');
  if (auth.type === 'bearer') fields.push(auth.token ?? '');
  if (auth.type === 'oauth2') fields.push(auth.accessToken ?? '');
  if (auth.type === 'api-key' && auth.key) fields.push(auth.key, auth.value ?? '');
  if (req.body.mode === 'multipart') {
    for (const part of req.body.multipart ?? []) fields.push(part.key, part.type === 'file' ? '' : part.value);
  } else if (req.body.mode === 'graphql') {
    const g = req.body.graphql;
    if (g) fields.push(g.query, g.variables, g.operationName ?? '');
  } else if (req.body.mode !== 'none') {
    fields.push(req.body.text);
  }
  return fields;
}

/** 命中本地 Mock 的路由；没命中返回 null。按生效方法匹配，自定义动词也算。 */
function mockMatch(req: WbRequest, ctx: SendContext, built: BuiltRequest) {
  if (!ctx.mockEnabled) return null;
  let pathname = built.url;
  try {
    pathname = new URL(built.url).pathname;
  } catch {
    pathname = built.url;
  }
  return matchMockRoute(ctx.mockRoutes, requestMethod(req), pathname);
}

/** 按路由作答：延迟、模板渲染、Content-Type 兜底。全程本地生成，不触网。 */
async function mockResponse(
  hit: { route: WbMockRoute; params: Record<string, string> },
  ctx: SendContext,
  start: number,
): Promise<WbResponse> {
  const delay = Math.max(0, Math.round(hit.route.delayMs));
  const sleep = ctx.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  if (delay > 0) await sleep(delay);
  const rendered = renderMockBody(hit.route, { params: hit.params });
  const headers: [string, string][] = hit.route.headers.filter(([k]) => k.trim() !== '');
  if (!headers.some(([k]) => k.toLowerCase() === 'content-type')) {
    headers.unshift(['Content-Type', 'application/json']);
  }
  const text = rendered.text;
  return {
    status: hit.route.status,
    ok: hit.route.status >= 200 && hit.route.status < 400,
    headers,
    text,
    bytes: new TextEncoder().encode(text).length,
    ms: Math.max(delay, Date.now() - start),
    via: 'mock',
  };
}

/** 插值 → mock 分流 → 真实请求。mock 命中时完全不触网。 */
export async function sendWbRequest(req: WbRequest, ctx: SendContext): Promise<WbResponse> {
  const fetcher = ctx.fetcher ?? proxyFetch;
  const built = buildRequest(req, ctx);
  const start = Date.now();

  const hit = mockMatch(req, ctx, built);
  if (hit) return mockResponse(hit, ctx, start);

  const response = await fetcher(built.url, {
    mode: ctx.mode,
    method: built.method,
    headers: Object.keys(built.headers).length ? built.headers : undefined,
    body: built.body,
    timeoutMs: ctx.timeoutMs,
    // 图片与 PDF 要字节才能预览；代理通道给不出字节时自然退回占位文本。
    wantBlob: ctx.mode === 'direct',
  });
  return { ...response, via: ctx.mode };
}

export interface StreamedEvent extends SseEvent {
  /** 相对请求开始的毫秒数，用来看服务端推流的节奏。 */
  at: number;
}

export interface StreamContext extends SendContext {
  /** 停止按钮的 signal。流式不设总超时：超时会把正常的长连接掐掉。 */
  signal?: AbortSignal;
  /** 每收到一段就回调累计字节数（SSE 与非 SSE 都给），界面显示「已收到 N B」。 */
  onChunk?: (received: number) => void;
  /** 只有 text/event-stream 会逐帧回调。 */
  onEvent?: (event: StreamedEvent) => void;
  /** 注入以便单测喂自定义的 Response。 */
  opener?: (url: string, init: RequestInit) => Promise<Response>;
}

/**
 * 流式发送：边收边解析，不等服务端写完。
 *
 * 只走直连——两条公共代理都是「取完再给你」，没有增量可言，
 * 所以这里选择报错而不是假装在流。Mock 命中时同样一次性作答。
 */
export async function streamWbRequest(req: WbRequest, ctx: StreamContext): Promise<WbResponse> {
  const built = buildRequest(req, ctx);
  if (ctx.mockEnabled) {
    const hit = mockMatch(req, ctx, built);
    if (hit) return mockResponse(hit, ctx, Date.now());
  }
  if (ctx.mode !== 'direct') {
    throw new ToolError(
      { zh: '代理通道不支持流式响应', en: 'Proxy channels do not support streaming responses' },
      { zh: '公共代理会把整个响应取完再返回，请切到直连', en: 'Public proxies fetch the whole response before returning it; switch to direct' },
    );
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (ctx.signal) {
    if (ctx.signal.aborted) abort();
    else ctx.signal.addEventListener('abort', abort, { once: true });
  }
  const start = Date.now();
  const elapsed = () => Date.now() - start;
  const open = ctx.opener ?? ((url: string, init: RequestInit) => fetch(url, init));
  let response: Response;
  try {
    response = await open(built.url, {
      method: built.method,
      headers: Object.keys(built.headers).length ? built.headers : undefined,
      body: built.body,
      signal: controller.signal,
    });
  } catch (caught) {
    // 连接阶段就被中止：没有状态也没有字节，给一个空响应并标明中止，别抛成「请求失败」。
    if (isAbort(caught)) return { status: 0, ok: false, headers: [], text: '', bytes: 0, ms: elapsed(), via: 'direct', aborted: true };
    throw networkError(caught);
  }

  const headers: [string, string][] = [];
  response.headers.forEach((value, key) => headers.push([key, value]));
  const eventStream = isEventStream(headers);
  let sse = createSseState();
  let text = '';
  let bytes = 0;
  let aborted = false;
  let discarded = false;

  const emit = (events: SseEvent[]) => {
    for (const event of events) ctx.onEvent?.({ ...event, at: elapsed() });
  };

  // 拿不到可读流（某些环境不给 body）就退回整段读取，语义不变、只是不增量。
  const reader = response.body?.getReader?.();
  if (!reader) {
    const chunk = await response.text();
    text = chunk;
    bytes = new TextEncoder().encode(chunk).length;
    ctx.onChunk?.(bytes);
    if (eventStream) {
      const fed = feedSse(sse, chunk);
      const tail = flushSse(fed.state);
      discarded = tail.discarded;
      emit([...fed.events, ...tail.events]);
    }
  } else {
    const decoder = new TextDecoder('utf-8');
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value?.byteLength ?? 0;
        const chunk = decoder.decode(value ?? new Uint8Array(), { stream: true });
        text += chunk;
        ctx.onChunk?.(bytes);
        if (!eventStream) continue;
        const fed = feedSse(sse, chunk);
        sse = fed.state;
        emit(fed.events);
      }
      text += decoder.decode();
    } catch (caught) {
      if (!isAbort(caught)) throw networkError(caught);
      aborted = true;
    }
    // 服务端常常不发最后那个空行：补一个分隔符让最后一帧落地，再 flush 收半行。
    // 中止的流不补——那半行本来就被截断，只能标成不完整给出去。
    if (eventStream) {
      if (!aborted) {
        const fed = feedSse(sse, '\n');
        sse = fed.state;
        emit(fed.events);
      }
      const tail = flushSse(sse);
      emit(tail.events);
      discarded = tail.discarded;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    headers,
    text,
    bytes,
    ms: Math.max(1, elapsed()),
    via: 'direct',
    ...(aborted ? { aborted: true } : {}),
    ...(eventStream && discarded ? { sseDiscarded: true } : {}),
  };
}

function isAbort(caught: unknown): boolean {
  return (caught instanceof DOMException || caught instanceof Error) && caught.name === 'AbortError';
}

function networkError(caught: unknown): ToolError {
  return new ToolError(
    {
      zh: `请求失败：${caught instanceof Error ? caught.message : String(caught)}`,
      en: `Request failed: ${caught instanceof Error ? caught.message : String(caught)}`,
    },
    {
      zh: '浏览器 CORS 策略会拦截跨域请求，也可切代理模式；流式响应只在直连可用',
      en: 'The browser CORS policy blocks cross-origin requests; a proxy mode may help, but streaming only works direct',
    },
  );
}
