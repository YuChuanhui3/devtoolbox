import { ToolError } from '../errors';
import { MAX_BODY_LENGTH, MAX_MOCK_ROUTES } from './store';
import { interpolate } from './vars';
import type { RandomFn } from './id';
import type { WbMockMethod, WbMockRoute, WorkbenchDoc } from './types';

/** 按 `/` 切段；忽略 query、host 与多余尾斜杠。 */
export function pathSegments(path: string): string[] {
  const beforeQuery = path.split('?')[0].split('#')[0];
  const withoutEdgeSlashes = beforeQuery.replace(/^\/+/, '').replace(/\/+$/, '');
  return withoutEdgeSlashes ? withoutEdgeSlashes.split('/') : [];
}

/** 段打分：静态 3 分、`:param` 2 分、`*` 1 分；不匹配返回 null。 */
function scoreSegments(routeSegs: string[], requestSegs: string[]): { score: number; params: Record<string, string> } | null {
  const params: Record<string, string> = {};
  let score = 0;
  for (let i = 0; i < routeSegs.length; i += 1) {
    const seg = routeSegs[i];
    if (seg === '*') {
      score += 1;
      continue;
    }
    const value = requestSegs[i];
    if (value === undefined) return null;
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = decodeURIComponent(value);
      score += 2;
      continue;
    }
    if (seg !== value) return null;
    score += 3;
  }
  const extraSegments = requestSegs.length - routeSegs.length;
  if (extraSegments <= 0) return { score, params };
  // 请求比路由多出的段：只有通配段能吃掉尾部（每个通配段可覆盖多段），否则不匹配。
  return routeSegs.includes('*') ? { score, params } : null;
}

/** method 精确匹配优先；精确无命中时退回声明在前的 `'*'` 路由；全部落空返回 null。 */
export function matchMockRoute(
  routes: WbMockRoute[],
  method: string,
  pathname: string,
): { route: WbMockRoute; params: Record<string, string> } | null {
  const segs = pathSegments(pathname);
  const find = (candidates: WbMockRoute[], candidateMethod: WbMockMethod) => {
    let best: { route: WbMockRoute; params: Record<string, string>; score: number } | null = null;
    for (const route of candidates) {
      if (!route.enabled || route.method !== candidateMethod) continue;
      const scored = scoreSegments(pathSegments(route.path), segs);
      if (!scored) continue;
      // 平分取先声明：只在严格更高分时替换。
      if (!best || scored.score > best.score) best = { route, params: scored.params, score: scored.score };
    }
    return best;
  };
  const exact = find(routes, method.toUpperCase() as WbMockMethod);
  if (exact) return { route: exact.route, params: exact.params };
  const any = find(routes, '*');
  if (any) return { route: any.route, params: any.params };
  return null;
}

export interface MockRenderContext {
  params: Record<string, string>;
  rand?: RandomFn;
  now?: number;
}

/** 渲染响应体模板：`{{params.x}}` 与 `{{$uuid}}` 等内置变量。 */
export function renderMockBody(route: WbMockRoute, ctx: MockRenderContext): { text: string; missing: string[] } {
  const scope: Record<string, string> = {};
  for (const [key, value] of Object.entries(ctx.params)) scope[`params.${key}`] = value;
  return interpolate(route.body, scope, ctx.rand, ctx.now);
}

export interface MockSnapshotRoute {
  method: WbMockMethod;
  path: string;
  status: number;
  headers: [string, string][];
  body: string;
  delayMs: number;
  note?: string;
}

export interface MockSnapshot {
  mockSnapshot: 1;
  name: string;
  createdAt: string;
  routes: MockSnapshotRoute[];
}

/** 导出可部署快照：只含启用的路由，不携带 id 与本机的开关节奏。 */
export function buildMockSnapshot(doc: WorkbenchDoc, name: string): MockSnapshot {
  return {
    mockSnapshot: 1,
    name,
    createdAt: new Date().toISOString(),
    routes: doc.mockRoutes
      .filter((route) => route.enabled)
      .map((route) => ({
        method: route.method,
        path: route.path,
        status: route.status,
        headers: route.headers.filter(([k]) => k.trim() !== ''),
        body: route.body,
        delayMs: route.delayMs,
        ...(route.note ? { note: route.note } : {}),
      })),
  };
}

function isSnapshotRoute(value: unknown): value is MockSnapshotRoute {
  if (typeof value !== 'object' || value === null) return false;
  const route = value as Record<string, unknown>;
  const methodOk = typeof route.method === 'string' && (route.method === '*' || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(route.method as string));
  const headersOk = Array.isArray(route.headers) && route.headers.every((h) => Array.isArray(h) && h.length === 2 && typeof h[0] === 'string' && typeof h[1] === 'string');
  return (
    methodOk &&
    typeof route.path === 'string' &&
    typeof route.status === 'number' &&
    Number.isInteger(route.status) &&
    route.status >= 100 &&
    route.status <= 599 &&
    headersOk &&
    typeof route.body === 'string' &&
    typeof route.delayMs === 'number' &&
    Number.isFinite(route.delayMs)
  );
}

/** 解析 Worker 侧快照：脏数据抛 ToolError，不静默降级，方便部署前排错。 */
export function parseMockSnapshot(raw: string): MockSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ToolError({ zh: '快照不是合法 JSON', en: 'Snapshot is not valid JSON' });
  }
  if (typeof parsed !== 'object' || parsed === null) throw new ToolError({ zh: '快照格式错误', en: 'Snapshot has wrong shape' });
  const doc = parsed as Record<string, unknown>;
  if (doc.mockSnapshot !== 1 || !Array.isArray(doc.routes)) {
    throw new ToolError(
      { zh: '不是 API 工作台 mock 快照', en: 'Not an API workbench mock snapshot' },
      { zh: '请在 mock 页签点「导出快照」后原样粘贴其 JSON', en: 'Export the JSON from the Mock tab\'s snapshot export and paste it unchanged' },
    );
  }
  const routes = doc.routes.filter(isSnapshotRoute).slice(0, MAX_MOCK_ROUTES).map((route) => ({
    method: route.method,
    path: route.path.slice(0, 2000),
    status: route.status,
    headers: route.headers.slice(0, 64) as [string, string][],
    body: route.body.slice(0, MAX_BODY_LENGTH),
    delayMs: Math.min(Math.max(route.delayMs, 0), 60000),
    ...(route.note ? { note: route.note.slice(0, 200) } : {}),
  }));
  return {
    mockSnapshot: 1,
    name: typeof doc.name === 'string' ? doc.name.slice(0, 100) : 'mock',
    createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : new Date().toISOString(),
    routes,
  };
}
