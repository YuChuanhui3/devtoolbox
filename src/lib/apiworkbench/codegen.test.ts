import { describe, expect, test } from 'vitest';
import { blankRequest } from './tree';
import { CODEGEN_LANGUAGES, generateSnippet, snippetPlan } from './codegen';
import type { CodegenId } from './codegen';
import type { WbRequest } from './types';

const IDS = CODEGEN_LANGUAGES.map((item) => item.id);

function req(overrides: Partial<WbRequest> = {}): WbRequest {
  return {
    ...blankRequest(),
    name: 'List users',
    method: 'POST',
    url: 'https://api.test/{{env}}/users',
    headers: [{ key: 'X-Trace', value: 'on', enabled: true }],
    body: { mode: 'json', text: '{"q":"{{keyword}}"}' },
    ...overrides,
  };
}

/** 每种语言都要出现的东西：方法、URL、自定义头、正文、变量占位。 */
function expectCommon(id: CodegenId, snippet: string) {
  expect(snippet).toContain('api.test/{{env}}/users');
  expect(snippet).toContain(id === 'php' ? `'X-Trace: on'` : '"X-Trace"');
  expect(snippet).toContain('{{keyword}}');
  expect(snippet).toContain('{{env}}');
}

describe('snippetPlan', () => {
  test('参数表并进 URL，api-key 按选择落 header 或 query', () => {
    const plan = snippetPlan(req({
      params: [{ key: 'page', value: '2', enabled: true }],
      auth: { type: 'api-key', in: 'query', key: 'k', value: '{{secret}}' },
    }));
    expect(plan.url).toBe('https://api.test/{{env}}/users?page=2&k={{secret}}');
    expect(plan.headers).toEqual([['X-Trace', 'on'], ['Content-Type', 'application/json']]);
  });

  test('GET 与 HEAD 不带正文，POST 才补 Content-Type', () => {
    expect(snippetPlan(req({ method: 'GET' })).body.kind).toBe('none');
    expect(snippetPlan(req({ method: 'HEAD' })).body.kind).toBe('none');
    expect(snippetPlan(req()).headers).toContainEqual(['Content-Type', 'application/json']);
  });

  test('自己写过 Content-Type 就不越俎代庖', () => {
    const plan = snippetPlan(req({ headers: [{ key: 'content-type', value: 'application/ld+json', enabled: true }] }));
    expect(plan.headers.filter(([key]) => key.toLowerCase() === 'content-type')).toHaveLength(1);
  });

  test('Basic 单独留着，不预先 base64', () => {
    const plan = snippetPlan(req({ auth: { type: 'basic', username: '{{user}}', password: 'p@ss' } }));
    expect(plan.basic).toEqual({ username: '{{user}}', password: 'p@ss' });
    expect(plan.variables).toEqual(expect.arrayContaining(['user']));
  });

  test('GraphQL 序列化成 JSON 正文，坏变量当没有', () => {
    const plan = snippetPlan(req({
      body: { mode: 'graphql', text: '', graphql: { query: 'query Me { me { id } }', variables: 'not json' } },
    }));
    expect(JSON.parse(plan.body.text)).toEqual({ query: 'query Me { me { id } }', variables: {} });
  });

  test('multipart 分成字段与文件，文件只带元数据', () => {
    const plan = snippetPlan(req({
      body: {
        mode: 'multipart',
        text: '',
        multipart: [
          { key: 'note', type: 'text', value: 'hi {{env}}' },
          { key: 'avatar', type: 'file', value: '', fileName: 'cat.png', mime: 'image/png' },
        ],
      },
    }));
    expect(plan.body.fields).toEqual([['note', 'hi {{env}}']]);
    expect(plan.body.files).toEqual([{ key: 'avatar', name: 'cat.png', mime: 'image/png' }]);
    // boundary 由运行时补，写死会把请求做坏。
    expect(plan.headers.some(([key]) => key.toLowerCase() === 'content-type')).toBe(false);
  });
});

describe('generateSnippet', () => {
  test('八种语言都能出片段，且保留变量占位', () => {
    const source = req();
    for (const id of IDS) {
      const snippet = generateSnippet(source, id);
      expect(snippet, id).not.toBe('');
      if (id !== 'curl') expectCommon(id, snippet);
    }
  });

  test('curl 直接复用 toCurl，行为不变', () => {
    const snippet = generateSnippet(req(), 'curl');
    expect(snippet).toContain("-X POST 'https://api.test/{{env}}/users'");
    expect(snippet).toContain("-H 'Content-Type: application/json'");
    expect(snippet).toContain("--data-raw '{\"q\":\"{{keyword}}\"}'");
  });

  test('有变量时第一行说明要先替换，没有变量就不啰嗦', () => {
    expect(generateSnippet(req(), 'python').split('\n')[0]).toContain('# 先替换 {{env}}、{{keyword}}');
    const plain = generateSnippet(req({ url: 'https://api.test/users', body: { mode: 'none', text: '' } }), 'fetch');
    expect(plain.split('\n')[0]).toBe('const response = await fetch("https://api.test/users", {');
  });

  test('fetch 用 btoa 现场编码 Basic，multipart 交给 FormData', () => {
    const basic = generateSnippet(req({ auth: { type: 'basic', username: 'u', password: 'p' }, body: { mode: 'none', text: '' } }), 'fetch');
    expect(basic).toContain("Authorization: 'Basic ' + btoa(\"u:p\"),");
    const multipart = generateSnippet(req({
      body: { mode: 'multipart', text: '', multipart: [{ key: 'note', type: 'text', value: 'hi' }] },
    }), 'fetch');
    expect(multipart).toContain('form.append("note", "hi");');
    expect(multipart).toContain('body: form,');
    expect(multipart).not.toContain('Content-Type');
  });

  test('axios 走 auth 选项，Node 版本用 require', () => {
    const browser = generateSnippet(req({ auth: { type: 'basic', username: 'u', password: 'p' } }), 'axios');
    expect(browser).toContain("import axios from 'axios';");
    expect(browser).toContain('  auth: {');
    expect(browser).not.toContain('btoa');
    const node = generateSnippet(req({ body: { mode: 'none', text: '' } }), 'node-axios');
    expect(node).toContain("const axios = require('axios');");
  });

  test('python 用 requests.request，Basic 用 HTTPBasicAuth', () => {
    const snippet = generateSnippet(req({ auth: { type: 'basic', username: 'u', password: 'p' } }), 'python');
    expect(snippet).toContain('from requests.auth import HTTPBasicAuth');
    expect(snippet).toContain('requests.request("POST", url, headers=headers, auth=HTTPBasicAuth("u", "p"), data=payload)');
  });

  test('go 的 import 跟着用法走，multipart 用 writer 补 boundary', () => {
    const plain = generateSnippet(req(), 'go');
    expect(plain).toContain('\t"bytes"');
    expect(plain).not.toContain('mime/multipart');
    const multipart = generateSnippet(req({
      body: { mode: 'multipart', text: '', multipart: [{ key: 'f', type: 'file', value: '', fileName: 'cat.png' }] },
    }), 'go');
    expect(multipart).toContain('"mime/multipart"');
    expect(multipart).toContain('req.Header.Set("Content-Type", writer.FormDataContentType())');
    expect(multipart).toContain('writer.CreateFormFile("f", "cat.png")');
  });

  test('java 用 OkHttp，GET 无 body 也要给出 null', () => {
    const snippet = generateSnippet(req({ method: 'GET', body: { mode: 'none', text: '' } }), 'java');
    expect(snippet).toContain('import okhttp3.*;');
    expect(snippet).toContain('RequestBody body = null;');
    expect(snippet).toContain('.method("GET", body)');
  });

  test('php 的值走单引号，$ 不会被当成插值', () => {
    const snippet = generateSnippet(req({
      headers: [{ key: 'X-Price', value: '$100', enabled: true }],
      body: { mode: 'text', text: 'cost: $100' },
    }), 'php');
    expect(snippet).toContain("CURLOPT_POSTFIELDS => 'cost: $100',");
    expect(snippet).toContain("'X-Price: $100'");
    expect(snippet).toContain("'https://api.test/{{env}}/users'");
  });

  test('自定义动词与单引号正文都不出坏串', () => {
    const snippet = generateSnippet(req({ customMethod: 'PROPFIND', body: { mode: 'text', text: "it's {{ok}}" } }), 'fetch');
    expect(snippet).toContain('method: "PROPFIND",');
    expect(snippet).toContain("body: \"it's {{ok}}\",");
  });
});
