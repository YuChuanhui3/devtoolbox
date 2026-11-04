import { describe, expect, test } from 'vitest';
import { ToolError } from '../errors';
import { exportPostman, importPostman } from './transfer';
import { walkRequests, blankRequest, newCollection } from './tree';

const V21_FIXTURE = JSON.stringify({
  info: { name: 'Demo API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [
    {
      name: 'Users',
      item: [
        {
          name: 'List users',
          event: [{ listen: 'test', script: { exec: ['pm.test("x", () => pm.expect(1).to.be(1));'] } }],
          request: {
            method: 'GET',
            header: [{ key: 'X-Trace', value: 'on' }, { key: 'X-Old', value: '1', disabled: true }],
            url: { raw: 'https://api.test/{{env}}/users?page=2', protocol: 'https', host: ['api', 'test'], path: ['{{env}}', 'users'], query: [{ key: 'page', value: '2' }] },
          },
        },
        {
          name: 'Create user',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            url: 'https://api.test/users',
            body: { mode: 'raw', raw: '{"name":"bob"}' },
            auth: { type: 'bearer', bearer: [{ key: 'token', value: 'tkn-123' }] },
          },
        },
      ],
    },
    { name: 'Ping', request: { method: 'GET', url: 'https://api.test/ping' } },
  ],
  variable: [{ key: 'env', value: 'staging', type: 'secret' }, { key: 'unused', value: '', disabled: true }],
});

describe('importPostman', () => {
  test('v2.1：文件夹/请求/头/体/auth/变量结构与计数', () => {
    const { collection, ignored } = importPostman(V21_FIXTURE);
    expect(collection.name).toBe('Demo API');
    expect(collection.root.folders).toHaveLength(1);
    expect(collection.root.requests).toHaveLength(1);
    const users = collection.root.folders[0];
    expect(users.name).toBe('Users');
    expect(users.requests.map((r) => r.name)).toEqual(['List users', 'Create user']);
    const list = users.requests[0];
    expect(list.url).toBe('https://api.test/{{env}}/users?page=2');
    expect(list.headers).toEqual([{ key: 'X-Trace', value: 'on', enabled: true }]);
    const create = users.requests[1];
    expect(create.body).toEqual({ mode: 'json', text: '{"name":"bob"}' });
    expect(create.auth).toEqual({ type: 'bearer', token: 'tkn-123' });
    expect(collection.variables).toEqual([
      { id: expect.any(String), key: 'env', value: 'staging', enabled: true, secret: true },
      { id: expect.any(String), key: 'unused', value: '', enabled: false },
    ]);
    expect(ignored).toEqual(['request-script']);
    expect(walkRequests(collection.root)).toHaveLength(3);
  });

  test('集合级 basic auth 继承给未单独声明的请求', () => {
    const { collection } = importPostman(
      JSON.stringify({
        info: { name: 'auth demo' },
        auth: { type: 'basic', basic: [{ key: 'username', value: 'u' }, { key: 'password', value: 'p' }] },
        item: [{ name: 'R', request: { method: 'GET', url: 'https://a' } }],
      }),
    );
    expect(collection.root.requests[0].auth).toEqual({ type: 'basic', username: 'u', password: 'p' });
  });

  test('v2.0 字符串 URL 与 urlencoded 体', () => {
    const { collection } = importPostman(
      JSON.stringify({
        info: { name: 'v20' },
        item: [
          {
            name: 'Login',
            request: { method: 'POST', url: 'https://a/login', body: { mode: 'urlencoded', urlencoded: [{ key: 'user', value: 'bob' }, { key: 'x', value: '1', disabled: true }] } },
          },
        ],
      }),
    );
    const login = collection.root.requests[0];
    expect(login.url).toBe('https://a/login');
    expect(login.body).toEqual({ mode: 'form', text: 'user=bob' });
  });

  test('脏输入报错而不是崩溃', () => {
    expect(() => importPostman('not json')).toThrow(ToolError);
    expect(() => importPostman('{"info":{}}')).toThrow(ToolError);
    expect(() => importPostman(JSON.stringify({ info: { name: 'empty' }, item: [] }))).toThrow(/没有可导入的请求/);
    expect(() => importPostman(JSON.stringify({ info: { name: 'x' }, item: [{ name: 'T', request: { method: 'TEAPOT', url: 'https://a' } }] }))).toThrow(/没有可导入的请求/);
  });
});

describe('exportPostman', () => {
  test('导出结构与 schema 声明', () => {
    const collection = newCollection('Out');
    const exported = exportPostman({
      ...collection,
      variables: [{ id: 'v', key: 'k', value: 'v1', enabled: true, secret: true }],
      root: { ...collection.root, requests: [{ ...blankRequest(), name: 'R1', auth: { type: 'basic', username: 'u', password: 'p' }, body: { mode: 'json', text: '{}' } }] },
    });
    expect(exported.info).toMatchObject({ name: 'Out', schema: expect.stringContaining('v2.1.0') });
    expect(exported.variable).toEqual([{ key: 'k', value: 'v1', disabled: false, type: 'secret' }]);
    const item = (exported.item as Record<string, Record<string, unknown>>[])[0];
    expect(item.request).toMatchObject({ method: 'GET', url: { raw: expect.any(String) } });
    expect(item.request.body).toMatchObject({ mode: 'raw', options: { raw: { language: 'json' } } });
    expect(item.request.auth).toMatchObject({ type: 'basic' });
  });

  test('导出→导入往返保留方法/URL/头/体/auth', () => {
    const { collection: original } = importPostman(V21_FIXTURE);
    const revived = importPostman(JSON.stringify(exportPostman(original))).collection;
    const before = walkRequests(original.root);
    const after = walkRequests(revived.root);
    expect(after.map((r) => [r.method, r.url, r.body.text])).toEqual(before.map((r) => [r.method, r.url, r.body.text]));
    expect(after.find((r) => r.name === 'Create user')?.auth).toEqual({ type: 'bearer', token: 'tkn-123' });
  });
});
