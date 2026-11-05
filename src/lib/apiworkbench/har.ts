import { ToolError } from '../errors';
import type { Localized } from '@/i18n/locale';
import { newId } from './id';
import { applyParamsToUrl, paramsFromQuery, splitQuery } from './params';
import { CUSTOM_METHOD_PATTERN, WB_METHODS } from './types';
import type { WbCollection, WbMethod, WbPart, WbRequest } from './types';

/**
 * HAR 1.2（HTTP Archive）→ 工作台集合。
 *
 * 只取请求面：`log.entries[].request` 里的 method / url / headers / queryString / postData。
 * `response`、`timings`、`cache`、`pages` 一概不看——这里是发请求的工具，不是回放器，
 * 把响应塞进历史会让人误以为这些字节是刚刚打出来的。
 */

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Dict) : null;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

const NOTE_LABEL: Record<string, Localized> = {
  'response-ignored': { zh: 'HAR 里的响应与耗时（只导入请求）', en: 'HAR responses and timings (requests only here)' },
  'file-field': { zh: 'multipart 的文件字段（HAR 里没有字节）', en: 'multipart file fields (no bytes in HAR)' },
  'bad-entry': { zh: '没有 URL 的条目', en: 'entries without a URL' },
  'websocket-entry': { zh: 'WebSocket 条目（请改用 WS 页签）', en: 'WebSocket entries (use the WS tab)' },
};

export function harNoteText(note: string): Localized {
  return NOTE_LABEL[note] ?? { zh: note, en: note };
}

export interface HarImportResult {
  collection: WbCollection;
  ignored: string[];
}

const KNOWN_METHODS = new Set<string>(WB_METHODS);

function methodOf(raw: string): Pick<WbRequest, 'method' | 'customMethod'> {
  const upper = raw.trim().toUpperCase();
  if (KNOWN_METHODS.has(upper)) return { method: upper as WbMethod };
  if (CUSTOM_METHOD_PATTERN.test(upper)) return { method: 'GET', customMethod: upper };
  return { method: 'GET' };
}

/** HAR 的 header/param 用 `name`，我们的表格用 `key`。 */
function namedPairs(raw: unknown): { name: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const pair = asDict(item);
      const name = str(pair?.name).trim();
      return name ? { name, value: str(pair?.value) } : null;
    })
    .filter((pair): pair is { name: string; value: string } => pair !== null);
}

function bodyOf(postData: unknown, notes: Set<string>): { mode: WbRequest['body']['mode']; text: string; multipart?: WbPart[] } {
  const post = asDict(postData);
  if (!post) return { mode: 'none', text: '' };
  const mime = str(post.mimeType).toLowerCase();
  const text = str(post.text);
  const params = namedPairs(post.params);

  if (mime.startsWith('multipart/')) {
    const parts: WbPart[] = [];
    for (const item of Array.isArray(post.params) ? post.params : []) {
      const pair = asDict(item);
      const key = str(pair?.name).trim();
      if (!key) continue;
      const fileName = str(pair?.fileName);
      if (fileName) {
        // HAR 里文件行只有 fileName / contentType，字节从来没进过这个 JSON。
        notes.add('file-field');
        parts.push({ key, type: 'file', value: '', fileName, mime: str(pair?.contentType) || undefined });
      } else {
        parts.push({ key, type: 'text', value: str(pair?.value) });
      }
    }
    return { mode: 'multipart', text: '', multipart: parts };
  }
  if (mime.includes('x-www-form-urlencoded')) {
    if (text) return { mode: 'form', text };
    return { mode: 'form', text: params.map((pair) => `${pair.name}=${pair.value}`).join('&') };
  }
  if (text) return { mode: mime.includes('json') ? 'json' : 'text', text };
  if (params.length) return { mode: 'form', text: params.map((pair) => `${pair.name}=${pair.value}`).join('&') };
  return { mode: 'none', text: '' };
}

function entryRequest(rawEntry: unknown, notes: Set<string>): WbRequest | null {
  const entry = asDict(rawEntry);
  const raw = asDict(entry?.request);
  const url = str(raw?.url);
  if (!entry || !raw || !url) {
    notes.add('bad-entry');
    return null;
  }
  // WebSocket 握手在 HAR 里也是一条 entry，但那是 WS 页签的活。
  if (str(raw.httpVersion).toUpperCase().includes('WEBSOCKET') || /^wss?:\/\//i.test(url)) notes.add('websocket-entry');

  const parts = splitQuery(url);
  const fromQuery = paramsFromQuery(parts.query);
  const fromTable = namedPairs(raw.queryString).map((pair) => ({ id: newId(), key: pair.name, value: pair.value, enabled: true }));
  const params = [...fromQuery, ...fromTable.filter((row) => !fromQuery.some((existing) => existing.key === row.key))];
  const body = bodyOf(raw.postData, notes);
  if (asDict(entry.response)) notes.add('response-ignored');

  const path = splitQuery(url).base.replace(/^https?:\/\/[^/]+/i, '') || url;
  return {
    id: newId(),
    name: `${str(raw.method, 'GET').toUpperCase()} ${path || '/'}`,
    ...methodOf(str(raw.method, 'GET')),
    // 参数表格与 URL 是同一个查询串的两种视图，两边都要有：只留一边就等于骗了下方的 URL 框。
    url: params.length ? applyParamsToUrl(parts.base, params) : parts.base,
    headers: namedPairs(raw.headers).map((pair) => ({ key: pair.name, value: pair.value, enabled: true })),
    ...(params.length ? { params } : {}),
    body,
    auth: { type: 'none' },
  };
}

/** HAR JSON → 一个集合（条目按出现顺序）；不是 HAR 就报错，不静默给空集合。 */
export function importHar(raw: string): HarImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ToolError({ zh: '不是合法 JSON', en: 'Not valid JSON' });
  }
  const log = asDict(asDict(parsed)?.log ?? parsed);
  const entries = Array.isArray(log?.entries) ? log.entries : [];
  if (!Array.isArray(log?.entries)) {
    throw new ToolError(
      { zh: '不是 HAR 文件', en: 'Not a HAR file' },
      { zh: '需要浏览器「Export HAR」得到的 `{ log: { entries: [...] } }`', en: 'Expected a browser “Export HAR” file shaped like { log: { entries: [...] } }' },
    );
  }
  const notes = new Set<string>();
  const requests = entries.map((entry) => entryRequest(entry, notes)).filter((item): item is WbRequest => item !== null);
  if (requests.length === 0) {
    throw new ToolError({ zh: 'HAR 里没有可导入的请求', en: 'The HAR has no importable requests' });
  }
  const creator = asDict(log?.creator);
  const collection: WbCollection = {
    id: newId(),
    name: str(creator?.name, 'HAR import'),
    root: { id: newId(), name: str(creator?.name, 'HAR import'), folders: [], requests },
    variables: [],
  };
  return { collection, ignored: [...notes] };
}
