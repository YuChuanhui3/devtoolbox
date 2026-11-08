import { ToolError } from '../errors';
import type { Localized } from '@/i18n/locale';
import { newId } from './id';
import { applyParamsToUrl, paramsFromQuery, splitQuery } from './params';
import { MAX_SCRIPT_CHARS } from './scriptEngine';
import { WB_METHODS } from './types';
import type { WbAuth, WbBody, WbCollection, WbEnvironment, WbFolder, WbHeaderRow, WbMethod, WbParam, WbPart, WbRequest, WbVar } from './types';

/**
 * Hoppscotch 集合 / 环境 互通。
 *
 * 对照表（他们 v12 集合 + v"1" 请求 + v2 环境 ↔ 本项目）：
 *   HoppRESTHeader / HoppRESTParam `{key,value,active}`  ↔ WbHeaderRow / WbParam `{key,value,enabled}`
 *   HoppRESTRequest `{v:"1",endpoint,method,body,auth,…}` ↔ WbRequest（`body.contentType` ↔ `WbBody.mode`）
 *   HoppGQLRequest `{v:1,url,query,variables}`            ↔ WbRequest + `body.mode='graphql'`
 *   HoppEnvironment `{v:2,variables:[{key,initialValue,currentValue,secret}]}` ↔ WbEnvironment
 *   CollectionVariable `{key,initialValue,currentValue,secret}` ↔ WbVar
 *
 * 我们这边没有对应位置的东西：集合级/文件夹级脚本、请求级 description、
 * multipart 的文件字节、参数行的说明——导入时丢弃并在结果里点名，导出时不假装还在。
 */

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Dict) : null;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function bool(value: unknown, fallback = true): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Hoppscotch 用 initialValue/currentValue 区分默认值与在用值；在用值为空就回落到默认值。 */
function varValue(raw: Dict): string {
  const current = str(raw.currentValue);
  if (raw.currentValue !== undefined) return current || str(raw.initialValue);
  return str(raw.value);
}

const NOTE_LABEL: Record<string, Localized> = {
  'collection-script': { zh: '集合级脚本（脚本只挂在请求上）', en: 'collection-level scripts (scripts live on requests here)' },
  'unknown-auth': { zh: '认不出的认证类型（按无认证导入）', en: 'unrecognised auth type (imported as none)' },
  'auth-inherit': { zh: '「继承集合认证」（本项目没有集合级认证）', en: '“inherit collection auth” (no collection-level auth here)' },
  'file-field': { zh: 'multipart 的文件字段（JSON 里没有字节）', en: 'multipart file fields (no bytes in JSON)' },
  'param-description': { zh: '参数行说明（本项目不落这个字段）', en: 'parameter descriptions (not stored here)' },
  'request-description': { zh: '请求说明字段', en: 'request descriptions' },
  'script-truncated': { zh: '超长脚本（已截到上限）', en: 'an over-long script (trimmed to the cap)' },
  'no-v12': { zh: '非 v12 集合（已按能认出的字段读）', en: 'not a v12 collection (read what could be recognised)' },
};

export function hoppscotchNoteText(note: string): Localized {
  return NOTE_LABEL[note] ?? { zh: note, en: note };
}

export interface HoppscotchImportResult {
  collections: WbCollection[];
  environments: WbEnvironment[];
  ignored: string[];
}

const METHODS = new Set<string>(WB_METHODS);

function toMethod(raw: unknown): { method: WbMethod; customMethod?: string } {
  const upper = str(raw, 'GET').toUpperCase();
  if (METHODS.has(upper)) return { method: upper as WbMethod };
  return { method: 'GET', customMethod: upper };
}

function rows(raw: unknown): [string, string, boolean][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = asDict(item);
      const key = str(row?.key).trim();
      return key ? [key, str(row?.value), bool(row?.active)] as [string, string, boolean] : null;
    })
    .filter((row): row is [string, string, boolean] => row !== null);
}

function headerRows(raw: unknown): WbHeaderRow[] {
  return rows(raw).map(([key, value, active]) => ({ key, value, enabled: active }));
}

function paramRows(raw: unknown, notes: Set<string>): WbParam[] | undefined {
  const list = Array.isArray(raw) ? raw : [];
  const out: WbParam[] = [];
  for (const item of list) {
    const row = asDict(item);
    const key = str(row?.key).trim();
    if (!key) continue;
    if (str(row?.description)) notes.add('param-description');
    out.push({ key, value: str(row?.value), enabled: bool(row?.active) });
  }
  return out.length ? out : undefined;
}

function varsOf(raw: unknown): WbVar[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = asDict(item);
      const key = str(row?.key).trim();
      return key ? { id: newId(), key, value: varValue(row!), enabled: true, ...(bool(row!.secret, false) ? { secret: true } : {}) } : null;
    })
    .filter((item): item is WbVar => item !== null);
}

function authOf(raw: unknown, notes: Set<string>): WbAuth {
  const auth = asDict(raw);
  const type = str(auth?.authType, 'none');
  if (type === 'basic') return { type: 'basic', username: str(auth?.username), password: str(auth?.password) };
  if (type === 'bearer') return { type: 'bearer', token: str(auth?.token) };
  if (type === 'oauth-2') {
    return {
      type: 'oauth2',
      accessToken: str(auth?.token),
      tokenUrl: str(auth?.accessTokenURL) || undefined,
      authUrl: str(auth?.authURL) || undefined,
      clientId: str(auth?.clientID) || undefined,
      scope: str(auth?.scope) || undefined,
    };
  }
  if (type === 'api-key') {
    return {
      type: 'api-key',
      in: str(auth?.addTo).toLowerCase().includes('query') ? 'query' : 'header',
      key: str(auth?.key),
      value: str(auth?.value),
    };
  }
  if (type === 'inherit') {
    notes.add('auth-inherit');
    return { type: 'none' };
  }
  if (type !== 'none') notes.add('unknown-auth');
  return { type: 'none' };
}

function bodyOf(raw: unknown, notes: Set<string>): WbBody {
  const body = asDict(raw);
  const contentType = body?.contentType;
  if (!body || contentType === null || contentType === undefined || body.body === null) return { mode: 'none', text: '' };
  if (contentType === 'multipart/form-data') {
    const parts = Array.isArray(body.body) ? body.body : [];
    const multipart: WbPart[] = [];
    for (const item of parts) {
      const part = asDict(item);
      const key = str(part?.key).trim();
      if (!key) continue;
      if (part?.isFile === true) {
        // 他们的 JSON 导出里文件是 `value: [null]`，字节根本没进文件。
        notes.add('file-field');
        multipart.push({ key, type: 'file', value: '' });
      } else {
        multipart.push({ key, type: 'text', value: str(part?.value) });
      }
    }
    return { mode: 'multipart', text: '', multipart };
  }
  const text = str(body.body);
  if (contentType === 'application/x-www-form-urlencoded') return { mode: 'form', text };
  if (str(contentType).includes('json')) return { mode: 'json', text };
  return { mode: 'text', text };
}

function scriptOf(raw: unknown): string | undefined {
  const text = str(raw).slice(0, MAX_SCRIPT_CHARS);
  return text ? text : undefined;
}

/** HoppRESTRequest / HoppGQLRequest → WbRequest；GQL 的形状靠有没有 `endpoint` 区分。 */
function requestOf(raw: unknown, notes: Set<string>): WbRequest {
  const item = asDict(raw) ?? {};
  const graphql = item.endpoint === undefined && (typeof item.query === 'string' || typeof item.url === 'string');
  if (str(item.description)) notes.add('request-description');
  const params = item.params !== undefined ? paramRows(item.params, notes) : undefined;
  const endpoint = str(graphql ? item.url : item.endpoint);
  const request: WbRequest = {
    id: newId(),
    name: str(item.name, 'Hoppscotch request'),
    ...toMethod(item.method),
    // 我们的不变量是「URL 的查询串等于表格启用行」，所以他们的两份数据要并回 URL。
    url: params?.length ? applyParamsToUrl(endpoint, params) : endpoint,
    headers: headerRows(item.headers),
    body: graphql
      ? {
          mode: 'graphql',
          text: '',
          graphql: {
            query: str(item.query),
            variables: str(item.variables),
            operationName: str(item.operationName) || undefined,
          },
        }
      : bodyOf(item.body, notes),
    auth: authOf(item.auth, notes),
    ...(params ? { params } : {}),
    ...(scriptOf(item.preRequestScript) ? { preScript: scriptOf(item.preRequestScript) } : {}),
    ...(scriptOf(item.testScript) ? { testScript: scriptOf(item.testScript) } : {}),
  };
  const scripts = [str(item.preRequestScript), str(item.testScript)];
  if (scripts.some((text) => text.length > MAX_SCRIPT_CHARS)) notes.add('script-truncated');
  return request;
}

function folderOf(raw: unknown, notes: Set<string>, fallbackName: string): WbFolder {
  const item = asDict(raw) ?? {};
  if (str(item.preRequestScript) || str(item.testScript)) notes.add('collection-script');
  // 集合级认证在我们这边没有落点：只有请求自己能带 auth。
  const level = str(asDict(item.auth)?.authType, 'none');
  if (level !== 'none' && level !== 'inherit') notes.add('unknown-auth');
  else if (level === 'inherit') notes.add('auth-inherit');
  return {
    id: newId(),
    name: str(item.name, fallbackName),
    folders: Array.isArray(item.folders) ? item.folders.map((child) => folderOf(child, notes, 'Folder')) : [],
    requests: Array.isArray(item.requests) ? item.requests.map((child) => requestOf(child, notes)) : [],
  };
}

function collectionOf(raw: unknown, notes: Set<string>): WbCollection {
  const item = asDict(raw) ?? {};
  const root = folderOf(item, notes, 'Imported collection');
  if (item.v !== 12) notes.add('no-v12');
  return { id: newId(), name: str(item.name, root.name), root, variables: varsOf(item.variables) };
}

function environmentOf(raw: Dict): WbEnvironment {
  return { id: newId(), name: str(raw.name, 'Hoppscotch environment'), variables: varsOf(raw.variables) };
}

/** 一个环境项：有 variables 数组、但没有 requests/folders 这两个集合特征。 */
function isEnvironment(raw: Dict): boolean {
  return raw.requests === undefined && raw.folders === undefined && Array.isArray(raw.variables);
}

/** 看着像集合才收：一个只有 `{"hello":1}` 的对象不该变成一个空集合骗用户。 */
function isCollection(raw: Dict): boolean {
  return raw.requests !== undefined || raw.folders !== undefined || typeof raw.name === 'string';
}

/**
 * Hoppscotch 导出的 JSON → 工作台集合与环境。
 * 接受单个对象、对象数组，以及他们「All environments」导出的 `[{name, variables}]`。
 */
export function importHoppscotch(raw: string): HoppscotchImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ToolError({ zh: '不是合法 JSON', en: 'Not valid JSON' });
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const notes = new Set<string>();
  const collections: WbCollection[] = [];
  const environments: WbEnvironment[] = [];
  for (const item of list) {
    const dict = asDict(item);
    if (!dict) continue;
    if (isEnvironment(dict)) environments.push(environmentOf(dict));
    else if (isCollection(dict)) collections.push(collectionOf(item, notes));
  }
  if (collections.length === 0 && environments.length === 0) {
    throw new ToolError(
      { zh: '不是 Hoppscotch 的集合或环境文件', en: 'Not a Hoppscotch collection or environment' },
      { zh: '在他们的集合菜单选「Export collection」，环境用「Export as JSON」', en: 'Use “Export collection” on a collection, or “Export as JSON” on an environment' },
    );
  }
  return { collections, environments, ignored: [...notes] };
}

function hopHeader(row: WbHeaderRow): Dict {
  return { key: row.key, value: row.value, active: row.enabled };
}

function hopVar(row: WbVar): Dict {
  // 密钥变量按他们自己的做法留空值（v1→v2 迁移就是这么做的），快照里不该带出真实密钥。
  const value = row.secret === true ? '' : row.value;
  return { key: row.key, initialValue: value, currentValue: value, secret: row.secret === true };
}

function hopAuth(auth: WbAuth): Dict {
  if (auth.type === 'basic') return { authType: 'basic', authActive: true, username: auth.username ?? '', password: auth.password ?? '' };
  if (auth.type === 'bearer') return { authType: 'bearer', authActive: true, token: auth.token ?? '' };
  if (auth.type === 'oauth2') {
    return {
      authType: 'oauth-2',
      authActive: true,
      token: auth.accessToken ?? '',
      oidcDiscoveryURL: '',
      authURL: auth.authUrl ?? '',
      accessTokenURL: auth.tokenUrl ?? '',
      clientID: auth.clientId ?? '',
      scope: auth.scope ?? '',
    };
  }
  if (auth.type === 'api-key') {
    return {
      authType: 'api-key',
      authActive: true,
      key: auth.key ?? '',
      value: auth.value ?? '',
      addTo: auth.in === 'query' ? 'Query Params' : 'Headers',
    };
  }
  return { authType: 'none', authActive: true };
}

const HOP_CONTENT_TYPE: Record<string, string | null> = {
  json: 'application/json',
  text: 'text/plain',
  form: 'application/x-www-form-urlencoded',
};

function hopBody(body: WbBody): Dict {
  if (body.mode === 'multipart') {
    return {
      contentType: 'multipart/form-data',
      body: (body.multipart ?? []).map((part) => (part.type === 'file'
        ? { key: part.key, active: true, isFile: true, value: [null] }
        : { key: part.key, active: true, isFile: false, value: part.value })),
    };
  }
  if (body.mode === 'none' || !body.text) return { contentType: null, body: null };
  return { contentType: HOP_CONTENT_TYPE[body.mode] ?? 'text/plain', body: body.text };
}

function hopRequest(request: WbRequest): Dict {
  const base = {
    name: request.name,
    headers: request.headers.map(hopHeader),
    auth: hopAuth(request.auth),
    preRequestScript: request.preScript ?? '',
    testScript: request.testScript ?? '',
  };
  if (request.body.mode === 'graphql') {
    return {
      v: 1,
      ...base,
      url: request.url,
      query: request.body.graphql?.query ?? '',
      variables: request.body.graphql?.variables ?? '',
      ...(request.body.graphql?.operationName ? { operationName: request.body.graphql.operationName } : {}),
    };
  }
  return {
    v: '1',
    ...base,
    method: request.customMethod?.trim() || request.method,
    // 他们的 params 数组与 endpoint 是分开的两份，URL 里再留一份查询串就会被算两遍。
    endpoint: splitQuery(request.url).base,
    params: (request.params?.length ? request.params : paramsFromQuery(splitQuery(request.url).query)).map((row) => ({
      key: row.key,
      value: row.value,
      active: row.enabled,
    })),
    body: hopBody(request.body),
  };
}

function hopFolder(folder: WbFolder): Dict {
  return {
    v: 12,
    name: folder.name,
    headers: [],
    auth: { authType: 'none', authActive: true },
    variables: [],
    description: null,
    preRequestScript: '',
    testScript: '',
    folders: folder.folders.map(hopFolder),
    requests: folder.requests.map(hopRequest),
  };
}

function hopCollection(collection: WbCollection): Dict {
  return {
    ...hopFolder(collection.root),
    name: collection.name,
    variables: collection.variables.map(hopVar),
  };
}

/** 工作台集合 → Hoppscotch v12 集合对象数组（在他们的 Import from JSON 里可直接粘）。 */
export function exportHoppscotchCollections(collections: WbCollection[]): string {
  return JSON.stringify(collections.map(hopCollection), null, 2);
}

/** 工作台环境 → Hoppscotch v2 环境对象数组（`{name, variables}` 那一种导出形状）。 */
export function exportHoppscotchEnvironments(environments: WbEnvironment[]): string {
  return JSON.stringify(
    environments.map((env) => ({ v: 2, name: env.name, variables: env.variables.map(hopVar) })),
    null,
    2,
  );
}
