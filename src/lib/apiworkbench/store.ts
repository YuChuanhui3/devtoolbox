import { readStorage, writeStorage } from '../storage';
import { MAX_SOCKETS, MAX_WS_URL_LENGTH } from './ws';
import { WB_METHODS, WORKBENCH_VERSION } from './types';
import type {
  WbAuth,
  WbBody,
  WbBodyMode,
  WbCollection,
  WbEnvironment,
  WbFolder,
  WbHeaderRow,
  WbHistoryEntry,
  WbMethod,
  WbMockRoute,
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
const MAX_FOLDER_DEPTH = 10;

const BODY_MODES: WbBodyMode[] = ['none', 'json', 'text', 'form'];

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

function sanitizeAuth(raw: unknown): WbAuth {
  if (typeof raw !== 'object' || raw === null) return { type: 'none' };
  const a = raw as Partial<WbAuth>;
  if (a.type === 'basic' || a.type === 'bearer') {
    return { type: a.type, username: str(a.username), password: str(a.password), token: str(a.token) };
  }
  return { type: 'none' };
}

function sanitizeBody(raw: unknown): WbBody {
  if (typeof raw !== 'object' || raw === null) return { mode: 'none', text: '' };
  const b = raw as Partial<WbBody>;
  const mode = BODY_MODES.includes(b.mode as WbBodyMode) ? (b.mode as WbBodyMode) : 'none';
  return { mode, text: str(b.text).slice(0, MAX_BODY_LENGTH) };
}

function sanitizeRequest(raw: unknown): WbRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<WbRequest>;
  if (typeof r.url !== 'string') return null;
  const method = WB_METHODS.includes(r.method as WbMethod) ? (r.method as WbMethod) : 'GET';
  return {
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
  return { id: str(e.id), name: str(e.name) || 'Environment', variables: sanitizeVars(e.variables) };
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
  const via = h.via;
  return {
    id: str(h.id),
    at: num(h.at),
    request,
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
    ? doc.environments.map(sanitizeEnvironment).filter((e): e is WbEnvironment => e !== null)
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
