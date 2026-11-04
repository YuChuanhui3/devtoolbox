import { ToolError } from '../errors';
import { parseCurl } from '../curl';
import { newId } from './id';
import { WB_METHODS } from './types';
import type { WbBodyMode, WbMethod, WbRequest } from './types';

/** shell 单引号安全包裹（tokenizeShell 支持的经典 '\'' 转义）。 */
function sq(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** 由工作台请求生成可复制的 curl 命令（变量保持字面量，便于导出）。 */
export function toCurl(req: WbRequest): string {
  const parts: string[] = ['curl'];
  if (req.method !== 'GET') parts.push('-X', req.method);
  parts.push(sq(req.url));
  for (const header of req.headers) {
    if (!header.enabled || !header.key.trim()) continue;
    parts.push('-H', sq(`${header.key.trim()}: ${header.value}`));
  }
  if (req.auth.type === 'basic') {
    parts.push('-u', sq(`${req.auth.username ?? ''}:${req.auth.password ?? ''}`));
  } else if (req.auth.type === 'bearer' && req.auth.token) {
    parts.push('-H', sq(`Authorization: Bearer ${req.auth.token}`));
  }
  if (req.body.mode !== 'none' && req.body.text) {
    parts.push('--data-raw', sq(req.body.text));
  }
  return parts.join(' ');
}

function bodyModeFor(data: string): WbBodyMode {
  const trimmed = data.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      return 'text';
    }
  }
  if (/^[^=&\s]+(=[^&]*)?(&[^=&\s]+=[^&]*)*$/.test(trimmed) && trimmed.includes('=')) return 'form';
  return 'text';
}

/** curl 命令 → 工作台请求（复用 lib/curl 的解析器）。 */
export function parseCurlToRequest(command: string, name?: string): WbRequest {
  const parsed = parseCurl(command);
  const method = parsed.method.toUpperCase();
  if (!WB_METHODS.includes(method as WbMethod)) {
    throw new ToolError({
      zh: `工作台暂不支持方法 ${method}`,
      en: `Method ${method} is not supported in the workbench yet`,
    });
  }
  const headers = Object.entries(parsed.headers).map(([key, value]) => ({ key, value, enabled: true }));
  return {
    id: newId(),
    name: name ?? `${method} ${parsed.url.slice(0, 60)}`,
    method: method as WbMethod,
    url: parsed.url,
    headers,
    body: { mode: parsed.data ? bodyModeFor(parsed.data) : 'none', text: parsed.data ?? '' },
    auth: parsed.auth ? { type: 'basic', username: parsed.auth.username, password: parsed.auth.password } : { type: 'none' },
  };
}
