import { describe, expect, test } from 'vitest';
import { ToolError } from '../errors';
import type { ProxyRequestOptions, TimedResponse } from '../net';
import { sendWbRequest } from './send';
import { blankRequest } from './tree';
import type { WbMockRoute, WbRequest } from './types';

function mockRoute(partial: Partial<WbMockRoute> = {}): WbMockRoute {
  return {
    id: 'm1',
    enabled: true,
    method: 'GET',
    path: '/users/:id',
    status: 200,
    headers: [],
    body: '{"id":"{{params.id}}","at":{{$timestamp}}}',
    delayMs: 0,
    ...partial,
  };
}

function request(partial: Partial<WbRequest> = {}): WbRequest {
  return { ...blankRequest(), url: 'https://api.test/users/7', ...partial };
}

const ok = (text = 'real'): TimedResponse => ({ status: 200, ok: true, headers: [['x', '1']], text, bytes: text.length, ms: 12 });

describe('sendWbRequest', () => {
  test('mock 命中时零网络调用', async () => {
    let calls = 0;
    const response = await sendWbRequest(request(), {
      scope: {},
      mockEnabled: true,
      mockRoutes: [mockRoute()],
      mode: 'direct',
      fetcher: async () => {
        calls += 1;
        return ok();
      },
    });
    expect(calls).toBe(0);
    expect(response.via).toBe('mock');
    expect(response.ok).toBe(true);
    expect(response.text).toContain('"id":"7"');
    expect(response.headers[0]).toEqual(['Content-Type', 'application/json']);
  });

  test('未命中回落真实请求并标注 via=mode', async () => {
    const seen: ProxyRequestOptions[] = [];
    const response = await sendWbRequest(request({ url: 'https://api.test/orders' }), {
      scope: {},
      mockEnabled: true,
      mockRoutes: [mockRoute()],
      mode: 'corsproxy',
      fetcher: async (_target, options) => {
        seen.push(options);
        return ok('fell back');
      },
    });
    expect(response.via).toBe('corsproxy');
    expect(response.text).toBe('fell back');
    expect(seen[0].method).toBe('GET');
  });

  test('mockEnabled=false 时即使路径匹配也直接触网', async () => {
    let calls = 0;
    await sendWbRequest(request(), {
      scope: {},
      mockEnabled: false,
      mockRoutes: [mockRoute()],
      mode: 'direct',
      fetcher: async () => {
        calls += 1;
        return ok();
      },
    });
    expect(calls).toBe(1);
  });

  test('delayMs 走注入的 sleep，ms 至少等于延迟', async () => {
    const slept: number[] = [];
    const response = await sendWbRequest(request(), {
      scope: {},
      mockEnabled: true,
      mockRoutes: [mockRoute({ delayMs: 150 })],
      mode: 'direct',
      sleep: async (ms) => {
        slept.push(ms);
      },
      fetcher: async () => ok(),
    });
    expect(slept).toEqual([150]);
    expect(response.ms).toBeGreaterThanOrEqual(150);
  });

  test('缺失变量直接抛错且不触网', async () => {
    let calls = 0;
    await expect(
      sendWbRequest(request({ url: 'https://api.test/{{host}}/x' }), {
        scope: {},
        mockEnabled: false,
        mockRoutes: [],
        mode: 'direct',
        fetcher: async () => {
          calls += 1;
          return ok();
        },
      }),
    ).rejects.toBeInstanceOf(ToolError);
    expect(calls).toBe(0);
  });

  test('插值、auth 与 Content-Type 默认值传给 fetcher', async () => {
    let captured: { target: string; options: ProxyRequestOptions } | null = null;
    await sendWbRequest(
      request({
        method: 'POST',
        url: '{{base}}/users',
        headers: [{ key: 'X-Env', value: '{{env}}', enabled: true }, { key: 'Off', value: '1', enabled: false }],
        body: { mode: 'json', text: '{"name":"{{env}}"}' },
        auth: { type: 'bearer', token: 'tkn' },
      }),
      {
        scope: { base: 'https://api.test', env: 'staging' },
        mockEnabled: false,
        mockRoutes: [],
        mode: 'direct',
        fetcher: async (target, options) => {
          captured = { target, options };
          return ok();
        },
      },
    );
    expect(captured!.target).toBe('https://api.test/users');
    expect(captured!.options.headers).toEqual({
      'X-Env': 'staging',
      Authorization: 'Bearer tkn',
      'Content-Type': 'application/json',
    });
    expect(captured!.options.body).toBe('{"name":"staging"}');
  });

  test('GET 不带请求体，非 mock 状态码决定 ok', async () => {
    let captured: ProxyRequestOptions | null = null;
    const response = await sendWbRequest(request({ method: 'GET', body: { mode: 'json', text: '{"a":1}' } }), {
      scope: {},
      mockEnabled: false,
      mockRoutes: [],
      mode: 'direct',
      fetcher: async (_t, options) => {
        captured = options;
        return { ...ok(), status: 404, ok: false };
      },
    });
    expect(captured!.body).toBeUndefined();
    expect(response.ok).toBe(false);
  });

  test('mock 错误状态 ok=false 且保留路由头', async () => {
    const response = await sendWbRequest(request(), {
      scope: {},
      mockEnabled: true,
      mockRoutes: [mockRoute({ status: 404, headers: [['X-Note', 'gone']], body: '{"e":1}' })],
      mode: 'direct',
      fetcher: async () => ok(),
    });
    expect(response.status).toBe(404);
    expect(response.ok).toBe(false);
    expect(response.headers).toEqual([['Content-Type', 'application/json'], ['X-Note', 'gone']]);
  });
});
