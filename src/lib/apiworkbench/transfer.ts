import { ToolError } from '../errors';
import { parseCurl } from '../curl';
import type { Localized } from '@/i18n/locale';
import { newId } from './id';
import { paramsFromQuery, splitQuery, finalUrl } from './params';
import { MAX_SCRIPT_CHARS } from './scriptEngine';
import { walkRequests } from './tree';
import { CUSTOM_METHOD_PATTERN, WB_METHODS } from './types';
import type { WbAuth, WbBodyMode, WbCollection, WbFolder, WbHeaderRow, WbMethod, WbRequest } from './types';

/** shell 单引号安全包裹（tokenizeShell 支持的经典 '\'' 转义）。 */
function sq(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** 由工作台请求生成可复制的 curl 命令（变量保持字面量，便于导出）。 */
export function toCurl(req: WbRequest): string {
  const args: string[] = [];
  const method = req.customMethod?.trim() || req.method;
  for (const header of req.headers) {
    if (!header.enabled || !header.key.trim()) continue;
    args.push('-H', sq(`${header.key.trim()}: ${header.value}`));
  }
  const authQuery: string[] = [];
  if (req.auth.type === 'basic') {
    args.push('-u', sq(`${req.auth.username ?? ''}:${req.auth.password ?? ''}`));
  } else if (req.auth.type === 'bearer' && req.auth.token) {
    args.push('-H', sq(`Authorization: Bearer ${req.auth.token}`));
  } else if (req.auth.type === 'oauth2' && req.auth.accessToken) {
    args.push('-H', sq(`Authorization: ${req.auth.tokenType?.trim() || 'Bearer'} ${req.auth.accessToken}`));
  } else if (req.auth.type === 'api-key' && req.auth.key?.trim()) {
    if (req.auth.in === 'query') authQuery.push(`${req.auth.key}=${req.auth.value ?? ''}`);
    else args.push('-H', sq(`${req.auth.key.trim()}: ${req.auth.headerPrefix?.trim() ? `${req.auth.headerPrefix.trim()} ` : ''}${req.auth.value ?? ''}`));
  }
  const baseUrl = finalUrl(req.url, req.params);
  const url = authQuery.length ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${authQuery.join('&')}` : baseUrl;
  // 发送时 buildRequest 会按 body 模式补 Content-Type，复制出的命令也得带上，否则换个服务器就 415。
  const ownContentType = req.headers.some((h) => h.enabled && h.key.trim().toLowerCase() === 'content-type');
  const contentTypeFor = (mode: WbBodyMode): string | null =>
    ownContentType ? null : mode === 'json' || mode === 'graphql' ? 'application/json' : mode === 'form' ? 'application/x-www-form-urlencoded' : mode === 'text' ? 'text/plain' : null;
  if (req.body.mode === 'graphql' && req.body.graphql?.query.trim()) {
    const contentType = contentTypeFor('graphql');
    if (contentType) args.push('-H', sq(`Content-Type: ${contentType}`));
    args.push('--data-raw', sq(JSON.stringify({
      query: req.body.graphql.query,
      variables: safeJsonObject(req.body.graphql.variables),
      ...(req.body.graphql.operationName?.trim() ? { operationName: req.body.graphql.operationName.trim() } : {}),
    })));
  } else if (req.body.mode === 'multipart') {
    for (const part of req.body.multipart ?? []) {
      if (!part.key.trim()) continue;
      args.push('-F', sq(part.type === 'file' ? `${part.key}=@${part.fileName || part.key}` : `${part.key}=${part.value}`));
    }
    const files = (req.body.multipart ?? []).filter((p) => p.type === 'file' && p.fileName);
    if (files.length) args.push('#', `文件字段按名字引用，请在这些文件所在目录执行：${files.map((p) => p.fileName).join('、')}`);
  } else if (req.body.mode !== 'none' && req.body.text) {
    const contentType = contentTypeFor(req.body.mode);
    if (contentType) args.push('-H', sq(`Content-Type: ${contentType}`));
    args.push('--data-raw', sq(req.body.text));
  }
  return ['curl', ...(method === 'GET' ? [] : ['-X', method]), sq(url), ...args].join(' ');
}

/** GraphQL 的 variables 只接受 JSON 对象，其它一律当没有变量，免得导出出坏命令。 */
function safeJsonObject(text: string | undefined): Record<string, unknown> {
  if (!text?.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
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
  const known = WB_METHODS.includes(method as WbMethod);
  if (!known && !CUSTOM_METHOD_PATTERN.test(method)) {
    throw new ToolError({
      zh: `方法「${method}」不是合法的 HTTP 动词`,
      en: `"${method}" is not a valid HTTP method name`,
    });
  }
  const headers = Object.entries(parsed.headers).map(([key, value]) => ({ key, value, enabled: true }));
  return {
    id: newId(),
    name: name ?? `${method} ${parsed.url.slice(0, 60)}`,
    method: (known ? method : 'GET') as WbMethod,
    ...(known ? {} : { customMethod: method }),
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

/** Postman 的 `event[].listen` 只有这两种跟我们的两段脚本对得上。 */
const SCRIPT_PHASE: Record<string, 'preScript' | 'testScript'> = {
  prerequest: 'preScript',
  test: 'testScript',
};

/** `exec` 既可能是行数组也可能是一整串；v2.0 里还见过 script 直接是字符串。 */
function postmanExec(script: unknown): string {
  const dict = asDict(script);
  const exec = dict ? dict.exec : script;
  if (Array.isArray(exec)) return exec.map((line) => str(line)).join('\n');
  return str(exec);
}

/**
 * 请求级脚本搬进来；同阶段出现第二段时只保留第一段并记下丢弃原因，
 * 免得导入结果看起来「全搬完了」。超过长度上限的按存档同一口径截断。
 */
function postmanEvents(raw: unknown, notes: Set<string>): Partial<Pick<WbRequest, 'preScript' | 'testScript'>> {
  const out: Partial<Pick<WbRequest, 'preScript' | 'testScript'>> = {};
  for (const entry of Array.isArray(raw) ? raw : []) {
    const event = asDict(entry);
    if (!event) continue;
    const phase = SCRIPT_PHASE[str(event.listen)];
    if (!phase) {
      notes.add('unsupported-event');
      continue;
    }
    const text = postmanExec(event.script).trim();
    if (!text) continue;
    if (out[phase]) {
      notes.add('duplicate-script');
      continue;
    }
    out[phase] = text.slice(0, MAX_SCRIPT_CHARS);
    if (text.length > MAX_SCRIPT_CHARS) notes.add('script-truncated');
  }
  return out;
}

function convertPostmanItem(raw: unknown, inheritedAuth: WbAuth, notes: Set<string>): PostmanNode | null {
  const item = asDict(raw);
  if (!item) return null;
  const name = str(item.name, 'Untitled');
  if (Array.isArray(item.item)) {
    const folderAuth = item.auth ? postmanAuth(item.auth) : inheritedAuth;
    // 文件夹级脚本在我们的模型里没有落点（脚本挂在请求上），只能说明丢了什么。
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
  const scripts = postmanEvents(item.event, notes);
  if (request.mode === 'graphql') notes.add('graphql-body');
  const method = str(request.method, 'GET').toUpperCase();
  // 认得的动词直接用；不认得但形状合法（PROPFIND、TEAPOT）落到 customMethod——
  // 本项目支持自定义动词，把它们当「不支持」丢掉是假装我们做不到。
  const verb = WB_METHODS.includes(method as WbMethod)
    ? { method: method as WbMethod }
    : CUSTOM_METHOD_PATTERN.test(method)
      ? { method: 'GET' as WbMethod, customMethod: method }
      : null;
  if (!verb) {
    notes.add(`method-${method}`);
    return null;
  }
  const { rows: headers } = postmanHeaders(request.header);
  const body = postmanBody(request.body, headers);
  const auth = request.auth ? postmanAuth(request.auth) : inheritedAuth;
  const url = postmanUrl(request.url);
  // Postman 的查询串只在 URL 里，这里顺手铺进参数表格，导入后直接就能按行编辑。
  const params = paramsFromQuery(splitQuery(url).query);
  return {
    kind: 'request',
    request: {
      id: newId(),
      name,
      ...verb,
      url,
      ...(params.length ? { params } : {}),
      headers,
      body,
      auth,
      ...scripts,
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

const POSTMAN_NOTE_LABEL: Record<string, Localized> = {
  'folder-script': { zh: '文件夹级脚本（脚本只挂在请求上）', en: 'folder-level scripts (scripts live on requests here)' },
  'graphql-body': { zh: 'GraphQL 请求体', en: 'GraphQL bodies' },
  'unsupported-event': { zh: '对不上的事件脚本（只认 prerequest / test）', en: 'event scripts we cannot place (only prerequest / test)' },
  'duplicate-script': { zh: '同一阶段的第二段脚本', en: 'a second script for the same phase' },
  'script-truncated': { zh: '超长脚本（已截到上限）', en: 'an over-long script (trimmed to the cap)' },
};

/**
 * 导入说明给用户看的说法。`ignored` 里是机器码（`method-1ABC` 这种），
 * 原样显示在中文界面里等于没解释。
 */
export function postmanNoteText(note: string): Localized {
  const prefix = 'method-';
  if (note.startsWith(prefix)) {
    const verb = note.slice(prefix.length);
    return { zh: `方法「${verb}」不是合法动词（该请求已跳过）`, en: `method "${verb}" is not a valid verb (that request was skipped)` };
  }
  return POSTMAN_NOTE_LABEL[note] ?? { zh: note, en: note };
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
  // 脚本按 Postman 的形状写回 item.event，导出去还能导回来。
  const events = [
    ...(request.preScript ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: request.preScript.split('\n') } }] : []),
    ...(request.testScript ? [{ listen: 'test', script: { type: 'text/javascript', exec: request.testScript.split('\n') } }] : []),
  ];
  return {
    name: request.name,
    ...(events.length ? { event: events } : {}),
    request: {
      // 自定义动词要跟着走，否则 PROPFIND 导出去就变回 GET 了。
      method: request.customMethod?.trim() || request.method,
      header: request.headers.map((header) => ({ key: header.key, value: header.value, disabled: !header.enabled })),
      // Postman 只有 raw URL 一个地方放查询串，参数表格必须并进去才不算丢。
      url: { raw: finalUrl(request.url, request.params) },
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
