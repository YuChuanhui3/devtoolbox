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

  test('basic auth → -u；bearer → Authorization 头', () => {
    expect(toCurl({ ...base, auth: { type: 'basic', username: 'u', password: 'p' } })).toContain("-u 'u:p'");
    expect(toCurl({ ...base, auth: { type: 'bearer', token: 'tk' } })).toContain("-H 'Authorization: Bearer tk'");
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

  test('未知方法报错', () => {
    expect(() => parseCurlToRequest("curl -X TEAPOT 'https://a'")).toThrowError(/TEAPOT/);
  });
});
