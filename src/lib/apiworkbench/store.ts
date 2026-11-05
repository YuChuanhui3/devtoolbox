import { readStorage, writeStorage } from '../storage';
import { MAX_SOCKETS, MAX_WS_URL_LENGTH } from './ws';
import { CUSTOM_METHOD_PATTERN, WB_METHODS, WORKBENCH_VERSION } from './types';
import type {
  WbAuth,
  WbBody,
  WbBodyMode,
  WbCollection,
  WbEnvironment,
  WbFolder,
  WbGraphql,
  WbHeaderRow,
  WbHistoryEntry,
  WbMethod,
  WbMockRoute,
  WbParam,
  WbPart,
  WbRequest,
  WbSocket,
  WbVar,
  WorkbenchDoc,
} from './types';

export const WORKBENCH_STORAGE_KEY = 'devtoolbox-apiworkbench';
export const MAX_COLLECTIONS = 50;
export const MAX_REQUESTS_TOTAL = 800;
export const MAX_BODY_LENGTH = 200_000;
export const MAX_MOCK_ROUTES = 200;
export const MAX_HISTORY_ENTRIES = 100;
export const MAX_HISTORY_EXCERPT = 4_000;
export const MAX_TOTAL_CHARS = 3_000_000;
export const MAX_PARAMS = 200;
export const MAX_PARTS = 100;
export const MAX_SCRIPT_CHARS = 65_536;
const MAX_AUTH_URL_LENGTH = 2_000;
/** 历史条目内嵌整个请求，正文只保留可重放的量级，避免吃穿 MAX_TOTAL_CHARS 后静默丢历史。 */
export const MAX_HISTORY_BODY = 20_000;
const MAX_FOLDER_DEPTH = 10;

const BODY_MODES: WbBodyMode[] = ['none', 'json', 'text', 'form', 'multipart', 'graphql'];
const AUTH_TYPES: WbAuth['type'][] = ['none', 'basic', 'bearer', 'api-key', 'oauth2'];

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function sanitizeVar(raw: unknown): WbVar | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const v = raw as Partial<WbVar>;
  if (typeof v.key !== 'string' || !v.key.trim()) return null;
  return {
    id: str(v.id) || v.key.trim(),
    key: v.key.trim(),
    value: str(v.value),
    enabled: bool(v.enabled, true),
    secret: typeof v.secret === 'boolean' ? v.secret : undefined,
  };
}

const sanitizeVars = (raw: unknown): WbVar[] =>
  Array.isArray(raw) ? raw.map(sanitizeVar).filter((v): v is WbVar => v !== null) : [];

function sanitizeHeaderRow(raw: unknown): WbHeaderRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const h = raw as Partial<WbHeaderRow>;
  if (typeof h.key !== 'string') return null;
  return { key: h.key, value: str(h.value), enabled: bool(h.enabled, true) };
}

function sanitizeParam(raw: unknown): WbParam | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Partial<WbParam>;
  if (typeof p.key !== 'string') return null;
  return {
    key: p.key,
    value: str(p.value),
    enabled: bool(p.enabled, true),
    description: typeof p.description === 'string' && p.description ? p.description : undefined,
  };
}

function sanitizePart(raw: unknown): WbPart | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Partial<WbPart>;
  if (typeof p.key !== 'string') return null;
  const type = p.type === 'file' ? 'file' : 'text';
  // 文件字节从来不进存储，只留元数据。
  return {
    key: p.key,
    type,
    value: str(p.value),
    fileName: type === 'file' ? str(p.fileName).slice(0, 200) || undefined : undefined,
    fileSize: type === 'file' && typeof p.fileSize === 'number' && p.fileSize >= 0 ? Math.round(p.fileSize) : undefined,
    mime: type === 'file' ? str(p.mime).slice(0, 100) || undefined : undefined,
    fileRef: type === 'file' ? str(p.fileRef).slice(0, 64) || undefined : undefined,
  };
}

function sanitizeGraphql(raw: unknown): WbGraphql | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const g = raw as Partial<WbGraphql>;
  const query = str(g.query);
  if (!query.trim()) return null;
  return {
    query: query.slice(0, MAX_BODY_LENGTH),
    variables: str(g.variables).slice(0, MAX_BODY_LENGTH),
    operationName: str(g.operationName).slice(0, 200) || undefined,
  };
}

function sanitizeAuth(raw: unknown): WbAuth {
  if (typeof raw !== 'object' || raw === null) return { type: 'none' };
  const a = raw as Partial<WbAuth>;
  const type = AUTH_TYPES.includes(a.type as WbAuth['type']) ? (a.type as WbAuth['type']) : 'none';
  if (type === 'basic' || type === 'bearer') {
    return { type, username: str(a.username), password: str(a.password), token: str(a.token) };
  }
  if (type === 'api-key') {
    return {
      type,
      in: a.in === 'query' ? 'query' : 'header',
      key: str(a.key).slice(0, 200),
      value: str(a.value).slice(0, MAX_BODY_LENGTH),
      headerPrefix: str(a.headerPrefix).slice(0, 40) || undefined,
    };
  }
  if (type === 'oauth2') {
    const grantType = a.grantType === 'password' || a.grantType === 'authorization_code' ? a.grantType : 'client_credentials';
    const accessToken = str(a.accessToken).slice(0, MAX_BODY_LENGTH);
    return {
      type,
      grantType,
      authUrl: str(a.authUrl).slice(0, MAX_AUTH_URL_LENGTH),
      tokenUrl: str(a.tokenUrl).slice(0, MAX_AUTH_URL_LENGTH),
      clientId: str(a.clientId).slice(0, 500),
      clientSecret: str(a.clientSecret).slice(0, MAX_BODY_LENGTH) || undefined,
      scope: str(a.scope).slice(0, 500) || undefined,
      redirectUri: str(a.redirectUri).slice(0, MAX_AUTH_URL_LENGTH) || undefined,
      accessToken: accessToken || undefined,
      tokenType: str(a.tokenType).slice(0, 40) || undefined,
      expiresAt: typeof a.expiresAt === 'number' && a.expiresAt > 0 ? Math.round(a.expiresAt) : undefined,
    };
  }
  return { type: 'none' };
}

function sanitizeBody(raw: unknown): WbBody {
  if (typeof raw !== 'object' || raw === null) return { mode: 'none', text: '' };
  const b = raw as Partial<WbBody>;
  const mode = BODY_MODES.includes(b.mode as WbBodyMode) ? (b.mode as WbBodyMode) : 'none';
  const body: WbBody = { mode, text: str(b.text).slice(0, MAX_BODY_LENGTH) };
  const parts = Array.isArray(b.multipart)
    ? b.multipart.slice(0, MAX_PARTS).map(sanitizePart).filter((p): p is WbPart => p !== null)
    : [];
  // 空集合不落盘，v1 存档往返后保持逐字节不变。
  if (parts.length) body.multipart = parts;
  const graphql = sanitizeGraphql(b.graphql);
  if (graphql) body.graphql = graphql;
  return body;
}

function sanitizeRequest(raw: unknown): WbRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<WbRequest>;
  if (typeof r.url !== 'string') return null;
  const method = WB_METHODS.includes(r.method as WbMethod) ? (r.method as WbMethod) : 'GET';
  const request: WbRequest = {
    id: str(r.id),
    name: str(r.name) || r.url.slice(0, 60) || 'Request',
    method,
    url: r.url,
    headers: Array.isArray(r.headers)
      ? r.headers.map(sanitizeHeaderRow).filter((h): h is WbHeaderRow => h !== null)
      : [],
    body: sanitizeBody(r.body),
    auth: sanitizeAuth(r.auth),
  };
  if (typeof r.customMethod === 'string' && CUSTOM_METHOD_PATTERN.test(r.customMethod.trim())) {
    request.customMethod = r.customMethod.trim();
  }
  const params = Array.isArray(r.params)
    ? r.params.slice(0, MAX_PARAMS).map(sanitizeParam).filter((p): p is WbParam => p !== null)
    : [];
  if (params.length) request.params = params;
  for (const key of ['preScript', 'testScript'] as const) {
    const script = typeof r[key] === 'string' ? r[key].slice(0, MAX_SCRIPT_CHARS) : '';
    if (script) request[key] = script;
  }
  return request;
}

/** 历史里的请求副本不留脚本，正文降到够重放即可；multipart 只存元数据，无需再裁。 */
function trimRequestForHistory(request: WbRequest): { request: WbRequest; trimmed?: boolean } {
  const text = request.body.text.slice(0, MAX_HISTORY_BODY);
  const query = request.body.graphql ? request.body.graphql.query.slice(0, MAX_HISTORY_BODY) : '';
  const body: WbBody = {
    ...request.body,
    text,
    ...(request.body.graphql ? { graphql: { ...request.body.graphql, query } } : {}),
  };
  const trimmed =
    text.length !== request.body.text.length ||
    query.length !== (request.body.graphql?.query.length ?? 0) ||
    Boolean(request.preScript || request.testScript);
  const { preScript: _pre, testScript: _test, ...rest } = request;
  return { request: { ...rest, body }, trimmed: trimmed || undefined };
}

function sanitizeFolder(raw: unknown, depth: number): WbFolder | null {
  if (depth > MAX_FOLDER_DEPTH || typeof raw !== 'object' || raw === null) return null;
  const f = raw as Partial<WbFolder>;
  return {
    id: str(f.id),
    name: str(f.name) || 'Folder',
    folders: Array.isArray(f.folders)
      ? f.folders.map((c) => sanitizeFolder(c, depth + 1)).filter((c): c is WbFolder => c !== null)
      : [],
    requests: Array.isArray(f.requests)
      ? f.requests.map(sanitizeRequest).filter((r): r is WbRequest => r !== null)
      : [],
  };
}

function sanitizeCollection(raw: unknown): WbCollection | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Partial<WbCollection>;
  const root = sanitizeFolder(c.root, 0);
  if (!root) return null;
  return {
    id: str(c.id),
    name: str(c.name) || 'Collection',
    root,
    variables: sanitizeVars(c.variables),
    baseUrl: typeof c.baseUrl === 'string' && c.baseUrl ? c.baseUrl : undefined,
  };
}

function sanitizeEnvironment(raw: unknown): WbEnvironment | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Partial<WbEnvironment>;
  const env: WbEnvironment = { id: str(e.id), name: str(e.name) || 'Environment', variables: sanitizeVars(e.variables) };
  if (typeof e.inheritId === 'string' && e.inheritId && e.inheritId !== e.id) env.inheritId = e.inheritId;
  return env;
}

/** 继承链展平（自己在最前、被继承者依次在后），指向不存在的环境或成环则截断。 */
export function envInheritanceChain(environments: WbEnvironment[], id: string): WbEnvironment[] {
  const byId = new Map(environments.map((e) => [e.id, e]));
  const chain: WbEnvironment[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = current.inheritId ? byId.get(current.inheritId) : undefined;
  }
  return chain;
}

/** 丢掉指向不存在环境的 inheritId；成环由 envInheritanceChain 的 seen 集合天然截断。 */
function resolveInheritIds(environments: WbEnvironment[]): WbEnvironment[] {
  const ids = new Set(environments.map((e) => e.id));
  return environments.map((e) => (e.inheritId && !ids.has(e.inheritId) ? { ...e, inheritId: undefined } : e));
}

function sanitizeMockRoute(raw: unknown): WbMockRoute | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<WbMockRoute>;
  if (typeof r.path !== 'string' || !r.path.trim()) return null;
  const method = r.method === '*' || WB_METHODS.includes(r.method as WbMethod) ? (r.method as WbMockRoute['method']) : 'GET';
  return {
    id: str(r.id),
    enabled: bool(r.enabled, true),
    method,
    path: r.path.trim(),
    status: Math.round(num(r.status, 200)),
    headers: Array.isArray(r.headers)
      ? r.headers.flatMap((h): [string, string][] =>
          Array.isArray(h) && h.length >= 2 ? [[str(h[0]), str(h[1])]] : [],
        )
      : [],
    body: str(r.body).slice(0, MAX_BODY_LENGTH),
    delayMs: Math.max(0, Math.round(num(r.delayMs))),
    note: typeof r.note === 'string' ? r.note : undefined,
  };
}

function sanitizeSocket(raw: unknown): WbSocket | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Partial<WbSocket>;
  if (typeof s.url !== 'string' || !s.url.trim()) return null;
  const url = s.url.trim().slice(0, MAX_WS_URL_LENGTH);
  return {
    id: str(s.id),
    name: (str(s.name).trim() || url).slice(0, 120),
    url,
    protocols: Array.isArray(s.protocols)
      ? [...new Set(s.protocols.map((p) => str(p).trim()).filter(Boolean))].slice(0, 8)
      : [],
    note: typeof s.note === 'string' ? s.note : undefined,
  };
}

function sanitizeHistoryEntry(raw: unknown): WbHistoryEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const h = raw as Partial<WbHistoryEntry>;
  const request = sanitizeRequest(h.request);
  if (!request) return null;
  const trimmed = trimRequestForHistory(request);
  const via = h.via;
  return {
    id: str(h.id),
    at: num(h.at),
    request: trimmed.request,
    requestTrimmed: trimmed.trimmed,
    status: Math.round(num(h.status)),
    ms: Math.round(num(h.ms)),
    bytes: Math.round(num(h.bytes)),
    bodyExcerpt: str(h.bodyExcerpt).slice(0, MAX_HISTORY_EXCERPT),
    via: via === 'mock' || via === 'corsproxy' || via === 'allorigins' || via === 'direct' ? via : 'direct',
  };
}

export function countRequests(root: WbFolder): number {
  return root.requests.length + root.folders.reduce((sum, f) => sum + countRequests(f), 0);
}

/** 逐级限额：集合数、请求总数、mock 路由数、历史条数。 */
function applyLimits(doc: WorkbenchDoc): WorkbenchDoc {
  let budget = MAX_REQUESTS_TOTAL;
  const collections: WbCollection[] = [];
  for (let collection of doc.collections) {
    if (collections.length >= MAX_COLLECTIONS || budget <= 0) break;
    if (countRequests(collection.root) > budget) {
      collection = { ...collection, root: pruneFolder(collection.root, { left: budget }) };
    }
    budget -= countRequests(collection.root);
    collections.push(collection);
  }
  return {
    ...doc,
    collections,
    mockRoutes: doc.mockRoutes.slice(0, MAX_MOCK_ROUTES),
    sockets: doc.sockets.slice(0, MAX_SOCKETS),
    history: doc.history.slice(0, MAX_HISTORY_ENTRIES),
  };
}

/** 深度优先保留前 left 个请求，其余丢弃。 */
function pruneFolder(folder: WbFolder, budget: { left: number }): WbFolder {
  const requests: WbRequest[] = [];
  for (const request of folder.requests) {
    if (budget.left <= 0) break;
    budget.left -= 1;
    requests.push(request);
  }
  return { ...folder, requests, folders: folder.folders.map((f) => pruneFolder(f, budget)) };
}

/** 总字符超限时先裁历史，再截请求体。 */
function fitTotalSize(doc: WorkbenchDoc): WorkbenchDoc {
  if (JSON.stringify(doc).length <= MAX_TOTAL_CHARS) return doc;
  const trimmed: WorkbenchDoc = { ...doc, history: doc.history.slice(0, 20) };
  if (JSON.stringify(trimmed).length <= MAX_TOTAL_CHARS) return trimmed;
  const noHistory: WorkbenchDoc = { ...trimmed, history: [] };
  if (JSON.stringify(noHistory).length <= MAX_TOTAL_CHARS) return noHistory;
  const shrinkFolder = (f: WbFolder): WbFolder => ({
    ...f,
    requests: f.requests.map((r) => ({ ...r, body: { ...r.body, text: r.body.text.slice(0, 4_000) } })),
    folders: f.folders.map(shrinkFolder),
  });
  return {
    ...noHistory,
    collections: noHistory.collections.map((c) => ({ ...c, root: shrinkFolder(c.root) })),
    mockRoutes: noHistory.mockRoutes.map((r) => ({ ...r, body: r.body.slice(0, 4_000) })),
  };
}

export function emptyWorkbench(): WorkbenchDoc {
  return {
    version: WORKBENCH_VERSION,
    collections: [],
    environments: [],
    activeEnvId: null,
    mockRoutes: [],
    mockEnabled: false,
    sockets: [],
    history: [],
  };
}

/** 永不 throw：脏字段逐项回退默认值，整体不是对象则返回空文档。 */
export function sanitizeWorkbench(raw: unknown): WorkbenchDoc {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return emptyWorkbench();
  const doc = raw as Partial<WorkbenchDoc>;
  const collections = Array.isArray(doc.collections)
    ? doc.collections.map(sanitizeCollection).filter((c): c is WbCollection => c !== null)
    : [];
  const environments = Array.isArray(doc.environments)
    ? resolveInheritIds(
        doc.environments.map(sanitizeEnvironment).filter((e): e is WbEnvironment => e !== null),
      )
    : [];
  const activeEnvId =
    typeof doc.activeEnvId === 'string' && environments.some((e) => e.id === doc.activeEnvId)
      ? doc.activeEnvId
      : null;
  const mockRoutes = Array.isArray(doc.mockRoutes)
    ? doc.mockRoutes.map(sanitizeMockRoute).filter((r): r is WbMockRoute => r !== null)
    : [];
  const history = Array.isArray(doc.history)
    ? doc.history.map(sanitizeHistoryEntry).filter((h): h is WbHistoryEntry => h !== null)
    : [];
  const sockets = Array.isArray(doc.sockets)
    ? doc.sockets.map(sanitizeSocket).filter((s): s is WbSocket => s !== null)
    : [];
  return applyLimits(fitTotalSize({
    version: WORKBENCH_VERSION,
    collections,
    environments,
    activeEnvId,
    mockRoutes,
    mockEnabled: bool(doc.mockEnabled),
    sockets,
    history,
  }));
}

export function loadWorkbench(): WorkbenchDoc {
  return sanitizeWorkbench(readStorage<unknown>(WORKBENCH_STORAGE_KEY, null));
}

/** false = 配额写入失败；调用方降级为内存态并提示。 */
export function saveWorkbench(doc: WorkbenchDoc): boolean {
  return writeStorage(WORKBENCH_STORAGE_KEY, fitTotalSize(sanitizeWorkbench(doc)));
}
