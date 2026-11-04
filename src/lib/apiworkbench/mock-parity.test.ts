import { describe, expect, test, vi } from 'vitest';
import { matchMockRoute, parseMockSnapshot, renderMockBody } from './mock';
import type { WbMockRoute } from './types';

// worker 与 preview 共用的 JS 核心：与 lib 版逐案例对照，防两套实现漂移。
const worker = await vi.importActual<{
  matchRoute: (
    routes: unknown[],
    method: string,
    pathname: string,
  ) => { route: { id: string; status?: number }; params: Record<string, string> } | null;
  renderBody: (body: string, params: Record<string, string>, now: number) => string;
  parseConfig: (raw: string) => { name: string; routes: unknown[] };
}>('../../../workers/api-mock/src/mock-core.js');

function route(partial: Partial<WbMockRoute> = {}): WbMockRoute {
  return { id: 'r', enabled: true, method: 'GET', path: '/x', status: 200, headers: [], body: '', delayMs: 0, ...partial };
}

const CASES: Array<{ routes: WbMockRoute[]; method: string; path: string }> = [
  { routes: [route({ id: 'a', path: '/users' })], method: 'GET', path: '/users' },
  { routes: [route({ id: 'w', path: '/users/*' }), route({ id: 'p', path: '/users/:id' }), route({ id: 's', path: '/users/me' })], method: 'GET', path: '/users/me' },
  { routes: [route({ id: 'w', path: '/users/*' }), route({ id: 'p', path: '/users/:id' })], method: 'GET', path: '/users/7' },
  { routes: [route({ id: 'p', path: '/users/:id' })], method: 'GET', path: '/users/%E4%B8%AD' },
  { routes: [route({ id: 'off', enabled: false }), route({ id: 'any', method: '*' })], method: 'POST', path: '/x' },
  { routes: [route({ id: 'post', method: 'POST' }), route({ id: 'any', method: '*' })], method: 'post', path: '/x' },
  { routes: [route({ id: 'deep', path: '/a/:b/c' })], method: 'GET', path: '/a/1/c?query=1' },
  { routes: [route({ id: 'trail', path: '/a/b/' })], method: 'GET', path: '/a/b' },
  { routes: [route({ id: 'tie1', path: '/x/:y' }), route({ id: 'tie2', path: '/x/:z' })], method: 'GET', path: '/x/1' },
  { routes: [route({ id: 'miss', path: '/other' })], method: 'GET', path: '/users' },
  { routes: [route({ id: 'multi', path: '/files/*' })], method: 'GET', path: '/files/a/b/c' },
];

describe('api-mock worker 与 lib 算法对照', () => {
  test.each(CASES.map((c, index) => [index, c] as const))('案例 %i 命中一致', (_i, case_) => {
    const lib = matchMockRoute(case_.routes, case_.method, case_.path);
    const workerHit = worker.matchRoute(case_.routes, case_.method, case_.path);
    if (!lib || !workerHit) {
      expect(workerHit).toBe(lib);
      return;
    }
    expect(workerHit.route.id).toBe(lib.route.id);
    expect(workerHit.params).toEqual(lib.params);
  });

  test('模板渲染与 lib 一致（uuid 各自随机，其余逐字对照）', () => {
    const now = 1700000000000;
    const body = '{"id":"{{params.id}}","u":"{{$uuid}}","t":"{{$timestamp}}","r":"{{$randomInt(1,1)}}","m":"{{unknown}}","x":"{{params.missing}}"}';
    const params = { id: '42' };
    const workerText = worker.renderBody(body, params, now);
    const libText = renderMockBody(route({ body }), { params, now }).text;
    const extract = (text: string) => text.match(/"u":"([^"]+)"/)?.[1] ?? '';
    expect(extract(workerText)).toMatch(/^[0-9a-f-]{36}$/);
    expect(extract(libText)).toMatch(/^[0-9a-f-]{36}$/);
    expect(workerText.replace(extract(workerText), 'X')).toBe(libText.replace(extract(libText), 'X'));
  });

  test('worker parseConfig 吃 lib 导出的快照', () => {
    const snapshot = JSON.stringify({
      mockSnapshot: 1,
      name: 'rt',
      routes: [{ method: 'GET', path: '/users/:id', status: 201, headers: [['X-A', '1']], body: '{}', delayMs: 5 }],
    });
    const parsed = parseMockSnapshot(snapshot);
    const config = worker.parseConfig(JSON.stringify(parsed));
    expect(config.name).toBe('rt');
    const hit = worker.matchRoute(config.routes, 'GET', '/users/9');
    expect(hit?.route.status).toBe(201);
    expect(hit?.params).toEqual({ id: '9' });
  });
});
