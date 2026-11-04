import { ToolError } from '../errors';
import { proxyFetch, type FetchMode, type ProxyRequestOptions, type TimedResponse } from '../net';
import { matchMockRoute, renderMockBody } from './mock';
import { interpolate } from './vars';
import type { WbMockRoute, WbRequest, WbVia } from './types';

export interface WbResponse extends TimedResponse {
  via: WbVia;
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

function bodyModeDefaults(req: WbRequest): string | null {
  if (req.body.mode === 'json') return 'application/json';
  if (req.body.mode === 'form') return 'application/x-www-form-urlencoded';
  if (req.body.mode === 'text') return 'text/plain';
  return null;
}

/** 插值 → mock 分流 → 真实请求。mock 命中时完全不触网。 */
export async function sendWbRequest(req: WbRequest, ctx: SendContext): Promise<WbResponse> {
  const fetcher = ctx.fetcher ?? proxyFetch;
  const url = interpolate(req.url, ctx.scope);
  if (url.missing.length > 0) {
    throw new ToolError(
      {
        zh: `存在未定义变量：${url.missing.join('、')}`,
        en: `Undefined variables: ${url.missing.join(', ')}`,
      },
      { zh: '在环境或集合变量里补上，或去掉引用', en: 'Define them in the environment or collection variables, or remove the reference' },
    );
  }

  const headers: Record<string, string> = {};
  for (const row of req.headers) {
    if (!row.enabled || !row.key.trim()) continue;
    headers[interpolate(row.key, ctx.scope).text] = interpolate(row.value, ctx.scope).text;
  }
  if (req.auth.type === 'basic') {
    const raw = `${interpolate(req.auth.username ?? '', ctx.scope).text}:${interpolate(req.auth.password ?? '', ctx.scope).text}`;
    const token = typeof btoa === 'function' ? btoa(raw) : Buffer.from(raw, 'binary').toString('base64');
    headers.Authorization = `Basic ${token}`;
  } else if (req.auth.type === 'bearer' && req.auth.token) {
    headers.Authorization = `Bearer ${interpolate(req.auth.token, ctx.scope).text}`;
  }
  const withBody = req.body.mode !== 'none' && req.body.text !== '' && req.method !== 'GET' && req.method !== 'HEAD';
  const body = withBody ? interpolate(req.body.text, ctx.scope).text : undefined;
  if (withBody && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
    const contentType = bodyModeDefaults(req);
    if (contentType) headers['Content-Type'] = contentType;
  }

  if (ctx.mockEnabled) {
    let pathname = url.text;
    try {
      pathname = new URL(url.text).pathname;
    } catch {
      pathname = url.text;
    }
    const hit = matchMockRoute(ctx.mockRoutes, req.method, pathname);
    if (hit) {
      const delay = Math.max(0, Math.round(hit.route.delayMs));
      const sleep = ctx.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
      const start = Date.now();
      if (delay > 0) await sleep(delay);
      const rendered = renderMockBody(hit.route, { params: hit.params });
      const routeHeaders: [string, string][] = hit.route.headers.filter(([k]) => k.trim() !== '');
      if (!routeHeaders.some(([k]) => k.toLowerCase() === 'content-type')) {
        routeHeaders.unshift(['Content-Type', 'application/json']);
      }
      const text = rendered.text;
      return {
        status: hit.route.status,
        ok: hit.route.status >= 200 && hit.route.status < 400,
        headers: routeHeaders,
        text,
        bytes: new TextEncoder().encode(text).length,
        ms: Math.max(delay, Date.now() - start),
        via: 'mock',
      };
    }
  }

  const response = await fetcher(url.text, {
    mode: ctx.mode,
    method: req.method,
    headers: Object.keys(headers).length ? headers : undefined,
    body,
    timeoutMs: ctx.timeoutMs,
  });
  return { ...response, via: ctx.mode };
}
