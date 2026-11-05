import { describe, expect, test } from 'vitest';
import { ToolError } from '../errors';
import { tl, type Localized } from '@/i18n/locale';
import { MAX_SCRIPT_CHARS } from './scriptEngine';
import { exportPostman, importPostman, postmanNoteText } from './transfer';
import { walkRequests, blankRequest, newCollection } from './tree';

/** 断言只看中文那半，`Localized` 本身可能是字符串。 */
const zh = (value: Localized): string => tl(value, 'zh');

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
    expect(ignored).toEqual([]);
    // 请求级 event 现在是搬进来了，不是「跳过」
    expect(list.testScript).toBe('pm.test("x", () => pm.expect(1).to.be(1));');
    expect(list.preScript).toBeUndefined();
    expect(walkRequests(collection.root)).toHaveLength(3);
  });

  test('脚本映射：预请求/测试各归位，多余的说清楚', () => {
    const { collection, ignored } = importPostman(JSON.stringify({
      info: { name: 'scripts' },
      item: [
        {
          name: 'S',
          event: [
            { listen: 'prerequest', script: { exec: ['pm.variables.set("a", "1");'] } },
            { listen: 'test', script: { exec: ['pm.test("t", () => {});', 'pm.test("u", () => {});'] } },
            { listen: 'test', script: { exec: 'pm.test("second", () => {});' } },
            { listen: 'finalize', script: { exec: 'noop();' } },
          ],
          request: { method: 'GET', url: 'https://a' },
        },
      ],
    }));
    const s = collection.root.requests[0];
    expect(s.preScript).toBe('pm.variables.set("a", "1");');
    expect(s.testScript).toBe('pm.test("t", () => {});\npm.test("u", () => {});');
    expect(ignored).toEqual(['duplicate-script', 'unsupported-event']);
  });

  test('脚本导出成 event 后再导回来，内容不丢', () => {
    const request = { ...blankRequest(), name: 'R', preScript: 'pm.variables.set("a","1");', testScript: 'pm.test("t", () => {});' };
    const collection = newCollection('Round trip');
    collection.root.requests.push(request);
    const exported = JSON.stringify(exportPostman(collection));
    const again = importPostman(exported);
    expect(again.ignored).toEqual([]);
    expect(again.collection.root.requests[0].preScript).toBe(request.preScript);
    expect(again.collection.root.requests[0].testScript).toBe(request.testScript);
  });

  test('超过上限的脚本截到上限并说明', () => {
    const { collection, ignored } = importPostman(JSON.stringify({
      info: { name: 'big' },
      item: [{ name: 'B', event: [{ listen: 'test', script: { exec: 'x'.repeat(MAX_SCRIPT_CHARS + 10) } }], request: { method: 'GET', url: 'https://a' } }],
    }));
    expect(collection.root.requests[0].testScript).toHaveLength(MAX_SCRIPT_CHARS);
    expect(ignored).toEqual(['script-truncated']);
  });

  test('导入说明是本机语言，不是机器码', () => {
    expect(zh(postmanNoteText('method-TEAPOT'))).toContain('TEAPOT');
    expect(zh(postmanNoteText('folder-script'))).toContain('文件夹');
    expect(zh(postmanNoteText('whatever'))).toBe('whatever');
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
    // 数字开头的动词连合法名词都算不上，只能跳过并说清。
    expect(() => importPostman(JSON.stringify({ info: { name: 'x' }, item: [{ name: 'T', request: { method: '1ABC', url: 'https://a' } }] }))).toThrow(/没有可导入的请求/);
  });

  test('自定义动词按 customMethod 收下，不再当不支持丢掉', () => {
    const { collection, ignored } = importPostman(JSON.stringify({
      info: { name: 'WebDAV' },
      item: [{ name: 'Probe', request: { method: 'PROPFIND', url: 'https://a/.well-known' } }],
    }));
    const probe = collection.root.requests[0];
    expect([probe.method, probe.customMethod]).toEqual(['GET', 'PROPFIND']);
    expect(ignored).toEqual([]);
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

  test('参数表格并进 raw URL，自定义动词不被写回 GET', () => {
    const collection = newCollection('Params');
    collection.root.requests = [
      {
        ...blankRequest(),
        name: 'Search',
        method: 'GET',
        customMethod: 'PROPFIND',
        url: 'https://api.test/dav',
        params: [{ key: 'q', value: 'a b', enabled: true }],
      },
    ];
    const exported = exportPostman(collection);
    const item = (exported.item as Record<string, Record<string, unknown>>[])[0];
    expect(item.request).toMatchObject({ method: 'PROPFIND', url: { raw: 'https://api.test/dav?q=a b' } });
    const back = importPostman(JSON.stringify(exported)).collection.root.requests[0];
    // Postman 只在 raw URL 里放查询串，所以回导后 URL 与表格是同一份内容的两种视图。
    expect([back.customMethod, back.url, back.params]).toEqual(['PROPFIND', 'https://api.test/dav?q=a b', [{ key: 'q', value: 'a b', enabled: true }]]);
  });
});
