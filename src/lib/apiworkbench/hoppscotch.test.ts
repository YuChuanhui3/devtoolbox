import { describe, expect, test } from 'vitest';
import { ToolError } from '../errors';
import { blankRequest, newCollection } from './tree';
import {
  exportHoppscotchCollections,
  exportHoppscotchEnvironments,
  hoppscotchNoteText,
  importHoppscotch,
} from './hoppscotch';
import type { WbCollection, WbRequest } from './types';

/**
 * 按 hoppscotch-data 的 v12 集合 / v"1" REST / v1 GQL / v2 环境 schema 手写的样例
 * （字段名与 `active` / `initialValue`+`currentValue` 的写法照他们的 zod 定义来）。
 */
const V12_FIXTURE = JSON.stringify({
  v: 12,
  name: 'Demo API',
  description: null,
  preRequestScript: "pm.collectionVariables.set('a','1')",
  testScript: '',
  headers: [{ key: 'X-App', value: 'webtool', active: true }],
  auth: { authType: 'inherit', authActive: true },
  variables: [
    { key: 'host', initialValue: 'https://api.test', currentValue: 'https://api.test', secret: false },
    { key: 'token', initialValue: '', currentValue: '', secret: true },
  ],
  folders: [
    {
      v: 12,
      name: 'Users',
      description: null,
      preRequestScript: '',
      testScript: '',
      headers: [],
      auth: { authType: 'none', authActive: true },
      variables: [],
      folders: [],
      requests: [
        {
          v: '1',
          name: 'List users',
          method: 'GET',
          endpoint: '{{host}}/users',
          params: [{ key: 'page', value: '2', active: true, description: '页码' }],
          headers: [
            { key: 'Accept', value: 'application/json', active: true },
            { key: 'X-Off', value: 'no', active: false },
          ],
          auth: { authType: 'api-key', authActive: true, key: 'k', value: '{{token}}', addTo: 'Query Params' },
          body: { contentType: null, body: null },
          preRequestScript: "console.log('pre')",
          testScript: "pm.test('ok', () => pm.response.to.be.ok)",
        },
        {
          v: '1',
          name: 'Create',
          method: 'post',
          endpoint: '{{host}}/users',
          params: [],
          headers: [],
          auth: { authType: 'basic', authActive: true, username: 'u', password: 'p' },
          body: { contentType: 'application/json', body: '{"name":"{{host}}"}' },
          preRequestScript: '',
          testScript: '',
        },
        {
          v: '1',
          name: 'Upload',
          method: 'POST',
          endpoint: '{{host}}/files',
          params: [],
          headers: [],
          auth: { authType: 'none', authActive: true },
          body: {
            contentType: 'multipart/form-data',
            body: [
              { key: 'note', active: true, isFile: false, value: 'hi' },
              { key: 'avatar', active: true, isFile: true, value: [null] },
            ],
          },
          preRequestScript: '',
          testScript: '',
        },
      ],
    },
  ],
  requests: [
    {
      v: 1,
      name: 'Me',
      url: '{{host}}/graphql',
      headers: [{ key: 'X-App', value: 'webtool', active: true }],
      query: 'query Me { me { id } }',
      variables: '{"id":"1"}',
    },
    {
      v: '1',
      name: 'Teapot',
      method: 'TEAPOT',
      endpoint: '{{host}}/teapot',
      params: [],
      headers: [],
      auth: { authType: 'oauth-2', authActive: true, token: 'at', accessTokenURL: 'https://idp/token', clientID: 'cid', scope: 'read', authURL: '', oidcDiscoveryURL: '' },
      body: { contentType: 'application/x-www-form-urlencoded', body: 'a=1&b=2' },
      preRequestScript: '',
      testScript: '',
    },
  ],
});

const ENVS_FIXTURE = JSON.stringify([
  {
    v: 2,
    name: 'prod',
    variables: [{ key: 'host', initialValue: 'https://p', currentValue: 'https://p.live', secret: false }],
  },
  { v: 1, id: 'x', name: 'legacy', variables: [{ key: 'host', value: 'https://old', secret: false }] },
]);

const collectionOf = (raw: string): WbCollection => importHoppscotch(raw).collections[0];

describe('importHoppscotch', () => {
  test('v12 集合：嵌套目录、请求、集合变量都在', () => {
    const collection = collectionOf(V12_FIXTURE);

    expect(collection.name).toBe('Demo API');
    expect(collection.root.folders.map((f) => f.name)).toEqual(['Users']);
    expect(collection.root.requests.map((r) => r.name)).toEqual(['Me', 'Teapot']);
    expect(collection.variables.map((v) => [v.key, v.value, v.secret])).toEqual([
      ['host', 'https://api.test', undefined],
      ['token', '', true],
    ]);
  });

  test('header / param 的 active 落 enabled，禁用的照样留行', () => {
    const list = collectionOf(V12_FIXTURE).root.folders[0].requests[0];
    expect(list.headers).toEqual([
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: 'X-Off', value: 'no', enabled: false },
    ]);
    expect(list.params).toEqual([{ key: 'page', value: '2', enabled: true }]);
  });

  test('auth 五种类型各归各位，inherit 记一条丢弃', () => {
    const collection = collectionOf(V12_FIXTURE);
    const ignored = importHoppscotch(V12_FIXTURE).ignored;

    expect(collection.root.folders[0].requests[0].auth).toEqual({ type: 'api-key', in: 'query', key: 'k', value: '{{token}}' });
    expect(collection.root.folders[0].requests[1].auth).toEqual({ type: 'basic', username: 'u', password: 'p' });
    expect(collection.root.requests[1].auth).toMatchObject({ type: 'oauth2', accessToken: 'at', tokenUrl: 'https://idp/token', clientId: 'cid', scope: 'read' });
    expect(ignored).toContain('auth-inherit');
  });

  test('body 模式按 contentType 分流，文件字段只留名字并点名丢弃', () => {
    const collection = collectionOf(V12_FIXTURE);
    const { ignored } = importHoppscotch(V12_FIXTURE);

    expect(collection.root.folders[0].requests[0].body.mode).toBe('none');
    expect(collection.root.folders[0].requests[1].body).toMatchObject({ mode: 'json', text: '{"name":"{{host}}"}' });
    expect(collection.root.folders[0].requests[2].body.multipart).toEqual([
      { key: 'note', type: 'text', value: 'hi' },
      { key: 'avatar', type: 'file', value: '' },
    ]);
    expect(collection.root.requests[1].body).toMatchObject({ mode: 'form', text: 'a=1&b=2' });
    expect(ignored).toEqual(expect.arrayContaining(['file-field', 'param-description', 'collection-script']));
  });

  test('GraphQL 请求落 body.mode=graphql，方法小写与陌生动词都收', () => {
    const collection = collectionOf(V12_FIXTURE);
    const gql = collection.root.requests[0];
    const teapot = collection.root.requests[1];

    expect(gql.body).toMatchObject({ mode: 'graphql', graphql: { query: 'query Me { me { id } }', variables: '{"id":"1"}' } });
    expect(gql.url).toBe('{{host}}/graphql');
    expect(teapot.method).toBe('GET');
    expect(teapot.customMethod).toBe('TEAPOT');
  });

  test('环境导入：currentValue 优先、v1 的 value 也能读、secret 保留', () => {
    const { collections, environments } = importHoppscotch(ENVS_FIXTURE);
    expect(collections).toEqual([]);
    expect(environments.map((e) => e.name)).toEqual(['prod', 'legacy']);
    expect(environments[0].variables).toEqual([{ id: expect.any(String), key: 'host', value: 'https://p.live', enabled: true }]);
    expect(environments[1].variables[0].value).toBe('https://old');
  });

  test('集合与环境混在一个数组里也能分开收', () => {
    const mixed = JSON.parse(V12_FIXTURE);
    const result = importHoppscotch(JSON.stringify([mixed, JSON.parse(ENVS_FIXTURE)[0]]));
    expect(result.collections).toHaveLength(1);
    expect(result.environments).toHaveLength(1);
  });

  test('坏 JSON 与认不出的对象都报错', () => {
    expect(() => importHoppscotch('not json')).toThrowError(ToolError);
    expect(() => importHoppscotch('{"hello":1}')).toThrowError(/不是 Hoppscotch/);
  });

  test('说明码给得出人话', () => {
    const zh = (value: ReturnType<typeof hoppscotchNoteText>) => (typeof value === 'string' ? value : value.zh);
    expect(zh(hoppscotchNoteText('file-field'))).toContain('文件');
    expect(zh(hoppscotchNoteText('mystery'))).toBe('mystery');
  });
});

describe('exportHoppscotch', () => {
  /** 只比结构，id 每次新生成不在比较范围内。 */
  const shape = (request: WbRequest) => ({
    name: request.name,
    method: request.method,
    customMethod: request.customMethod,
    url: request.url,
    headers: request.headers,
    params: request.params,
    body: request.body,
    auth: request.auth,
    preScript: request.preScript,
    testScript: request.testScript,
  });

  test('导出→导入→导出等价', () => {
    const source = newCollection('Demo API');
    const post = {
      ...blankRequest(),
      id: 'p1',
      name: 'Create',
      method: 'POST' as const,
      // 我们的不变量：URL 的查询串等于参数表格启用行。 fixture 要按这个写，否则测的是不一致的输入。
      url: '{{host}}/users?ref={{host}}',
      headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
      params: [{ key: 'ref', value: '{{host}}', enabled: true }],
      body: { mode: 'json' as const, text: '{"name":"a"}' },
      auth: { type: 'bearer' as const, token: '{{token}}' },
      preScript: "console.log('pre');",
      testScript: "pm.test('ok', () => pm.response.to.be.ok);",
    };
    const upload = {
      ...blankRequest(),
      id: 'u1',
      name: 'Upload',
      method: 'POST' as const,
      url: '{{host}}/files',
      body: {
        mode: 'multipart' as const,
        text: '',
        multipart: [
          { key: 'note', type: 'text' as const, value: 'hi' },
          { key: 'avatar', type: 'file' as const, value: '', fileName: 'cat.png' },
        ],
      },
    };
    source.root.folders = [{ id: 'f1', name: 'Users', folders: [], requests: [post, upload] }];
    source.variables = [{ id: 'v1', key: 'host', value: 'https://api.test', enabled: true }];

    const exported = exportHoppscotchCollections([source]);
    // 他们的 endpoint 与 params 是两份数据：查询串只该出现在 params 里，URL 里再留一份会被算两遍。
    expect(JSON.parse(exported)[0].folders[0].requests[0]).toMatchObject({
      endpoint: '{{host}}/users',
      params: [{ key: 'ref', value: '{{host}}', active: true }],
    });
    const back = importHoppscotch(exported);
    // 我们自己导出的文件里，那个文件字段也只剩 `[null]`——回导时如实点名，不假装带回了字节。
    expect(back.ignored).toEqual(['file-field']);
    const restored = back.collections[0];

    expect(restored.name).toBe(source.name);
    expect(restored.root.folders.map((f) => f.name)).toEqual(['Users']);
    expect(shape(restored.root.folders[0].requests[0])).toEqual(shape(post));
    expect(shape(restored.root.folders[0].requests[1])).toEqual({
      ...shape(upload),
      // 他们的 JSON 里文件字段只有 `[null]`，名字与字节都带不回来——不能假装还在。
      body: { mode: 'multipart', text: '', multipart: [{ key: 'note', type: 'text', value: 'hi' }, { key: 'avatar', type: 'file', value: '' }] },
    });
    expect(restored.variables.map((v) => [v.key, v.value])).toEqual([['host', 'https://api.test']]);
    expect(exportHoppscotchCollections([restored])).toBe(exported);
  });

  test('multipart 文件回导后没有字节：不假装带回了文件', () => {
    const exported = exportHoppscotchCollections([
      (() => {
        const collection = newCollection('Up');
        collection.root.requests = [{
          ...blankRequest(),
          name: 'Upload',
          method: 'POST',
          url: 'https://api.test/f',
          body: { mode: 'multipart', text: '', multipart: [{ key: 'avatar', type: 'file', value: '', fileName: 'cat.png' }] },
        }];
        return collection;
      })(),
    ]);
    const json = JSON.parse(exported);
    expect(json[0].requests[0].body.body[0]).toEqual({ key: 'avatar', active: true, isFile: true, value: [null] });
  });

  test('GraphQL 请求按他们的 GQL 形状导出，回来还是 graphql 模式', () => {
    const collection = newCollection('GQL');
    collection.root.requests = [{
      ...blankRequest(),
      name: 'Me',
      url: 'https://api.test/graphql',
      body: { mode: 'graphql', text: '', graphql: { query: 'query { me }', variables: '{}', operationName: 'Me' } },
    }];
    const exported = exportHoppscotchCollections([collection]);
    expect(JSON.parse(exported)[0].requests[0]).toMatchObject({ v: 1, url: 'https://api.test/graphql', query: 'query { me }' });
    expect(importHoppscotch(exported).collections[0].root.requests[0].body.mode).toBe('graphql');
  });

  test('密钥变量导出留空，环境也按 v2 出', () => {
    const exported = JSON.parse(exportHoppscotchEnvironments([
      { id: 'e1', name: 'prod', variables: [
        { id: 'v1', key: 'host', value: 'https://p', enabled: true },
        { id: 'v2', key: 'token', value: 'super-secret', enabled: true, secret: true },
      ] },
    ]));
    expect(exported[0]).toEqual({
      v: 2,
      name: 'prod',
      variables: [
        { key: 'host', initialValue: 'https://p', currentValue: 'https://p', secret: false },
        { key: 'token', initialValue: '', currentValue: '', secret: true },
      ],
    });
  });
});
