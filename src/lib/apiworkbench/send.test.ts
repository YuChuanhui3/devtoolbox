import { describe, expect, test } from 'vitest';
import { ToolError } from '../errors';
import type { ProxyRequestOptions, TimedResponse } from '../net';
import { buildRequest, requestMethod, sendWbRequest, streamWbRequest, type StreamContext, type StreamedEvent } from './send';
import { blankRequest } from './tree';
import { clearHeldFiles, holdFile, newFileRef } from './files';
import type { WbMockRoute, WbParam, WbRequest } from './types';

const AbortError = () => new DOMException('stopped', 'AbortError');

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

  test('自定义动词不会误命中 GET 路由，但命中通配路由', async () => {
    const routes = [mockRoute({ method: 'GET' })];
    const viaGet = await sendWbRequest(request({ customMethod: 'PROPFIND' }), {
      scope: {},
      mockEnabled: true,
      mockRoutes: routes,
      mode: 'direct',
      fetcher: async () => ok('real request'),
    });
    expect(viaGet.via).toBe('direct');
    const viaAny = await sendWbRequest(request({ customMethod: 'PROPFIND' }), {
      scope: {},
      mockEnabled: true,
      mockRoutes: [...routes, mockRoute({ id: 'm2', method: '*' as WbMockRoute['method'], status: 204 })],
      mode: 'direct',
      fetcher: async () => ok('should not happen'),
    });
    expect(viaAny.via).toBe('mock');
    expect(viaAny.status).toBe(204);
  });
});

const ctx = (partial: Partial<Parameters<typeof buildRequest>[1]> = {}): Parameters<typeof buildRequest>[1] => ({
  scope: {},
  mockEnabled: false,
  mockRoutes: [],
  mode: 'direct',
  ...partial,
});

const param = (key: string, value = '', enabled = true): WbParam => ({ key, value, enabled });

describe('buildRequest', () => {
  test('启用的参数行覆盖 URL 查询串，禁用行不参与', () => {
    const built = buildRequest(
      request({ url: 'https://api.test/x?stale=1', params: [param('page', '2'), param('off', '1', false)] }),
      ctx(),
    );
    expect(built.url).toBe('https://api.test/x?page=2');
  });

  test('参数里的 {{变量}} 插值后仍是字面花括号，不会被提前编码', () => {
    const built = buildRequest(
      request({ url: 'https://api.test/x', params: [param('q', '{{keyword}}'), param('raw', 'a%2Bb+c')] }),
      ctx({ scope: { keyword: '中文' } }),
    );
    expect(built.url).toBe('https://api.test/x?q=中文&raw=a%2Bb+c');
  });

  test('参数缺失变量与 URL 缺失变量同样拦下', () => {
    expect(() => buildRequest(request({ url: 'https://api.test/x', params: [param('q', '{{nope}}')] }), ctx())).toThrow(ToolError);
  });

  test('自定义动词生效且可以带请求体', () => {
    const built = buildRequest(request({ method: 'GET', customMethod: 'PROPFIND', body: { mode: 'text', text: '<d>' } }), ctx());
    expect(requestMethod(request({ method: 'GET', customMethod: 'PROPFIND' }))).toBe('PROPFIND');
    expect(built.method).toBe('PROPFIND');
    expect(built.body).toBe('<d>');
    expect(built.headers['Content-Type']).toBe('text/plain');
  });

  test('api-key 注入请求头时可带前缀', () => {
    const built = buildRequest(
      request({ auth: { type: 'api-key', in: 'header', key: 'X-Api-Key', value: '{{k}}', headerPrefix: 'Token' } }),
      ctx({ scope: { k: 'secret' } }),
    );
    expect(built.headers['X-Api-Key']).toBe('Token secret');
  });

  test('api-key 注入查询串，键可含变量', () => {
    const built = buildRequest(
      request({ url: 'https://api.test/x?a=1#frag', auth: { type: 'api-key', in: 'query', key: '{{key}}', value: 'a b&c' } }),
      ctx({ scope: { key: 'apikey' } }),
    );
    expect(built.url).toBe('https://api.test/x?a=1&apikey=a%20b%26c#frag');
  });

  test('oauth2 已取到 token 时按 tokenType 注入，缺省 Bearer', () => {
    const built = buildRequest(request({ auth: { type: 'oauth2', grantType: 'client_credentials', accessToken: 'at' } }), ctx());
    expect(built.headers.Authorization).toBe('Bearer at');
    const other = buildRequest(request({ auth: { type: 'oauth2', accessToken: 'at', tokenType: 'MAC' } }), ctx());
    expect(other.headers.Authorization).toBe('MAC at');
    const none = buildRequest(request({ auth: { type: 'oauth2', accessToken: undefined } }), ctx());
    expect(none.headers.Authorization).toBeUndefined();
  });

  test('GraphQL 组装成 query/variables/operationName', () => {
    const built = buildRequest(
      request({
        method: 'POST',
        body: { mode: 'graphql', text: '', graphql: { query: 'query Me { me { id } }', variables: '{ "id": "{{uid}}", "n": 2 }', operationName: 'Me' } },
      }),
      ctx({ scope: { uid: '9' } }),
    );
    expect(built.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(built.body as string)).toEqual({ query: 'query Me { me { id } }', variables: { id: '9', n: 2 }, operationName: 'Me' });
  });

  test('GraphQL 空 variables 与空 operationName 不写出', () => {
    const built = buildRequest(
      request({ method: 'POST', body: { mode: 'graphql', text: '', graphql: { query: '{ me { id } }', variables: '  ', operationName: '  ' } } }),
      ctx(),
    );
    expect(JSON.parse(built.body as string)).toEqual({ query: '{ me { id } }', variables: {} });
  });

  test('GraphQL 的 variables 不是对象时报错', () => {
    for (const variables of ['[1,2]', 'nope', '"str"']) {
      expect(() =>
        buildRequest(request({ method: 'POST', body: { mode: 'graphql', text: '', graphql: { query: '{a}', variables } } }), ctx()),
      ).toThrow(ToolError);
    }
    expect(() =>
      buildRequest(request({ method: 'POST', body: { mode: 'graphql', text: '', graphql: { query: '   ', variables: '' } } }), ctx()),
    ).toThrow(ToolError);
  });

  test('multipart 建出 FormData 且不写 Content-Type', () => {
    clearHeldFiles();
    const ref = newFileRef();
    holdFile(ref, new File(['abc'], 'notes.txt', { type: 'text/plain' }));
    const built = buildRequest(
      request({
        method: 'POST',
        body: {
          mode: 'multipart',
          text: '',
          multipart: [
            { key: 'note', type: 'text', value: '{{msg}}' },
            { key: 'upload', type: 'file', value: '', fileName: 'notes.txt', fileRef: ref },
            { key: '  ', type: 'text', value: 'ignored' },
          ],
        },
      }),
      ctx({ scope: { msg: '你好' } }),
    );
    expect(built.body).toBeInstanceOf(FormData);
    expect(built.headers['Content-Type']).toBeUndefined();
    const form = built.body as FormData;
    expect(form.get('note')).toBe('你好');
    expect((form.get('upload') as File).name).toBe('notes.txt');
    clearHeldFiles();
  });

  test('文件字节丢了就要求重新选择，不静默少传', () => {
    const built = () =>
      buildRequest(
        request({
          method: 'POST',
          body: { mode: 'multipart', text: '', multipart: [{ key: 'upload', type: 'file', value: '', fileName: 'gone.bin', fileRef: 'stale' }] },
        }),
        ctx(),
      );
    expect(built).toThrow(/gone.bin/);
  });

  test('multipart 没有有效字段时报错', () => {
    expect(() =>
      buildRequest(request({ method: 'POST', body: { mode: 'multipart', text: '', multipart: [{ key: ' ', type: 'text', value: '1' }] } }), ctx()),
    ).toThrow(ToolError);
  });

  test('代理通道拒绝 multipart，直连才放行', () => {
    const req = request({ method: 'POST', body: { mode: 'multipart', text: '', multipart: [{ key: 'a', type: 'text', value: '1' }] } });
    expect(() => buildRequest(req, ctx({ mode: 'corsproxy' }))).toThrow(ToolError);
    expect(() => buildRequest(req, ctx({ mode: 'allorigins' }))).toThrow(ToolError);
  });

  test('GET/HEAD 永不带体，POST 只在真空 body 时不带体', () => {
    expect(buildRequest(request({ method: 'GET', body: { mode: 'json', text: '{"a":1}' } }), ctx()).body).toBeUndefined();
    expect(buildRequest(request({ method: 'HEAD', body: { mode: 'json', text: '{"a":1}' } }), ctx()).body).toBeUndefined();
    expect(buildRequest(request({ method: 'POST', body: { mode: 'json', text: '' } }), ctx()).body).toBeUndefined();
    // 全空白是用户真敲进去的内容，不该被当成空
    expect(buildRequest(request({ method: 'POST', body: { mode: 'json', text: '   ' } }), ctx()).body).toBe('   ');
  });
});

/** 手搓一个 Response：只给 streamWbRequest 真正用到的那几样。 */
function fakeResponse(chunks: string[], headers: [string, string][] = [], init: { status?: number; throwOnRead?: number } = {}) {
  const allHeaders = new Headers(headers.map(([k, v]) => [k, v]) as [string, string][]);
  let index = 0;
  const reader = {
    read: async () => {
      if (init.throwOnRead === index) throw AbortError();
      if (index >= chunks.length) return { done: true, value: undefined };
      const chunk = chunks[index];
      index += 1;
      return { done: false, value: new TextEncoder().encode(chunk) };
    },
  };
  return {
    status: init.status ?? 200,
    ok: (init.status ?? 200) < 400,
    headers: allHeaders,
    body: { getReader: () => reader },
    text: async () => chunks.join(''),
  } as unknown as Response;
}

function streamCtx(partial: Partial<StreamContext> = {}): StreamContext {
  return { scope: {}, mockEnabled: false, mockRoutes: [], mode: 'direct', ...partial };
}

describe('streamWbRequest', () => {
  test('代理通道直接报错，不假装在流', async () => {
    let opened = 0;
    await expect(
      streamWbRequest(request(), streamCtx({
        mode: 'corsproxy',
        opener: async () => {
          opened += 1;
          return fakeResponse(['x']);
        },
      })),
    ).rejects.toThrow(/代理通道不支持流式/);
    expect(opened).toBe(0);
  });

  test('event-stream 逐帧派发，帧被切在两个 chunk 之间也能拼回来', async () => {
    const events: StreamedEvent[] = [];
    const response = await streamWbRequest(
      request({ url: 'https://api.test/stream' }),
      streamCtx({
        opener: async () => fakeResponse(['data: on', 'e\n\n', 'event: tick\ndata: two\n\n'], [['content-type', 'text/event-stream']]),
        onEvent: (event) => events.push(event),
      }),
    );
    expect(events.map((e) => [e.event, e.data])).toEqual([['message', 'one'], ['tick', 'two']]);
    expect(events[0].at).toBeGreaterThanOrEqual(0);
    expect(response.text).toBe('data: one\n\nevent: tick\ndata: two\n\n');
    expect(response.via).toBe('direct');
    expect(response.bytes).toBe(new TextEncoder().encode(response.text).length);
  });

  test('最后一帧没等到空行也会给出来，并标成不完整', async () => {
    const events: StreamedEvent[] = [];
    await streamWbRequest(
      request(),
      streamCtx({
        opener: async () => fakeResponse(['data: a\n\ndata: hanging'], [['content-type', 'text/event-stream']]),
        onEvent: (event) => events.push(event),
      }),
    );
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ data: 'hanging', incomplete: true });
  });

  test('非 event-stream 只回调累计字节，不造帧', async () => {
    const received: number[] = [];
    const events: StreamedEvent[] = [];
    const response = await streamWbRequest(
      request(),
      streamCtx({
        opener: async () => fakeResponse(['hello ', 'world'], [['content-type', 'text/plain']]),
        onChunk: (bytes) => received.push(bytes),
        onEvent: (event) => events.push(event),
      }),
    );
    expect(response.text).toBe('hello world');
    expect(received).toEqual([6, 11]);
    expect(events).toEqual([]);
  });

  test('读流途中被中止：已经收到的部分照样返回并标记 aborted', async () => {
    const events: StreamedEvent[] = [];
    const response = await streamWbRequest(
      request(),
      streamCtx({
        opener: async () => fakeResponse(['data: a\n\n', 'data: b'], [['content-type', 'text/event-stream']], { throwOnRead: 1 }),
        onEvent: (event) => events.push(event),
      }),
    );
    expect(response.aborted).toBe(true);
    expect(response.text).toBe('data: a\n\n');
    expect(response.bytes).toBe(9);
    expect(events.map((e) => e.data)).toEqual(['a']);
  });

  test('连接阶段就已中止：给一个空的 aborted 响应而不是报「请求失败」', async () => {
    const response = await streamWbRequest(request(), streamCtx({ opener: async () => { throw AbortError(); } }));
    expect(response.aborted).toBe(true);
    expect(response.status).toBe(0);
    expect(response.text).toBe('');
  });

  test('外部 signal 会转成内部中止', async () => {
    const controller = new AbortController();
    controller.abort();
    let seenSignal: AbortSignal | undefined;
    const response = await streamWbRequest(
      request(),
      streamCtx({
        signal: controller.signal,
        opener: async (_url, init) => {
          seenSignal = init.signal ?? undefined;
          throw AbortError();
        },
      }),
    );
    expect(seenSignal?.aborted).toBe(true);
    expect(response.aborted).toBe(true);
  });

  test('网络错误包成 ToolError', async () => {
    await expect(
      streamWbRequest(request(), streamCtx({ opener: async () => { throw new TypeError('Failed to fetch'); } })),
    ).rejects.toThrow(/请求失败：Failed to fetch/);
  });

  test('Mock 命中时一次性作答，不碰 opener', async () => {
    let opened = 0;
    const response = await streamWbRequest(request(), streamCtx({
      mockEnabled: true,
      mockRoutes: [mockRoute()],
      opener: async () => {
        opened += 1;
        return fakeResponse(['x']);
      },
    }));
    expect(opened).toBe(0);
    expect(response.via).toBe('mock');
  });

  test('拿不到可读流时退回整段读取，SSE 仍然逐帧', async () => {
    const events: StreamedEvent[] = [];
    const bare = {
      status: 200,
      ok: true,
      headers: new Headers([['content-type', 'text/event-stream']]),
      body: null,
      text: async () => 'data: solo\n\n',
    } as unknown as Response;
    const response = await streamWbRequest(request(), streamCtx({
      opener: async () => bare,
      onEvent: (event) => events.push(event),
    }));
    expect(events.map((e) => e.data)).toEqual(['solo']);
    expect(response.text).toBe('data: solo\n\n');
    expect(response.bytes).toBe(12);
  });

  test('请求头与请求体照 buildRequest 的结果交给 fetch', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    await streamWbRequest(
      request({ method: 'POST', url: '{{base}}/stream', headers: [{ key: 'X-E', value: '{{env}}', enabled: true }], body: { mode: 'json', text: '{}' } }),
      streamCtx({
        scope: { base: 'https://api.test', env: 'dev' },
        opener: async (url, init) => {
          seen = { url, init };
          return fakeResponse(['ok']);
        },
      }),
    );
    expect(seen!.url).toBe('https://api.test/stream');
    expect((seen!.init.headers as Record<string, string>)['X-E']).toBe('dev');
    expect(seen!.init.method).toBe('POST');
    expect(seen!.init.body).toBe('{}');
  });
});
