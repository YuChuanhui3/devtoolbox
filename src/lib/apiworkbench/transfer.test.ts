import { describe, expect, test } from 'vitest';
import { parseCurl } from '../curl';
import { parseCurlToRequest, toCurl } from './transfer';
import type { WbRequest } from './types';

const base: WbRequest = {
  id: 'r1',
  name: 'demo',
  method: 'POST',
  url: 'https://api.example.com/v1/items?q=1',
  headers: [
    { key: 'Content-Type', value: 'application/json', enabled: true },
    { key: 'X-Trace', value: "o'brien", enabled: true },
    { key: 'Disabled', value: 'no', enabled: false },
  ],
  body: { mode: 'json', text: '{"a": 1}' },
  auth: { type: 'none' },
};

describe('toCurl', () => {
  test('GET 不带 -X，其他方法显式声明；禁用头被跳过', () => {
    const cmd = toCurl({ ...base, method: 'GET' });
    expect(cmd.startsWith('curl ')).toBe(true);
    expect(cmd).not.toContain('-X');
    expect(cmd).not.toContain('Disabled');
    expect(toCurl(base)).toContain("-X POST 'https://api.example.com/v1/items?q=1'");
  });

  test('单引号值安全转义并可被 parseCurl 还原', () => {
    const cmd = toCurl(base);
    const parsed = parseCurl(cmd);
    expect(parsed.url).toBe(base.url);
    expect(parsed.method).toBe('POST');
    expect(parsed.headers['X-Trace']).toBe("o'brien");
    expect(parsed.data).toBe('{"a": 1}');
  });

  test('没写 Content-Type 时按 body 模式补一个，写了就不插手', () => {
    const plain: WbRequest = { ...base, headers: [{ key: 'X-Trace', value: 'on', enabled: true }] };
    expect(toCurl(plain)).toContain("-H 'Content-Type: application/json'");
    expect(toCurl({ ...plain, body: { mode: 'text', text: 'hello' } })).toContain("-H 'Content-Type: text/plain'");
    expect(toCurl({ ...plain, body: { mode: 'form', text: 'a=1&b=2' } })).toContain("-H 'Content-Type: application/x-www-form-urlencoded'");
    expect(toCurl({ ...plain, body: { mode: 'none', text: '' } })).not.toContain('Content-Type');
    expect(toCurl({ ...plain, body: { mode: 'multipart', text: '', multipart: [{ key: 'f', type: 'text', value: '1' }] } })).not.toContain('Content-Type');
    // multipart 的 boundary 只能由 curl 自己生成，写死就解不出字段。
  });

  test('basic auth → -u；bearer → Authorization 头', () => {
    expect(toCurl({ ...base, auth: { type: 'basic', username: 'u', password: 'p' } })).toContain("-u 'u:p'");
    expect(toCurl({ ...base, auth: { type: 'bearer', token: 'tk' } })).toContain("-H 'Authorization: Bearer tk'");
  });

  test('oauth2 用拿到的令牌与前缀，api-key 按注入位置落成头或查询串', () => {
    expect(toCurl({ ...base, auth: { type: 'oauth2', accessToken: 'at', tokenType: 'MAC' } })).toContain("-H 'Authorization: MAC at'");
    expect(toCurl({ ...base, auth: { type: 'oauth2', accessToken: 'at' } })).toContain("-H 'Authorization: Bearer at'");
    expect(toCurl({ ...base, auth: { type: 'api-key', in: 'header', key: 'X-API-Key', value: 'v', headerPrefix: 'Token' } })).toContain("-H 'X-API-Key: Token v'");
    expect(toCurl({ ...base, auth: { type: 'api-key', in: 'query', key: 'k', value: 'v' } })).toContain("'https://api.example.com/v1/items?q=1&k=v'");
  });

  test('自定义动词照样带 -X，GraphQL 导出成 JSON 体', () => {
    expect(toCurl({ ...base, customMethod: 'PROPFIND' })).toContain('-X PROPFIND');
    const graphql = toCurl({
      ...base,
      body: { mode: 'graphql', text: '', graphql: { query: 'query { me }', variables: '{"id":"1"}', operationName: 'me' } },
    });
    expect(graphql).toContain('--data-raw');
    expect(JSON.parse(graphql.match(/--data-raw '(.*)'/)![1]).query).toBe('query { me }');
    expect(toCurl({ ...base, body: { mode: 'graphql', text: '', graphql: { query: '', variables: 'x' } } })).not.toContain('--data-raw');
  });

  test('multipart 用 -F，文件字段只留名字并附一行说明', () => {
    const cmd = toCurl({
      ...base,
      body: { mode: 'multipart', text: '', multipart: [{ key: 'note', type: 'text', value: 'hi' }, { key: 'doc', type: 'file', value: '', fileName: 'a.txt' }] },
    });
    expect(cmd).toContain("-F 'note=hi'");
    expect(cmd).toContain("-F 'doc=@a.txt'");
    expect(cmd.indexOf('#')).toBeGreaterThan(cmd.indexOf('-F'));
  });
});

describe('parseCurlToRequest', () => {
  test('往返等价：toCurl → parseCurlToRequest 保持方法/URL/头/体/auth', () => {
    const withAuth: WbRequest = {
      ...base,
      auth: { type: 'basic', username: 'user', password: 'pw' },
    };
    const back = parseCurlToRequest(toCurl(withAuth));
    expect(back.method).toBe('POST');
    expect(back.url).toBe(base.url);
    expect(back.auth).toEqual({ type: 'basic', username: 'user', password: 'pw' });
    expect(back.body.mode).toBe('json');
    expect(back.body.text).toBe('{"a": 1}');
    expect(back.headers.find((h) => h.key === 'X-Trace')?.value).toBe("o'brien");
  });

  test('JSON 体识别为 json、表单串识别为 form、GET 无体为 none', () => {
    expect(parseCurlToRequest(`curl -d '{"k":1}' 'https://a'`).body.mode).toBe('json');
    expect(parseCurlToRequest("curl -d 'a=1&b=2' 'https://a'").body.mode).toBe('form');
    expect(parseCurlToRequest("curl -d 'not a json {{{' 'https://a'").body.mode).toBe('text');
    expect(parseCurlToRequest('curl https://a').body.mode).toBe('none');
  });

  test('白名单外的合法动词落成自定义方法，非法动词才报错', () => {
    const teapot = parseCurlToRequest("curl -X TEAPOT 'https://a'");
    expect(teapot.customMethod).toBe('TEAPOT');
    expect(teapot.method).toBe('GET');
    expect(() => parseCurlToRequest("curl -X '1FOO BAR' 'https://a'")).toThrowError(/1FOO BAR/);
  });
});
