import { describe, expect, test } from 'vitest';
import { curlToCode, parseCurl, tokenizeShell } from './curl';

describe('tokenizeShell', () => {
  test('handles quotes and escapes', () => {
    expect(tokenizeShell("curl 'https://a.cn' -H \"Authorization: Bearer t\"")).toEqual([
      'curl',
      'https://a.cn',
      '-H',
      'Authorization: Bearer t',
    ]);
  });

  test('handles line continuation', () => {
    expect(tokenizeShell("curl \\\n https://a.cn \\\n -X POST")).toEqual(['curl', 'https://a.cn', '-X', 'POST']);
  });

  test('rejects unbalanced quotes', () => {
    expect(() => tokenizeShell("curl 'abc")).toThrow('单引号没有闭合');
    expect(() => tokenizeShell('curl "abc')).toThrow('双引号没有闭合');
  });
});

describe('parseCurl', () => {
  test('basic get', () => {
    const req = parseCurl('curl https://example.com/api');
    expect(req).toEqual({ url: 'https://example.com/api', method: 'GET', headers: {}, data: null, auth: null });
  });

  test('post with headers and data', () => {
    const req = parseCurl(`curl -X POST 'https://ex.cn/q?a=1' -H 'Content-Type: application/json' -H 'X-A: b' -d '{"k":1}'`);
    expect(req.method).toBe('POST');
    expect(req.headers['Content-Type']).toBe('application/json');
    expect(req.headers['X-A']).toBe('b');
    expect(req.data).toBe('{"k":1}');
  });

  test('implicit post with data, joined by &', () => {
    const req = parseCurl("curl -d 'a=1' -d 'b=2' https://ex.cn");
    expect(req.method).toBe('POST');
    expect(req.data).toBe('a=1&b=2');
  });

  test('-G moves data to query', () => {
    const req = parseCurl("curl -G -d 'q=hi' https://ex.cn/search");
    expect(req.method).toBe('GET');
    expect(req.url).toBe('https://ex.cn/search?q=hi');
  });

  test('-A -e -b -u shortcuts', () => {
    const req = parseCurl("curl -A 'UA/1' -e 'https://ref' -b 'c=1' -u tom:pw https://ex.cn");
    expect(req.headers['User-Agent']).toBe('UA/1');
    expect(req.headers.Referer).toBe('https://ref');
    expect(req.headers.Cookie).toBe('c=1');
    expect(req.auth).toEqual({ username: 'tom', password: 'pw' });
  });

  test('ignores common noise flags', () => {
    expect(() => parseCurl('curl -sSL --compressed -k https://ex.cn')).not.toThrow();
  });

  test('errors', () => {
    expect(() => parseCurl('curl -X POST')).toThrow('未找到请求 URL');
    expect(() => parseCurl('curl -X')).toThrow('缺少参数');
    expect(() => parseCurl('curl --weird https://ex.cn')).toThrow('不支持的选项');
    expect(() => parseCurl('curl -H badheader https://ex.cn')).toThrow('请求头格式');
    expect(() => parseCurl('   ')).toThrow('未找到 curl 命令');
  });
});

describe('curlToCode', () => {
  const cmd = `curl -X POST 'https://api.ex.cn/v1/items' -H 'Content-Type: application/json' -H 'Accept: */*' -d '{"name":"a b"}'`;

  test('python requests', () => {
    const code = curlToCode(cmd, 'python');
    expect(code).toContain('import requests');
    expect(code).toContain('response = requests.request("POST", url, headers=headers, data=payload)');
  });

  test('feapder', () => {
    const code = curlToCode(cmd, 'feapder');
    expect(code).toContain('import feapder');
    expect(code).toContain('class ApiSpider(feapder.AirSpider):');
    expect(code).toContain('yield feapder.Request(url="https://api.ex.cn/v1/items", method="post", headers=headers, data=data)');
  });

  test('php', () => {
    const code = curlToCode(cmd, 'php');
    expect(code).toContain('curl_setopt_array($curl, [');
    expect(code).toContain("CURLOPT_POSTFIELDS => '{\"name\":\"a b\"}',");    expect(code).toContain("'Content-Type: application/json',");
  });

  test('java', () => {
    const code = curlToCode(cmd, 'java');
    expect(code).toContain('HttpClient client = HttpClient.newHttpClient();');
    expect(code).toContain('.POST(HttpRequest.BodyPublishers.ofString("{\\"name\\":\\"a b\\"}"))');
  });

  test('nodejs', () => {
    const code = curlToCode(cmd, 'nodejs');
    expect(code).toContain("const axios = require('axios');");
    expect(code).toContain("method: \"post\",");
  });

  test('javascript fetch', () => {
    const code = curlToCode(cmd, 'javascript');
    expect(code).toContain('fetch("https://api.ex.cn/v1/items", options)');
    expect(code).toContain("method: \"POST\",");
  });

  test('golang', () => {
    const code = curlToCode(cmd, 'golang');
    expect(code).toContain('package main');
    expect(code).toContain('req.Header.Add(`Accept`, `*/*`)');
    expect(code).toContain('http.NewRequest(`POST`, url, payload)');
  });

  test('simple get without body', () => {
    const code = curlToCode('curl https://a.cn', 'python');
    expect(code).toContain('requests.request("GET", url)');
    expect(curlToCode('curl https://a.cn', 'java')).toContain('.GET()');
    expect(curlToCode('curl https://a.cn', 'golang')).toContain('url, nil)');
  });

  test('basic auth injected as header', () => {
    const code = curlToCode('curl -u u:p https://a.cn', 'javascript');
    expect(code).toContain('Authorization');
  });
});
