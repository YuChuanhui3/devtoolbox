import { beforeEach, describe, expect, test } from 'vitest';
import {
  MAX_BODY_LENGTH,
  MAX_COLLECTIONS,
  MAX_HISTORY_BODY,
  MAX_HISTORY_ENTRIES,
  MAX_PARAMS,
  MAX_PARTS,
  MAX_SCRIPT_CHARS,
  WORKBENCH_STORAGE_KEY,
  countRequests,
  emptyWorkbench,
  envInheritanceChain,
  loadWorkbench,
  sanitizeWorkbench,
  saveWorkbench,
} from './store';
import { MAX_SOCKETS } from './ws';
import { WB_METHODS, WORKBENCH_VERSION } from './types';
import type { WbCollection, WbEnvironment, WbFolder, WorkbenchDoc } from './types';

function folder(name: string, requests: number, childFolders: WbFolder[] = []): WbFolder {
  return {
    id: `f-${name}`,
    name,
    folders: childFolders,
    requests: Array.from({ length: requests }, (_, i) => ({
      id: `r-${name}-${i}`,
      name: `req-${i}`,
      method: 'GET' as const,
      url: 'https://example.com',
      headers: [],
      body: { mode: 'none' as const, text: '' },
      auth: { type: 'none' as const },
    })),
  };
}

function collection(name: string, requests: number): WbCollection {
  return { id: `c-${name}`, name, root: folder(name, requests), variables: [] };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('sanitizeWorkbench', () => {
  test('非对象输入回退空文档，绝不 throw', () => {
    for (const raw of [null, undefined, 42, 'x', [], true]) {
      expect(sanitizeWorkbench(raw)).toEqual(emptyWorkbench());
    }
  });

  test('保存的 WebSocket 连接逐项清洗并限额', () => {
    const doc = sanitizeWorkbench({
      sockets: [
        { id: 's1', name: '', url: ' wss://a.test/echo ', protocols: [' chat ', '', ' chat ', 'v2'], note: 'n' },
        { url: 'wss://b.test' },
        { url: '   ' },
        { url: 'wss://c.test', protocols: 'not-an-array' },
        'junk',
      ],
    });
    expect(doc.sockets).toHaveLength(3);
    expect(doc.sockets[0]).toMatchObject({ name: 'wss://a.test/echo', url: 'wss://a.test/echo', protocols: ['chat', 'v2'] });
    expect(doc.sockets[1].name).toBe('wss://b.test');
    expect(doc.sockets[2].protocols).toEqual([]);

    const capped = sanitizeWorkbench({
      sockets: Array.from({ length: MAX_SOCKETS + 20 }, (_, i) => ({ url: `wss://a.test/${i}` })),
    });
    expect(capped.sockets).toHaveLength(MAX_SOCKETS);

    saveWorkbench(capped);
    expect(loadWorkbench().sockets).toHaveLength(MAX_SOCKETS);
  });

  test('脏字段逐项回退默认值', () => {
    const doc = sanitizeWorkbench({
      collections: [
        {
          id: 'c1',
          name: 123,
          root: {
            id: 'f1',
            requests: [
              { id: 'r1', method: 'TEAPOT', url: 'https://a', headers: 'nope', body: { mode: 'weird' } },
              { url: 'https://b', auth: { type: 'oauth' } },
              { noUrl: true },
            ],
          },
          variables: [{ key: '  k  ', value: 'v', enabled: true }, { key: '  ' }, 'junk'],
        },
        'junk',
      ],
      environments: [{ id: 'e1', name: 'Env', variables: [] }, 7],
      activeEnvId: 'ghost',
      mockRoutes: [{ path: '/a', status: 'x' }, { path: '' }],
      history: [{ request: { url: 'https://h' }, bodyExcerpt: 'x'.repeat(10_000) }, 3],
    });
    expect(doc.collections).toHaveLength(1);
    const root = doc.collections[0].root;
    expect(root.name).toBe('Folder');
    expect(root.requests[0].method).toBe('GET');
    expect(root.requests[0].headers).toEqual([]);
    expect(root.requests[0].body).toEqual({ mode: 'none', text: '' });
    expect(root.requests[1].auth).toEqual({ type: 'none' });
    expect(root.requests[1].name).toBe('https://b');
    expect(root.requests).toHaveLength(2);
    expect(doc.collections[0].variables.map((v) => v.key)).toEqual(['k']);
    expect(doc.activeEnvId).toBeNull();
    expect(doc.mockRoutes[0].status).toBe(200);
    expect(doc.history[0].bodyExcerpt.length).toBe(4000);
    expect(doc.history).toHaveLength(1);
  });

  test('activeEnvId 仅在指向存在的环境时保留', () => {
    const doc = sanitizeWorkbench({
      environments: [{ id: 'e1', name: 'Env', variables: [] }],
      activeEnvId: 'e1',
    });
    expect(doc.activeEnvId).toBe('e1');
  });

  test('集合数量与请求总数限额', () => {
    const many = Array.from({ length: MAX_COLLECTIONS + 10 }, (_, i) => collection(`c${i}`, 5));
    expect(sanitizeWorkbench({ collections: many }).collections).toHaveLength(MAX_COLLECTIONS);

    const big = sanitizeWorkbench({ collections: [collection('huge', 900)] });
    expect(countRequests(big.collections[0].root)).toBeLessThanOrEqual(800);
  });

  test('历史条数限额且新条目在前保留', () => {
    const history = Array.from({ length: 150 }, (_, i) => ({
      id: `h${i}`,
      at: i,
      request: { url: `https://e${i}`, method: 'GET' },
      status: 200,
    }));
    const doc = sanitizeWorkbench({ history });
    expect(doc.history).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(doc.history[0].request.url).toBe('https://e0');
  });

  test('嵌套文件夹深度受限', () => {
    let deep: WbFolder = { id: 'leaf', name: 'leaf', folders: [], requests: [] };
    for (let i = 0; i < 20; i += 1) deep = { id: `d${i}`, name: `d${i}`, folders: [deep], requests: [] };
    const doc = sanitizeWorkbench({ collections: [{ id: 'c', name: 'c', root: deep, variables: [] }] });
    let node = doc.collections[0].root;
    let depth = 0;
    while (node.folders.length > 0) {
      node = node.folders[0];
      depth += 1;
    }
    expect(depth).toBeLessThanOrEqual(10);
  });
});

describe('v1 → v2 迁移', () => {
  /** v1 存档里没有任何新字段，往返后必须一个键都不多出来。 */
  const v1Doc = {
    version: 1,
    collections: [
      {
        id: 'c1',
        name: '演示',
        root: { id: 'f1', name: 'f1', folders: [], requests: [{ id: 'r1', name: 'R1', method: 'POST', url: 'https://a.test/x', headers: [{ key: 'k', value: 'v', enabled: true }], body: { mode: 'json', text: '{"a":1}' }, auth: { type: 'bearer', token: 't' } }] },
        variables: [{ id: 'v1', key: 'baseUrl', value: 'https://a.test', enabled: true, secret: true }],
      },
    ],
    environments: [{ id: 'e1', name: 'Dev', variables: [] }],
    activeEnvId: 'e1',
    mockRoutes: [],
    mockEnabled: false,
    sockets: [{ id: 's1', name: 'echo', url: 'wss://a.test', protocols: [] }],
    history: [{ id: 'h1', at: 1, request: { url: 'https://a.test/x', method: 'GET', headers: [], body: { mode: 'none', text: '' }, auth: { type: 'none' } }, status: 200, ms: 12, bytes: 5, bodyExcerpt: '{}', via: 'direct' }],
  };

  test('旧存档逐项补默认值，不新增空字段', () => {
    const doc = sanitizeWorkbench(v1Doc);
    expect(doc.version).toBe(WORKBENCH_VERSION);
    expect(WORKBENCH_VERSION).toBe(2);
    const request = doc.collections[0].root.requests[0];
    expect(request).toEqual({
      id: 'r1',
      name: 'R1',
      method: 'POST',
      url: 'https://a.test/x',
      headers: [{ key: 'k', value: 'v', enabled: true }],
      body: { mode: 'json', text: '{"a":1}' },
      auth: { type: 'bearer', username: '', password: '', token: 't' },
    });
    expect(Object.keys(request)).not.toContain('params');
    expect(Object.keys(request.body)).not.toContain('multipart');
    expect(doc.sockets).toHaveLength(1);
    expect(doc.history[0].request).not.toHaveProperty('preScript');
    // v1 里没有 inheritId，不应被凭空造出来
    expect(doc.environments[0]).not.toHaveProperty('inheritId');
  });

  test('再存一次与首次清洗结果完全一致（幂等）', () => {
    const once = sanitizeWorkbench(v1Doc);
    expect(sanitizeWorkbench(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  test('参数、分片与脚本各自清洗并限额', () => {
    const doc = sanitizeWorkbench({
      collections: [
        {
          id: 'c',
          name: 'c',
          root: {
            id: 'f',
            folders: [],
            requests: [
              {
                url: 'https://a.test',
                customMethod: '  PROPFIND  ',
                params: [...Array.from({ length: MAX_PARAMS + 30 }, (_, i) => ({ key: `p${i}` })), { key: 1 }, 'junk'],
                body: {
                  mode: 'multipart',
                  text: 'ignored',
                  multipart: [
                    { key: 'file', type: 'file', value: 'BINARY', fileName: 'a.bin', fileSize: 12.7, mime: 'application/octet-stream' },
                    { type: 'file', key: 'ghost' },
                    ...Array.from({ length: MAX_PARTS + 10 }, (_, i) => ({ key: `f${i}`, type: 'text', value: 'v' })),
                  ],
                  graphql: { query: 'query { me }', variables: '{"id":1}', operationName: 'Me' },
                },
                preScript: 'x'.repeat(MAX_SCRIPT_CHARS + 500),
                testScript: 42,
              },
              { url: 'https://b.test', customMethod: 'lower case', params: [{ value: 'no key' }] },
            ],
          },
          variables: [],
        },
      ],
    });
    const [first, second] = doc.collections[0].root.requests;
    expect(first.customMethod).toBe('PROPFIND');
    expect(first.params).toHaveLength(MAX_PARAMS);
    expect(first.params?.[0]).toEqual({ key: 'p0', value: '', enabled: true, description: undefined });
    expect(first.body.mode).toBe('multipart');
    expect(first.body.multipart).toHaveLength(MAX_PARTS);
    expect(first.body.multipart?.[0]).toMatchObject({ key: 'file', type: 'file', fileName: 'a.bin', fileSize: 13 });
    expect(first.body.multipart?.[0].value).toBe('BINARY');
    expect(first.body.multipart?.[0].mime).toBe('application/octet-stream');
    // 非文件分片不保留字节语义之外的字段
    expect(first.body.multipart?.[2].fileName).toBeUndefined();
    expect(first.body.graphql).toEqual({ query: 'query { me }', variables: '{"id":1}', operationName: 'Me' });
    expect(first.preScript).toHaveLength(MAX_SCRIPT_CHARS);
    expect(second).not.toHaveProperty('testScript');
    expect(second).not.toHaveProperty('customMethod');
    expect(second).not.toHaveProperty('params');
    expect(second.body).not.toHaveProperty('graphql');
  });

  test('api-key 与 oauth2 认证按类型保留字段，未知类型退回 none', () => {
    const doc = sanitizeWorkbench({
      collections: [
        {
          id: 'c',
          name: 'c',
          root: {
            id: 'f',
            folders: [],
            requests: [
              { url: 'https://a', auth: { type: 'api-key', in: 'query', key: 'apiKey', value: '{{k}}', headerPrefix: 'Bearer' } },
              { url: 'https://b', auth: { type: 'oauth2', grantType: 'authorization_code', tokenUrl: 'https://idp/token', clientId: 'cid', expiresAt: 1_800_000_000_000.4 } },
              { url: 'https://c', auth: { type: 'oauth2', grantType: 'bogus' } },
              { url: 'https://d', auth: { type: 'api-key' } },
            ],
          },
          variables: [],
        },
      ],
    });
    const requests = doc.collections[0].root.requests;
    expect(requests[0].auth).toEqual({ type: 'api-key', in: 'query', key: 'apiKey', value: '{{k}}', headerPrefix: 'Bearer' });
    expect(requests[1].auth).toMatchObject({ type: 'oauth2', grantType: 'authorization_code', tokenUrl: 'https://idp/token', expiresAt: 1_800_000_000_000 });
    expect(requests[1].auth.accessToken).toBeUndefined();
    expect(requests[2].auth.grantType).toBe('client_credentials');
    expect(requests[3].auth.in).toBe('header');
  });

  test('历史副本去脚本、截正文，并标注裁剪', () => {
    const doc = sanitizeWorkbench({
      history: [
        {
          id: 'h1',
          at: 1,
          request: { url: 'https://a', method: 'POST', headers: [], body: { mode: 'json', text: 'y'.repeat(MAX_HISTORY_BODY + 1_000) }, auth: { type: 'none' }, preScript: 'console.log(1)', testScript: 'pm.test()' },
          status: 200,
          ms: 5,
          bytes: 5,
          bodyExcerpt: '',
          via: 'direct',
        },
        { id: 'h2', at: 2, request: { url: 'https://b', method: 'GET', headers: [], body: { mode: 'none', text: 'tiny' }, auth: { type: 'none' } }, status: 200, ms: 1, bytes: 1, bodyExcerpt: '', via: 'direct' },
      ],
    });
    expect(doc.history[0].request).not.toHaveProperty('preScript');
    expect(doc.history[0].request.body.text).toHaveLength(MAX_HISTORY_BODY);
    expect(doc.history[0].requestTrimmed).toBe(true);
    expect(doc.history[1].requestTrimmed).toBeUndefined();
  });

  test('满额历史不会因带脚本的大请求被静默丢弃', () => {
    const history = Array.from({ length: MAX_HISTORY_ENTRIES }, (_, i) => ({
      id: `h${i}`,
      at: i,
      request: {
        url: `https://a.test/${i}`,
        method: 'POST',
        headers: [],
        body: { mode: 'json', text: 'z'.repeat(MAX_BODY_LENGTH) },
        auth: { type: 'none' },
        preScript: 'p'.repeat(MAX_SCRIPT_CHARS),
        testScript: 't'.repeat(MAX_SCRIPT_CHARS),
      },
      status: 200,
      ms: 1,
      bytes: 1,
      bodyExcerpt: '',
      via: 'direct',
    }));
    const doc = sanitizeWorkbench({ history });
    expect(doc.history).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(doc.history[0].request.body.text).toHaveLength(MAX_HISTORY_BODY);
    expect(JSON.stringify(doc).length).toBeLessThanOrEqual(3_000_000);
  });

  test('环境继承链：自己在前、被继承者在后，缺失与成环都安全', () => {
    const environments: WbEnvironment[] = [
      { id: 'a', name: 'A', variables: [], inheritId: 'b' },
      { id: 'b', name: 'B', variables: [], inheritId: 'a' },
      { id: 'c', name: 'C', variables: [], inheritId: 'gone' },
      { id: 'd', name: 'D', variables: [] },
    ];
    expect(envInheritanceChain(environments, 'a').map((e) => e.id)).toEqual(['a', 'b']);
    expect(envInheritanceChain(environments, 'c').map((e) => e.id)).toEqual(['c']);
    expect(envInheritanceChain(environments, 'd').map((e) => e.id)).toEqual(['d']);
    expect(envInheritanceChain(environments, 'ghost')).toEqual([]);

    const doc = sanitizeWorkbench({ environments });
    expect(doc.environments.find((e) => e.id === 'c')?.inheritId).toBeUndefined();
    expect(doc.environments.find((e) => e.id === 'a')?.inheritId).toBe('b');
    expect(doc.environments.find((e) => e.id === 'b')?.inheritId).toBe('a');
  });
});

describe('load/save roundtrip', () => {
  test('save 后 load 拿回同构数据；空存储返回空文档', () => {
    expect(loadWorkbench()).toEqual(emptyWorkbench());
    const doc: WorkbenchDoc = {
      ...emptyWorkbench(),
      collections: [collection('demo', 2)],
      environments: [{ id: 'e1', name: 'Dev', variables: [{ id: 'v1', key: 'baseUrl', value: 'https://x', enabled: true }] }],
      activeEnvId: 'e1',
    };
    expect(saveWorkbench(doc)).toBe(true);
    const loaded = loadWorkbench();
    expect(loaded.collections[0].name).toBe('demo');
    expect(countRequests(loaded.collections[0].root)).toBe(2);
    expect(loaded.activeEnvId).toBe('e1');
  });

  test('损坏的存储内容不阻塞加载', () => {
    window.localStorage.setItem(WORKBENCH_STORAGE_KEY, '{not json');
    expect(loadWorkbench()).toEqual(emptyWorkbench());
  });

  test('WB_METHODS 覆盖常见 REST 方法', () => {
    expect(WB_METHODS).toContain('PATCH');
  });
});
