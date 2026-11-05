import type { Localized } from '@/i18n/locale';
import { finalUrl } from './params';
import { toCurl } from './transfer';
import { extractVars } from './vars';
import type { WbBodyMode, WbRequest } from './types';

export type CodegenId = 'curl' | 'fetch' | 'axios' | 'node-axios' | 'python' | 'go' | 'java' | 'php';

export interface CodegenLanguage {
  id: CodegenId;
  label: Localized;
  /** 「先替换变量」那行注释用的注释符。 */
  comment: string;
}

export const CODEGEN_LANGUAGES: CodegenLanguage[] = [
  { id: 'curl', label: { zh: 'cURL', en: 'cURL' }, comment: '#' },
  { id: 'fetch', label: { zh: 'JavaScript fetch', en: 'JavaScript fetch' }, comment: '//' },
  { id: 'axios', label: { zh: 'Axios（浏览器）', en: 'Axios (browser)' }, comment: '//' },
  { id: 'node-axios', label: { zh: 'Axios（Node）', en: 'Axios (Node)' }, comment: '//' },
  { id: 'python', label: { zh: 'Python requests', en: 'Python requests' }, comment: '#' },
  { id: 'go', label: { zh: 'Go net/http', en: 'Go net/http' }, comment: '//' },
  { id: 'java', label: { zh: 'Java OkHttp', en: 'Java OkHttp' }, comment: '//' },
  { id: 'php', label: { zh: 'PHP curl', en: 'PHP curl' }, comment: '//' },
];

export interface SnippetFile {
  key: string;
  name: string;
  mime: string;
}

export interface SnippetBody {
  kind: 'none' | 'raw' | 'multipart';
  /** raw：已经定型的正文（json/text/form 的原文、GraphQL 序列化后的 JSON）。 */
  text: string;
  fields: [string, string][];
  /** multipart 的文件字段：字节只在本页内存里，片段只能按文件名引用。 */
  files: SnippetFile[];
}

export interface SnippetPlan {
  method: string;
  /** 参数表已并进查询串；`{{变量}}` 保持字面量，不替用户猜值。 */
  url: string;
  /** 最终请求头（含 api-key、Bearer、Content-Type）；multipart 不含 Content-Type。 */
  headers: [string, string][];
  /** Basic 单独留出来：各语言在运行时编码，免得片段里写死一串过期的 base64。 */
  basic: { username: string; password: string } | null;
  body: SnippetBody;
  /** 片段里仍是字面量的变量名，用来生成「先替换」那行说明。 */
  variables: string[];
}

const BODY_CONTENT_TYPE: Record<WbBodyMode, string | null> = {
  none: null,
  json: 'application/json',
  text: 'text/plain',
  form: 'application/x-www-form-urlencoded',
  multipart: null,
  graphql: 'application/json',
};

/** 双引号转义：JS / Go / Java / Python 共用同一套，`{{var}}` 原样留在字符串里。 */
function dq(value: string): string {
  let out = '"';
  for (const ch of value) {
    if (ch === '"' || ch === '\\') out += `\\${ch}`;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else out += ch;
  }
  return `${out}"`;
}

/** PHP 单引号：双引号里的 `$` 会被当成变量插值，值一律走单引号。 */
function phpStr(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function hasHeader(headers: [string, string][], name: string): boolean {
  return headers.some(([key]) => key.toLowerCase() === name.toLowerCase());
}

function graphqlJson(req: WbRequest): string {
  const graphql = req.body.graphql;
  if (!graphql?.query.trim()) return '';
  let variables: unknown = {};
  if (graphql.variables.trim()) {
    try {
      const parsed = JSON.parse(graphql.variables) as unknown;
      if (parsed !== null && typeof parsed === 'object') variables = parsed;
    } catch {
      // 变量写坏就当没有，和发送前那次校验的口径一致：坏 JSON 不是 GraphQL 变量。
    }
  }
  return JSON.stringify({
    query: graphql.query,
    variables,
    ...(graphql.operationName?.trim() ? { operationName: graphql.operationName.trim() } : {}),
  });
}

const EMPTY_BODY: SnippetBody = { kind: 'none', text: '', fields: [], files: [] };

/** 把请求拆成语言无关的一张计划表；生成器只排版，不再各自猜语义。 */
export function snippetPlan(req: WbRequest): SnippetPlan {
  const method = req.customMethod?.trim() || req.method;
  let url = finalUrl(req.url, req.params);
  const headers: [string, string][] = [];
  for (const row of req.headers) {
    if (!row.enabled || !row.key.trim()) continue;
    headers.push([row.key.trim(), row.value]);
  }

  const auth = req.auth;
  let basic: SnippetPlan['basic'] = null;
  if (auth.type === 'basic') basic = { username: auth.username ?? '', password: auth.password ?? '' };
  else if (auth.type === 'bearer' && auth.token) headers.push(['Authorization', `Bearer ${auth.token}`]);
  else if (auth.type === 'oauth2' && auth.accessToken) {
    headers.push(['Authorization', `${auth.tokenType?.trim() || 'Bearer'} ${auth.accessToken}`]);
  } else if (auth.type === 'api-key' && auth.key?.trim()) {
    const prefix = auth.headerPrefix?.trim();
    const value = auth.value ?? '';
    if (auth.in === 'query') url = `${url}${url.includes('?') ? '&' : '?'}${auth.key.trim()}=${value}`;
    else headers.push([auth.key.trim(), prefix ? `${prefix} ${value}` : value]);
  }

  const mode = req.body.mode;
  const sendsBody = mode !== 'none' && method !== 'GET' && method !== 'HEAD';
  let body = EMPTY_BODY;
  if (sendsBody && mode === 'multipart') {
    const parts = req.body.multipart ?? [];
    body = {
      kind: 'multipart',
      text: '',
      fields: parts.filter((part) => part.type === 'text' && part.key.trim()).map((part) => [part.key.trim(), part.value]),
      files: parts
        .filter((part) => part.type === 'file' && part.key.trim())
        .map((part) => ({
          key: part.key.trim(),
          name: part.fileName || part.key.trim(),
          mime: part.mime || 'application/octet-stream',
        })),
    };
  } else if (sendsBody) {
    const text = mode === 'graphql' ? graphqlJson(req) : req.body.text;
    if (text) body = { kind: 'raw', text, fields: [], files: [] };
  }
  if (body.kind === 'raw' && !hasHeader(headers, 'content-type')) {
    const contentType = BODY_CONTENT_TYPE[mode];
    if (contentType) headers.push(['Content-Type', contentType]);
  }

  const haystack = [url, basic?.username ?? '', basic?.password ?? '', ...headers.flat()];
  if (body.kind === 'raw') haystack.push(body.text);
  else if (body.kind === 'multipart') {
    haystack.push(...body.fields.flat(), ...body.files.map((file) => `${file.key}=${file.name}`));
  }
  return { method, url, headers, basic, body, variables: [...new Set(haystack.flatMap(extractVars))] };
}

/** 没有变量就不啰嗦；PHP/Python 之外的注释符都是 `//`。 */
function variableNote(plan: SnippetPlan, comment: string): string {
  if (plan.variables.length === 0) return '';
  return `${comment} 先替换 ${plan.variables.map((name) => `{{${name}}}`).join('、')}，片段里保留的是占位原样。\n`;
}

function jsHeaderRows(plan: SnippetPlan, basicAsHeader: boolean): string[] {
  const rows = plan.headers
    .filter(([key]) => !skipContentType(plan, key))
    .map(([key, value]) => `    ${dq(key)}: ${dq(value)},`);
  if (plan.basic && basicAsHeader) {
    rows.push(`    Authorization: 'Basic ' + btoa(${dq(`${plan.basic.username}:${plan.basic.password}`)}),`);
  }
  return rows;
}

function contentTypeOf(plan: SnippetPlan): string {
  const at = plan.headers.find(([key]) => key.toLowerCase() === 'content-type');
  return at ? at[1] : 'application/octet-stream';
}

/** multipart 的 boundary 由运行时补，手写会让服务端解不出字段。 */
function skipContentType(plan: SnippetPlan, key: string): boolean {
  return plan.body.kind === 'multipart' && key.toLowerCase() === 'content-type';
}

function generateFetch(plan: SnippetPlan): string {
  const lines: string[] = [];
  if (plan.body.kind === 'multipart') {
    lines.push('// 文件字节没有存在本页，先自己拿到一个 File（例如 <input type="file"> 选出来的）');
    lines.push('const form = new FormData();');
    for (const [key, value] of plan.body.fields) lines.push(`form.append(${dq(key)}, ${dq(value)});`);
    for (const file of plan.body.files) lines.push(`form.append(${dq(file.key)}, fileBlob, ${dq(file.name)});`);
    lines.push('');
  }
  lines.push(`const response = await fetch(${dq(plan.url)}, {`);
  lines.push(`  method: ${dq(plan.method)},`);
  const headerRows = jsHeaderRows(plan, true);
  if (headerRows.length) lines.push('  headers: {', ...headerRows, '  },');
  if (plan.body.kind === 'raw') lines.push(`  body: ${dq(plan.body.text)},`);
  if (plan.body.kind === 'multipart') lines.push('  body: form,');
  lines.push('});');
  lines.push('console.log(response.status, await response.text());');
  return lines.join('\n');
}

function generateAxios(plan: SnippetPlan, node: boolean): string {
  const lines: string[] = [];
  if (plan.body.kind === 'multipart') {
    if (node) lines.push(`const fs = require('fs');`, `const FormData = require('form-data');`);
    lines.push('const form = new FormData();');
    for (const [key, value] of plan.body.fields) lines.push(`form.append(${dq(key)}, ${dq(value)});`);
    for (const file of plan.body.files) {
      lines.push(node
        ? `form.append(${dq(file.key)}, fs.createReadStream(${dq(file.name)}));`
        : `form.append(${dq(file.key)}, fileBlob, ${dq(file.name)}); // fileBlob 自己从 <input type="file"> 拿`);
    }
    lines.push('');
  }
  lines.push(node ? `const axios = require('axios');` : `import axios from 'axios';`, '');
  lines.push('const response = await axios({', `  url: ${dq(plan.url)},`, `  method: ${dq(plan.method.toLowerCase())},`);
  const headerLines = jsHeaderRows(plan, false);
  if (headerLines.length) lines.push('  headers: {', ...headerLines, '  },');
  if (plan.basic) {
    lines.push('  auth: {', `    username: ${dq(plan.basic.username)},`, `    password: ${dq(plan.basic.password)},`, '  },');
  }
  if (plan.body.kind === 'raw') lines.push(`  data: ${dq(plan.body.text)},`);
  if (plan.body.kind === 'multipart') lines.push('  data: form,');
  lines.push('});');
  lines.push('console.log(response.status, response.data);');
  return lines.join('\n');
}

function generatePython(plan: SnippetPlan): string {
  const lines = ['import requests'];
  if (plan.basic) lines.push('from requests.auth import HTTPBasicAuth');
  lines.push('', `url = ${dq(plan.url)}`);
  if (plan.headers.length) {
    lines.push('headers = {', ...plan.headers.map(([key, value]) => `    ${dq(key)}: ${dq(value)},`), '}');
  }
  if (plan.body.kind === 'raw') lines.push(`payload = ${dq(plan.body.text)}`);
  if (plan.body.kind === 'multipart') {
    if (plan.body.fields.length) {
      lines.push('data = {', ...plan.body.fields.map(([key, value]) => `    ${dq(key)}: ${dq(value)},`), '}');
    }
    if (plan.body.files.length) {
      lines.push('files = {', ...plan.body.files.map((file) => `    ${dq(file.key)}: open(${dq(file.name)}, "rb"),`), '}');
      lines.push('# open() 拿到的句柄用完请 close');
    }
    lines.push('');
  }
  const args = [`"${plan.method}"`, 'url'];
  if (plan.headers.length) args.push('headers=headers');
  if (plan.basic) args.push(`auth=HTTPBasicAuth(${dq(plan.basic.username)}, ${dq(plan.basic.password)})`);
  if (plan.body.kind === 'raw') args.push('data=payload');
  if (plan.body.kind === 'multipart') {
    if (plan.body.fields.length) args.push('data=data');
    if (plan.body.files.length) args.push('files=files');
  }
  lines.push('', `response = requests.request(${args.join(', ')})`, 'print(response.status_code, response.text)');
  return lines.join('\n');
}

function generateGo(plan: SnippetPlan): string {
  const packages = new Set(['fmt', 'io', 'net/http']);
  if (plan.body.kind === 'raw') packages.add('bytes');
  if (plan.body.kind === 'multipart') {
    packages.add('bytes');
    packages.add('mime/multipart');
    packages.add('os');
  }
  const lines = ['package main', '', 'import ('];
  for (const pkg of [...packages].sort()) lines.push(`\t"${pkg}"`);
  lines.push(')', '', 'func main() {');

  if (plan.body.kind === 'raw') {
    lines.push(`\tpayload := bytes.NewBufferString(${dq(plan.body.text)})`);
    lines.push(`\treq, err := http.NewRequest(${dq(plan.method)}, ${dq(plan.url)}, payload)`);
  } else if (plan.body.kind === 'multipart') {
    lines.push('\tvar buf bytes.Buffer');
    lines.push('\twriter := multipart.NewWriter(&buf)');
    for (const [key, value] of plan.body.fields) lines.push(`\twriter.WriteField(${dq(key)}, ${dq(value)})`);
    for (const file of plan.body.files) {
      lines.push(`\tfile, err := os.Open(${dq(file.name)}) // 换成你的文件路径`);
      lines.push('\tif err != nil { panic(err) }');
      lines.push('\tdefer file.Close()');
      lines.push(`\tpart, err := writer.CreateFormFile(${dq(file.key)}, ${dq(file.name)})`);
      lines.push('\tif err != nil { panic(err) }');
      lines.push('\tio.Copy(part, file)');
    }
    lines.push('\twriter.Close()');
    lines.push(`\treq, err := http.NewRequest(${dq(plan.method)}, ${dq(plan.url)}, &buf)`);
  } else {
    lines.push(`\treq, err := http.NewRequest(${dq(plan.method)}, ${dq(plan.url)}, nil)`);
  }
  lines.push('\tif err != nil { panic(err) }');
  if (plan.body.kind === 'multipart') lines.push('\treq.Header.Set("Content-Type", writer.FormDataContentType())');
  if (plan.basic) lines.push(`\treq.SetBasicAuth(${dq(plan.basic.username)}, ${dq(plan.basic.password)})`);
  for (const [key, value] of plan.headers) {
    if (skipContentType(plan, key)) continue;
    lines.push(`\treq.Header.Set(${dq(key)}, ${dq(value)})`);
  }
  lines.push('', '\tresp, err := http.DefaultClient.Do(req)');
  lines.push('\tif err != nil { panic(err) }');
  lines.push('\tdefer resp.Body.Close()');
  lines.push('\tbody, _ := io.ReadAll(resp.Body)');
  lines.push('\tfmt.Println(resp.Status, string(body))');
  lines.push('}');
  return lines.join('\n');
}

function generateJava(plan: SnippetPlan): string {
  const lines: string[] = ['import okhttp3.*;'];
  if (plan.body.kind === 'multipart') lines.push('import java.io.File;');
  lines.push('', 'public class RequestDemo {', '  public static void main(String[] args) throws Exception {', '    OkHttpClient client = new OkHttpClient();');
  if (plan.body.kind === 'raw') {
    lines.push(`    MediaType mediaType = MediaType.parse(${dq(contentTypeOf(plan))});`);
    lines.push(`    RequestBody body = RequestBody.create(mediaType, ${dq(plan.body.text)});`);
  } else if (plan.body.kind === 'multipart') {
    lines.push('    MultipartBody.Builder form = new MultipartBody.Builder().setType(MultipartBody.FORM);');
    for (const [key, value] of plan.body.fields) lines.push(`    form.addFormDataPart(${dq(key)}, ${dq(value)});`);
    for (const file of plan.body.files) {
      lines.push(`    // ${dq(file.name)} 要在这个进程读得到的路径`);
      lines.push(`    form.addFormDataPart(${dq(file.key)}, ${dq(file.name)}, RequestBody.create(MediaType.parse(${dq(file.mime)}), new File(${dq(file.name)})));`);
    }
    lines.push('    RequestBody body = form.build();');
  } else {
    lines.push('    RequestBody body = null;');
  }
  lines.push('    Request request = new Request.Builder()', `      .url(${dq(plan.url)})`, `      .method(${dq(plan.method)}, body)`);
  for (const [key, value] of plan.headers) {
    if (skipContentType(plan, key)) continue;
    lines.push(`      .addHeader(${dq(key)}, ${dq(value)})`);
  }
  if (plan.basic) {
    lines.push(`      .addHeader("Authorization", Credentials.basic(${dq(plan.basic.username)}, ${dq(plan.basic.password)}))`);
  }
  lines.push('      .build();');
  lines.push('    try (Response response = client.newCall(request).execute()) {');
  lines.push('      System.out.println(response.code() + " " + response.body().string());', '    }', '  }', '}');
  return lines.join('\n');
}

function generatePhp(plan: SnippetPlan): string {
  const lines = ['<?php', '', '$curl = curl_init();', '', 'curl_setopt_array($curl, ['];
  lines.push(`  CURLOPT_URL => ${phpStr(plan.url)},`);
  lines.push('  CURLOPT_RETURNTRANSFER => true,');
  lines.push('  CURLOPT_FOLLOWLOCATION => true,');
  lines.push(`  CURLOPT_CUSTOMREQUEST => ${phpStr(plan.method)},`);
  if (plan.basic) lines.push(`  CURLOPT_USERPWD => ${phpStr(`${plan.basic.username}:${plan.basic.password}`)},`);
  const headerRows = plan.headers.filter(([key]) => !skipContentType(plan, key)).map(([key, value]) => phpStr(`${key}: ${value}`));
  if (headerRows.length) lines.push('  CURLOPT_HTTPHEADER => [', ...headerRows.map((row) => `    ${row},`), '  ],');
  if (plan.body.kind === 'raw') lines.push(`  CURLOPT_POSTFIELDS => ${phpStr(plan.body.text)},`);
  if (plan.body.kind === 'multipart') {
    const posts = plan.body.fields.map(([key, value]) => `    ${phpStr(key)} => ${phpStr(value)},`);
    for (const file of plan.body.files) {
      posts.push(`    ${phpStr(file.key)} => new CURLFile(${phpStr(file.name)}, ${phpStr(file.mime)}, ${phpStr(file.name)}),`);
    }
    if (posts.length) lines.push('  CURLOPT_POSTFIELDS => [', ...posts, '  ],');
  }
  lines.push(']);', '', '$response = curl_exec($curl);');
  lines.push('if ($response === false) {', '  echo curl_error($curl);', '} else {', '  echo $response;', '}');
  lines.push('curl_close($curl);');
  return lines.join('\n');
}

/**
 * 请求 → 某语言的可复制片段。
 *
 * 变量保持 `{{字面量}}`：静态站没有后端，替用户猜一个值只会让代码看起来能跑。
 * multipart 的文件字节只存在本页内存，所以片段一律按文件名引用，并在注释里说明。
 *
 * 这里不走 `lib/curl` 的 curlToCode：那条链路的输入是一行 curl 命令，
 * `-F` 文件字段进不去，而工作台请求是结构化的，不需要绕道 shell 再猜回来。
 */
export function generateSnippet(req: WbRequest, id: CodegenId): string {
  if (id === 'curl') return toCurl(req);
  const plan = snippetPlan(req);
  const language = CODEGEN_LANGUAGES.find((item) => item.id === id) ?? CODEGEN_LANGUAGES[0];
  const code = id === 'fetch'
    ? generateFetch(plan)
    : id === 'axios'
      ? generateAxios(plan, false)
      : id === 'node-axios'
        ? generateAxios(plan, true)
        : id === 'python'
          ? generatePython(plan)
          : id === 'go'
            ? generateGo(plan)
            : id === 'java'
              ? generateJava(plan)
              : generatePhp(plan);
  return `${variableNote(plan, language.comment)}${code}`;
}
