import { describe, expect, test } from 'vitest';
import { ToolError } from '../errors';
import { buildMockSnapshot, matchMockRoute, parseMockSnapshot, pathSegments, renderMockBody } from './mock';
import { emptyWorkbench } from './store';
import type { WbMockRoute } from './types';

function route(partial: Partial<WbMockRoute> = {}): WbMockRoute {
  return {
    id: partial.id ?? 'r',
    enabled: true,
    method: 'GET',
    path: '/users',
    status: 200,
    headers: [],
    body: '{}',
    delayMs: 0,
    ...partial,
  };
}

describe('matchMockRoute', () => {
  test('静态段精确命中', () => {
    const hit = matchMockRoute([route()], 'GET', '/users');
    expect(hit?.route.id).toBe('r');
    expect(hit?.params).toEqual({});
  });

  test(':param 捕获并解码', () => {
    const hit = matchMockRoute([route({ path: '/users/:id' })], 'GET', '/users/%E4%B8%AD');
    expect(hit?.params).toEqual({ id: '中' });
  });

  test('静态优先于 :param，:param 优先于 *', () => {
    const staticRoute = route({ id: 's', path: '/users/me' });
    const paramRoute = route({ id: 'p', path: '/users/:id' });
    const wildcardRoute = route({ id: 'w', path: '/users/*' });
    expect(matchMockRoute([wildcardRoute, paramRoute, staticRoute], 'GET', '/users/me')?.route.id).toBe('s');
    expect(matchMockRoute([wildcardRoute, paramRoute], 'GET', '/users/7')?.route.id).toBe('p');
    expect(matchMockRoute([wildcardRoute], 'GET', '/users/7/posts')?.route.id).toBe('w');
  });

  test('平分取先声明', () => {
    const first = route({ id: 'a', path: '/x/:y' });
    const second = route({ id: 'b', path: '/x/:z' });
    expect(matchMockRoute([first, second], 'GET', '/x/1')?.route.id).toBe('a');
  });

  test('禁用路由不参与匹配', () => {
    expect(matchMockRoute([route({ enabled: false })], 'GET', '/users')).toBeNull();
  });

  test('method 精确优先，* 兜底', () => {
    const anyRoute = route({ id: 'any', method: '*' });
    const postRoute = route({ id: 'post', method: 'POST' });
    expect(matchMockRoute([anyRoute, postRoute], 'post', '/users')?.route.id).toBe('post');
    expect(matchMockRoute([anyRoute, postRoute], 'DELETE', '/users')?.route.id).toBe('any');
  });

  test('忽略 query、尾斜杠与大小写以外的差异', () => {
    const hit = matchMockRoute([route({ path: '/users/' })], 'GET', '/users?page=2');
    expect(hit?.route.id).toBe('r');
  });

  test('无匹配返回 null', () => {
    expect(matchMockRoute([route({ path: '/orders' })], 'GET', '/users')).toBeNull();
    expect(matchMockRoute([route({ path: '/users/:id' })], 'GET', '/users/1/posts')).toBeNull();
  });

  test('pathSegments 处理根路径', () => {
    expect(pathSegments('/')).toEqual([]);
    expect(pathSegments('')).toEqual([]);
    expect(pathSegments('/a/b?x=1#h')).toEqual(['a', 'b']);
  });
});

describe('renderMockBody', () => {
  test('params 与内置变量模板', () => {
    const rendered = renderMockBody(route({ body: '{"id":"{{params.id}}","n":1}' }), {
      params: { id: '42' },
    });
    expect(rendered.text).toBe('{"id":"42","n":1}');
    expect(rendered.missing).toEqual([]);
  });

  test('未提供的 params 记为 missing 并原样保留', () => {
    const rendered = renderMockBody(route({ body: '{{params.x}}' }), { params: {} });
    expect(rendered.text).toBe('{{params.x}}');
    expect(rendered.missing).toEqual(['params.x']);
  });

  test('内置变量可渲染，timestamp 用注入的 now', () => {
    const rendered = renderMockBody(route({ body: '{{$uuid}}|{{$timestamp}}' }), {
      params: {},
      now: 1700000000000,
    });
    expect(rendered.text).toMatch(/^[0-9a-f-]{36}\|1700000000000$/);
  });
});

describe('mock snapshot', () => {
  test('build 只保留启用路由与干净 header', () => {
    const doc = {
      ...emptyWorkbench(),
      mockRoutes: [
        route({ id: '1', path: '/a', headers: [['', ''], ['X-A', '1']] }),
        route({ id: '2', enabled: false, path: '/b' }),
      ],
    };
    const snapshot = buildMockSnapshot(doc, 'demo');
    expect(snapshot.mockSnapshot).toBe(1);
    expect(snapshot.name).toBe('demo');
    expect(snapshot.routes).toHaveLength(1);
    expect(snapshot.routes[0].headers).toEqual([['X-A', '1']]);
    expect(snapshot.routes[0]).not.toHaveProperty('id');
  });

  test('parse 接受合法快照并回填缺省', () => {
    const snapshot = parseMockSnapshot(JSON.stringify({ mockSnapshot: 1, routes: [{ method: 'GET', path: '/a', status: 201, headers: [], body: 'x', delayMs: 5 }] }));
    expect(snapshot.name).toBe('mock');
    expect(snapshot.routes[0].body).toBe('x');
  });

  test('parse 拒绝非法输入', () => {
    expect(() => parseMockSnapshot('not json')).toThrow(ToolError);
    expect(() => parseMockSnapshot('{"foo":1}')).toThrow(ToolError);
    expect(() => parseMockSnapshot(JSON.stringify({ mockSnapshot: 1, routes: 'x' }))).toThrow(ToolError);
  });

  test('parse 丢弃脏路由并裁剪超限', () => {
    const routes = Array.from({ length: 260 }, (_, i) => ({
      method: 'GET',
      path: `/r${i}`,
      status: 200,
      headers: [],
      body: 'b'.repeat(300_000),
      delayMs: -3,
    }));
    const snapshot = parseMockSnapshot(JSON.stringify({ mockSnapshot: 1, routes: [...routes, { method: 'TELEPORT', path: '/x', status: 200, headers: [], body: '', delayMs: 0 }] }));
    expect(snapshot.routes).toHaveLength(200);
    expect(snapshot.routes[0].body).toHaveLength(200_000);
    expect(snapshot.routes[0].delayMs).toBe(0);
  });

  test('build∘parse 往返保持语义', () => {
    const doc = { ...emptyWorkbench(), mockRoutes: [route({ path: '/users/:id', body: '{"id":"{{params.id}}"}', headers: [['X-T', '1']], note: 'n' })] };
    const round = parseMockSnapshot(JSON.stringify(buildMockSnapshot(doc, 'rt')));
    expect(round.routes[0].path).toBe('/users/:id');
    expect(round.routes[0].note).toBe('n');
  });
});
