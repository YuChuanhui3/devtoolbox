import { ToolError } from './errors';

export type FetchMode = 'direct' | 'corsproxy' | 'allorigins';

export const FETCH_MODES: { id: FetchMode; label: string; note: string }[] = [
  { id: 'direct', label: '直连', note: '受目标站点 CORS 限制，仅部分站点可用' },
  { id: 'corsproxy', label: 'corsproxy.io', note: '公共 CORS 代理，透传响应但可能有速率限制' },
  { id: 'allorigins', label: 'allorigins.win', note: '公共抓取代理，可返回状态与内容' },
];

/**
 * 请求从哪个「代理源」出去。浏览器=页面直连；扩展=浏览器扩展在页面侧
 * hook fetch/前端依旧直连；网络=公共 CORS 代理；程序=本地代理程序转发。
 */
export type ProxySource = 'browser' | 'extension' | 'network' | 'program';

/** 取数通道：代理源 + （网络源下的）公共代理选择 + 程序源地址。 */
export interface SendChannel {
  source: ProxySource;
  mode: FetchMode;
  /** 程序源的转发基础地址，形如 http://127.0.0.1:8080。 */
  programBase?: string;
}

/** 直连型通道（浏览器直连 / 扩展接管）不改写 URL。 */
const isPassthrough = (channel: SendChannel): boolean => channel.source === 'browser' || channel.source === 'extension';

/** 程序源要求 http(s) 基础地址，非法或缺省时退回直连。 */
function programProxyUrl(target: string, base: string | undefined): string {
  if (!base || !/^https?:\/\/.+/.test(base)) return target;
  const trimmed = base.replace(/\/+$/, '');
  return `${trimmed}?url=${encodeURIComponent(target)}`;
}

/** 把通道解析成实际请求的 URL；程序源拼 ?url=，其余沿用 proxiedUrl。 */
export function resolveChannelUrl(target: string, channel: SendChannel): string {
  if (isPassthrough(channel)) return target;
  if (channel.source === 'program') return programProxyUrl(target, channel.programBase);
  return proxiedUrl(target, channel.mode);
}

export const DEFAULT_TIMEOUT_MS = 15000;

export function proxiedUrl(target: string, mode: FetchMode): string {
  if (mode === 'corsproxy') {
    return `https://corsproxy.io/?url=${encodeURIComponent(target)}`;
  }
  if (mode === 'allorigins') {
    return `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
  }
  return target;
}

export interface TimedResponse {
  status: number;
  ok: boolean;
  headers: [string, string][];
  text: string;
  bytes: number;
  ms: number;
  /**
   * 二进制响应的原始字节，仅在调用方要了 `wantBlob` 且体积不超上限时给出。
   * 只活在内存里：不进历史、不进 localStorage，换一次请求就被换掉。
   */
  blob?: Blob;
  /** Original response body, kept in memory for lossless downloads. */
  body?: Uint8Array;
}

export interface ProxyRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  /** FormData 只走直连；代理通道不携带 multipart。 */
  body?: string | FormData;
  timeoutMs?: number;
  mode?: FetchMode;
  /** 图片/PDF 需要字节才能预览；别的调用方只要文本，不必留一份 Blob。 */
  wantBlob?: boolean;
  /** 普通响应的最大实际字节数，默认 100 MiB。 */
  maxBytes?: number;
}

/** 值得保留字节的响应类型。SVG 也在这里：当作图片渲染不会执行其中的脚本。 */
const BLOB_PREVIEW_PATTERN = /^(image\/|application\/pdf\b)/i;

/** 上限存在的理由：压测会并发打同一个资源，不设限就是一屏的巨型 Blob。 */
export const MAX_BLOB_BYTES = 8 * 1024 * 1024;

export const DEFAULT_MAX_RESPONSE_BYTES = 100 * 1024 * 1024;

export class ResponseTooLargeError extends ToolError {
  readonly code = 'too-large';
  constructor(maxBytes: number) {
    super(
      { zh: `响应超过大小限制（${maxBytes} 字节）`, en: `Response exceeds the size limit (${maxBytes} bytes)` },
      { zh: '请缩小响应内容或提高响应大小限制后重试', en: 'Reduce the response size or increase the limit and retry' },
    );
  }
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new ResponseTooLargeError(maxBytes);
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        // Cancellation may fail; preserve the size error in either case.
        void reader.cancel().catch(() => {});
        throw new ResponseTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** 拿不到（或不打算）解码时的正文占位，免得把二进制当文本糊在界面上。 */
function binaryPlaceholder(bytes: number): string {
  return `[binary ${bytes} bytes]`;
}

/** Unsupported or absent charset labels fall back to UTF-8. */
export function responseDecoder(contentType = ''): TextDecoder {
  const charset = /(?:^|;)\s*charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s]*))/i.exec(contentType);
  try { return new TextDecoder(charset?.[1] ?? charset?.[2] ?? charset?.[3] ?? 'utf-8'); }
  catch { return new TextDecoder('utf-8'); }
}

/** 通过直连或公共代理抓取 URL，返回文本与可读响应头。 */
export async function proxyFetch(target: string, options: ProxyRequestOptions = {}): Promise<TimedResponse> {
  const mode = options.mode ?? 'direct';
  const url = proxiedUrl(target, mode);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const start = performance.now();
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
    const collectBlob = Boolean(options.wantBlob) && BLOB_PREVIEW_PATTERN.test(response.headers.get('content-type') ?? '');
    const buffer = await readLimitedBody(response, options.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES);
    let text: string;
    let bytes: number;
    let blob: Blob | undefined;
    if (collectBlob) {
      bytes = buffer.byteLength;
      text = binaryPlaceholder(bytes);
      if (bytes <= MAX_BLOB_BYTES) blob = new Blob([buffer], { type: response.headers.get('content-type') ?? 'application/octet-stream' });
    } else {
      text = responseDecoder(response.headers.get('content-type') ?? '').decode(buffer);
      bytes = buffer.byteLength;
    }
    const headers: [string, string][] = [];
    response.headers.forEach((value, key) => headers.push([key, value]));
    return {
      status: response.status,
      ok: response.ok,
      headers,
      text,
      body: buffer,
      bytes,
      ms: Math.round(performance.now() - start),
      ...(blob ? { blob } : {}),
    };
  } catch (error) {
    if (error instanceof ResponseTooLargeError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ToolError(
        { zh: '请求超时', en: 'Request timed out' },
        { zh: '目标站点无响应，或公共代理繁忙，可更换代理或稍后重试', en: 'The target site is not responding, or the public proxy is busy; try another proxy or retry later' },
      );
    }
    throw new ToolError(
      {
        zh: `请求失败：${error instanceof Error ? error.message : String(error)}`,
        en: `Request failed: ${error instanceof Error ? error.message : String(error)}`,
      },
      mode === 'direct'
        ? {
            zh: '浏览器 CORS 策略会拦截跨域请求，可切换到代理模式',
            en: 'The browser CORS policy blocks cross-origin requests; switch to a proxy mode',
          }
        : {
            zh: '公共代理可能限流或不可用，可切换其他模式重试',
            en: 'The public proxy may be rate-limited or unavailable; try another mode',
          },
    );
  } finally {
    clearTimeout(timer);
  }
}

export interface AllOriginsGetResult {
  contents: string;
  status: {
    url: string;
    content_type: string;
    http_code: number;
    response_time: number;
    content_length: number;
  };
}

/** allorigins /get 接口：普通 fetch 即可跨域读取（其响应自带 CORS 头）。 */
export async function allOriginsGet(target: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<AllOriginsGetResult> {
  const result = await fetchJson<{ contents?: string; status?: AllOriginsGetResult['status'] }>(
    `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    undefined,
    timeoutMs,
  );
  if (!result || typeof result.contents !== 'string' || !result.status) {
    throw new ToolError(
      { zh: 'allorigins 返回数据异常', en: 'allorigins returned abnormal data' },
      { zh: '公共代理暂时不可用，请稍后重试或切换其他模式', en: 'The public proxy is temporarily unavailable; retry later or switch to another mode' },
    );
  }
  return { contents: result.contents, status: result.status };
}

/** 抓取网页 HTML：allorigins 模式下 /raw 失败时自动降级为 /get 的 contents。 */
export async function grabHtml(target: string, mode: FetchMode, timeoutMs = 25000): Promise<string> {
  try {
    return (await proxyFetch(target, { mode, timeoutMs })).text;
  } catch (error) {
    if (mode === 'allorigins') {
      try {
        return (await allOriginsGet(target, timeoutMs)).contents;
      } catch {
        throw error;
      }
    }
    throw error;
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok)
      throw new ToolError({ zh: `接口返回 ${response.status}`, en: `API returned ${response.status}` }, url);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ToolError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ToolError({ zh: '请求超时，请稍后重试', en: 'Request timed out, please retry later' });
    }
    throw new ToolError(
      {
        zh: `请求失败：${error instanceof Error ? error.message : String(error)}`,
        en: `Request failed: ${error instanceof Error ? error.message : String(error)}`,
      },
      { zh: '目标服务不可达或浏览器跨域限制', en: 'The target service is unreachable, or the browser blocked it due to CORS' },
    );
  } finally {
    clearTimeout(timer);
  }
}

export interface DnsAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

export interface DohResult {
  Status: number;
  Authority?: DnsAnswer[];
  Answer?: DnsAnswer[];
}

const DOH_TYPES: Record<string, string> = {
  A: '1',
  AAAA: '28',
  CNAME: '5',
  MX: '15',
  TXT: '16',
  NS: '2',
  SOA: '6',
  PTR: '12',
  SRV: '33',
  CAA: '257',
};

export function dohTypeCode(type: string): string {
  const code = DOH_TYPES[type.toUpperCase()];
  if (!code) throw new ToolError({ zh: `不支持的记录类型：${type}`, en: `Unsupported record type: ${type}` });
  return code;
}

export function dohTypeName(code: number): string {
  const entry = Object.entries(DOH_TYPES).find(([, value]) => value === String(code));
  return entry ? entry[0] : `TYPE${code}`;
}

/** Cloudflare DNS over HTTPS，接口本身支持跨域访问。 */
export async function dnsResolve(name: string, type: string): Promise<DohResult> {
  const trimmed = name.trim().replace(/\.$/, '');
  if (!trimmed) throw new ToolError({ zh: '请输入域名', en: 'Enter a domain name' });
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(trimmed)}&type=${encodeURIComponent(type.toUpperCase())}`;
  return fetchJson<DohResult>(
    url,
    { headers: { accept: 'application/dns-json' } },
    10000,
  );
}
