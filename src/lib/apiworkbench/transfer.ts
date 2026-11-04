import { ToolError } from '../errors';
import { parseCurl } from '../curl';
import { newId } from './id';
import { walkRequests } from './tree';
import { WB_METHODS } from './types';
import type { WbAuth, WbBodyMode, WbCollection, WbFolder, WbHeaderRow, WbMethod, WbRequest } from './types';

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

/* ---------- Postman v2.1 导入导出（容错 v2.0） ---------- */

type Dict = Record<string, unknown>;

const asDict = (value: unknown): Dict | null => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Dict) : null);
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

function postmanHeaders(raw: unknown): { rows: WbHeaderRow[]; disabled: number } {
  const rows: WbHeaderRow[] = [];
  let disabled = 0;
  if (!Array.isArray(raw)) return { rows, disabled };
  for (const item of raw) {
    const row = asDict(item);
    if (!row) continue;
    const key = str(row.key).trim();
    if (!key) continue;
    if (row.disabled === true) {
      disabled += 1;
      continue;
    }
    rows.push({ key, value: str(row.value), enabled: true });
  }
  return { rows, disabled };
}

function postmanUrl(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  const dict = asDict(raw);
  if (!dict) return '';
  const rawText = str(dict.raw);
  if (rawText) return rawText;
  const parts = Array.isArray(dict.path) ? dict.path.map((segment) => str(segment)).filter(Boolean) : [];
  const host = Array.isArray(dict.host) ? dict.host.join('.') : str(dict.host);
  const protocol = Array.isArray(dict.protocol) ? dict.protocol.join(',') : str(dict.protocol);
  const base = [protocol, host && `${protocol ? '://' : ''}${host}`].join('');
  const query = Array.isArray(dict.query)
    ? dict.query
        .map((item) => {
          const pair = asDict(item);
          return pair ? `${str(pair.key)}=${str(pair.value)}` : str(item);
        })
        .filter(Boolean)
    : [];
  return `${base}${parts.length ? `/${parts.join('/')}` : ''}${query.length ? `?${query.join('&')}` : ''}`;
}

function postmanBody(raw: unknown, headers: WbHeaderRow[]): { mode: WbBodyMode; text: string } {
  const dict = asDict(raw);
  if (!dict) return { mode: 'none', text: '' };
  const contentType = headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? '';
  if (dict.mode === 'urlencoded') {
    const pairs = Array.isArray(dict.urlencoded)
      ? dict.urlencoded
          .map((item) => {
            const pair = asDict(item);
            return pair && !pair.disabled ? `${str(pair.key)}=${str(pair.value)}` : '';
          })
          .filter(Boolean)
      : [];
    return { mode: 'form', text: pairs.join('&') };
  }
  if (dict.mode === 'formdata') {
    const pairs = Array.isArray(dict.formdata)
      ? dict.formdata
          .map((item) => {
            const pair = asDict(item);
            return pair && pair.type === 'text' && !pair.disabled ? `${str(pair.key)}=${str(pair.value)}` : '';
          })
          .filter(Boolean)
      : [];
    return { mode: pairs.length ? 'form' : 'none', text: pairs.join('&') };
  }
  const text = typeof dict.raw === 'string' ? dict.raw : '';
  if (!text) return { mode: 'none', text: '' };
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return { mode: 'json', text };
    } catch {
      /* 落到下面按内容类型判断 */
    }
  }
  if (contentType.includes('json')) return { mode: 'json', text };
  if (contentType.includes('x-www-form-urlencoded') && /^[^=&\s]+=.+$/.test(trimmed)) return { mode: 'form', text };
  return { mode: 'text', text };
}

function postmanAuth(raw: unknown): WbAuth {
  const dict = asDict(raw);
  if (!dict) return { type: 'none' };
  const kind = str(dict.type);
  const find = (group: unknown, key: string) =>
    asDict(Array.isArray(group) ? group.find((entry) => asDict(entry)?.key === key) : undefined)?.value;
  if (kind === 'basic') {
    return { type: 'basic', username: str(find(dict.basic, 'username')), password: str(find(dict.basic, 'password')) };
  }
  if (kind === 'bearer') {
    return { type: 'bearer', token: str(find(dict.bearer, 'token')) };
  }
  return { type: 'none' };
}

type PostmanNode = { kind: 'request'; request: WbRequest } | { kind: 'folder'; folder: WbFolder };

function convertPostmanItem(raw: unknown, inheritedAuth: WbAuth, notes: Set<string>): PostmanNode | null {
  const item = asDict(raw);
  if (!item) return null;
  const name = str(item.name, 'Untitled');
  if (Array.isArray(item.item)) {
    const folderAuth = item.auth ? postmanAuth(item.auth) : inheritedAuth;
    if (item.event) notes.add('folder-script');
    const children = item.item
      .map((child) => convertPostmanItem(child, folderAuth, notes))
      .filter((child): child is PostmanNode => child !== null);
    return {
      folder: {
        id: newId(),
        name,
        folders: children.filter((child) => child.kind === 'folder').map((child) => (child as { kind: 'folder'; folder: WbFolder }).folder),
        requests: children.filter((child) => child.kind === 'request').map((child) => (child as { kind: 'request'; request: WbRequest }).request),
      },
      kind: 'folder',
    };
  }
  const request = asDict(item.request);
  if (!request) return null;
  if (item.event) notes.add('request-script');
  if (request.mode === 'graphql') notes.add('graphql-body');
  const method = str(request.method, 'GET').toUpperCase();
  if (!WB_METHODS.includes(method as WbMethod)) {
    notes.add(`method-${method}`);
    return null;
  }
  const { rows: headers } = postmanHeaders(request.header);
  const body = postmanBody(request.body, headers);
  const auth = request.auth ? postmanAuth(request.auth) : inheritedAuth;
  return {
    kind: 'request',
    request: {
      id: newId(),
      name,
      method: method as WbMethod,
      url: postmanUrl(request.url),
      headers,
      body,
      auth,
    },
  };
}

function nodesIntoFolder(items: unknown[], auth: WbAuth, notes: Set<string>, name: string): WbFolder {
  const children = items
    .map((item) => convertPostmanItem(item, auth, notes))
    .filter((child): child is PostmanNode => child !== null);
  return {
    id: newId(),
    name,
    folders: children.filter((child) => child.kind === 'folder').map((child) => (child as { kind: 'folder'; folder: WbFolder }).folder),
    requests: children.filter((child) => child.kind === 'request').map((child) => (child as { kind: 'request'; request: WbRequest }).request),
  };
}

export interface PostmanImportResult {
  collection: WbCollection;
  ignored: string[];
}

/** Postman 集合 JSON（v2.1，容错 v2.0）→ 工作台集合；event 脚本忽略并在返回值提示。 */
export function importPostman(raw: string): PostmanImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ToolError({ zh: '不是合法 JSON', en: 'Not valid JSON' });
  }
  const doc = asDict(parsed);
  if (!doc || !Array.isArray(doc.item)) {
    throw new ToolError(
      { zh: '不是 Postman 集合文件', en: 'Not a Postman collection' },
      { zh: '请导出 Postman「Collections → 集合 → Export」的 JSON 文件', en: 'Export the collection from Postman (Collections → collection → Export) and pick that JSON file' },
    );
  }
  const info = asDict(doc.info);
  const notes = new Set<string>();
  const root = nodesIntoFolder(doc.item, postmanAuth(doc.auth), notes, str(info?.name, 'Postman import'));
  if (walkRequests(root).length === 0) {
    throw new ToolError({ zh: '集合里没有可导入的请求', en: 'The collection has no importable requests' });
  }
  const variables = Array.isArray(doc.variable)
    ? doc.variable
        .map((item) => {
          const pair = asDict(item);
          const key = str(pair?.key).trim();
          return key ? { id: newId(), key, value: str(pair?.value), enabled: pair?.disabled !== true, ...(pair?.type === 'secret' ? { secret: true } : {}) } : null;
        })
        .filter((variable): variable is NonNullable<typeof variable> => variable !== null)
    : [];
  const collection: WbCollection = {
    id: newId(),
    name: str(info?.name, 'Postman import'),
    root,
    variables,
  };
  return { collection, ignored: [...notes] };
}

function exportRequest(request: WbRequest): Dict {
  return {
    name: request.name,
    request: {
      method: request.method,
      header: request.headers.map((header) => ({ key: header.key, value: header.value, disabled: !header.enabled })),
      url: { raw: request.url },
      ...(request.body.mode !== 'none' && request.body.text
        ? {
            body: {
              mode: 'raw',
              raw: request.body.text,
              options: { raw: { language: request.body.mode === 'json' ? 'json' : 'text' } },
            },
          }
        : {}),
      ...(request.auth.type === 'basic'
        ? { auth: { type: 'basic', basic: [{ key: 'username', value: request.auth.username ?? '' }, { key: 'password', value: request.auth.password ?? '' }] } }
        : request.auth.type === 'bearer'
          ? { auth: { type: 'bearer', bearer: [{ key: 'token', value: request.auth.token ?? '' }] } }
          : {}),
    },
  };
}

function exportFolder(folder: WbFolder): Dict {
  return { name: folder.name, item: [...folder.folders.map(exportFolder), ...folder.requests.map(exportRequest)] };
}

/** 工作台集合 → Postman Collection v2.1 对象（可直接存盘并在 Postman 客户端导入）。 */
export function exportPostman(collection: WbCollection): Dict {
  return {
    info: {
      _postman_id: collection.id,
      name: collection.name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: collection.root.folders.map(exportFolder).concat(collection.root.requests.map(exportRequest)),
    ...(collection.variables.length
      ? {
          variable: collection.variables.map((variable) => ({
            key: variable.key,
            value: variable.value,
            disabled: !variable.enabled,
            ...(variable.secret ? { type: 'secret' } : {}),
          })),
        }
      : {}),
  };
}
