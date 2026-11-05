import { describe, expect, test } from 'vitest';
import { ToolError } from '../errors';
import { importHar, harNoteText } from './har';

const HAR = JSON.stringify({
  log: {
    version: '1.2',
    creator: { name: 'Chrome DevTools', version: '157' },
    entries: [
      {
        request: {
          method: 'GET',
          url: 'https://api.test/users?page=2&tab=me',
          httpVersion: 'HTTP/1.1',
          headers: [
            { name: 'Accept', value: 'application/json' },
            { name: 'Cookie', value: 'sid=1' },
            { name: '', value: 'skip me' },
          ],
          queryString: [{ name: 'extra', value: '1' }],
          cookies: [{ name: 'sid', value: '1' }],
        },
        response: { status: 200, content: { text: '{"ok":true}' } },
        timings: { send: 0, wait: 12, receive: 3 },
      },
      {
        request: {
          method: 'post',
          url: 'https://api.test/items',
          headers: [{ name: 'Content-Type', value: 'application/json' }],
          queryString: [],
          postData: { mimeType: 'application/json', text: '{"a":1}' },
        },
        response: { status: 201 },
      },
      {
        request: {
          method: 'PROPFIND',
          url: 'https://dav.test/files',
          headers: [],
          queryString: [],
          postData: {
            mimeType: 'multipart/form-data',
            params: [
              { name: 'note', value: 'hi' },
              { name: 'avatar', fileName: 'cat.png', contentType: 'image/png', value: '3145' },
            ],
          },
        },
      },
      { request: { method: 'GET', url: '', headers: [] } },
    ],
  },
});

const zh = (value: ReturnType<typeof harNoteText>) => (typeof value === 'string' ? value : value.zh);

describe('importHar', () => {
  test('URL 上的查询串进参数表，queryString 只补没有的键', () => {
    const { collection } = importHar(HAR);
    const first = collection.root.requests[0];

    expect(collection.name).toBe('Chrome DevTools');
    expect(collection.root.requests).toHaveLength(3);
    // URL 与参数表是同一个查询串的两种视图，两边都得有，否则 URL 框里看不到查询串。
    expect(first.url).toBe('https://api.test/users?page=2&tab=me&extra=1');
    expect(first.params?.map((row) => [row.key, row.value])).toEqual([['page', '2'], ['tab', 'me'], ['extra', '1']]);
    expect(first.name).toBe('GET /users');
  });

  test('headers 用 name/value，空名的行丢掉', () => {
    const { collection } = importHar(HAR);
    expect(collection.root.requests[0].headers).toEqual([
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: 'Cookie', value: 'sid=1', enabled: true },
    ]);
  });

  test('body 按 mimeType 分流，multipart 的文件只留元数据', () => {
    const { collection, ignored } = importHar(HAR);
    const post = collection.root.requests[1];
    const dav = collection.root.requests[2];

    expect(post.method).toBe('POST');
    expect(post.body).toEqual({ mode: 'json', text: '{"a":1}' });
    expect(dav.method).toBe('GET');
    expect(dav.customMethod).toBe('PROPFIND');
    expect(dav.body.multipart).toEqual([
      { key: 'note', type: 'text', value: 'hi' },
      { key: 'avatar', type: 'file', value: '', fileName: 'cat.png', mime: 'image/png' },
    ]);
    expect(ignored).toEqual(expect.arrayContaining(['file-field', 'response-ignored', 'bad-entry']));
  });

  test('表单编码优先用 text，没有就用 params 拼', () => {
    const { collection } = importHar(JSON.stringify({
      log: { entries: [
        { request: { method: 'POST', url: 'https://a.test/f', headers: [], postData: { mimeType: 'application/x-www-form-urlencoded', params: [{ name: 'a', value: '1' }, { name: 'b', value: '2' }] } } },
      ] },
    }));
    expect(collection.root.requests[0].body).toEqual({ mode: 'form', text: 'a=1&b=2' });
  });

  test('不是 HAR 就报错，而不是给一个空集合', () => {
    expect(() => importHar('nope')).toThrowError(ToolError);
    expect(() => importHar('{"hello":1}')).toThrowError(/不是 HAR/);
    expect(() => importHar(JSON.stringify({ log: { entries: [{ request: { method: 'GET', url: '' } }] } }))).toThrowError(/没有可导入的请求/);
  });

  test('说明码给人话', () => {
    expect(zh(harNoteText('response-ignored'))).toContain('响应');
    expect(zh(harNoteText('other'))).toBe('other');
  });
});
