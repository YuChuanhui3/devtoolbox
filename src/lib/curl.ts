import { ToolError } from './errors';

export type CurlLang = 'python' | 'feapder' | 'php' | 'java' | 'nodejs' | 'javascript' | 'golang';

export const CURL_LANGS: { id: CurlLang; label: string }[] = [
  { id: 'python', label: 'Python' },
  { id: 'feapder', label: 'Feapder' },
  { id: 'php', label: 'PHP' },
  { id: 'java', label: 'Java' },
  { id: 'nodejs', label: 'Node.js' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'golang', label: 'Go' },
];

/** shell 词法切分：支持单双引号、反斜杠转义与行尾续行符。 */
export function tokenizeShell(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let hasCurrent = false;
  let i = 0;

  const isSpace = (c: string) => /\s/.test(c);

  while (i < input.length) {
    const ch = input[i];
    if (ch === '\\' && i + 1 < input.length && (input[i + 1] === '\n' || (input[i + 1] === '\r'))) {
      i += 2;
      continue;
    }
    if (ch === '\\' && i + 1 < input.length) {
      current += input[i + 1];
      hasCurrent = true;
      i += 2;
      continue;
    }
    if (isSpace(ch)) {
      if (hasCurrent) {
        tokens.push(current);
        current = '';
        hasCurrent = false;
      }
      i += 1;
      continue;
    }
    if (ch === "'") {
      const end = input.indexOf("'", i + 1);
      if (end < 0) throw new ToolError({ zh: '单引号没有闭合', en: 'Single quote is not closed' });
      current += input.slice(i + 1, end);
      hasCurrent = true;
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      i += 1;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          current += input[i + 1];
          i += 2;
        } else {
          current += input[i];
          i += 1;
        }
      }
      if (input[i] !== '"') throw new ToolError({ zh: '双引号没有闭合', en: 'Double quote is not closed' });
      hasCurrent = true;
      i += 1;
      continue;
    }
    current += ch;
    hasCurrent = true;
    i += 1;
  }
  if (hasCurrent) tokens.push(current);
  return tokens;
}

export interface CurlRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  data: string | null;
  auth: { username: string; password: string } | null;
}

const VALUE_FLAGS: Record<string, string> = {
  '-X': 'request',
  '--request': 'request',
  '-H': 'header',
  '--header': 'header',
  '-d': 'data',
  '--data': 'data',
  '--data-raw': 'data',
  '--data-binary': 'data',
  '--data-ascii': 'data',
  '--data-urlencode': 'data',
  '-u': 'user',
  '--user': 'user',
  '-b': 'cookie',
  '--cookie': 'cookie',
  '-A': 'userAgent',
  '--user-agent': 'userAgent',
  '-e': 'referer',
  '--referer': 'referer',
  '--url': 'url',
  '-o': 'ignore',
  '--output': 'ignore',
  '-m': 'ignore',
  '--max-time': 'ignore',
  '--connect-timeout': 'ignore',
  '--retry': 'ignore',
};

const BOOLEAN_FLAGS = new Set([
  '-s', '--silent', '-S', '-L', '--location', '-k', '--insecure', '-v', '--verbose',
  '--compressed', '--get', '-G', '-I', '--head', '-f', '--fail', '-N', '--no-buffer',
  '--http1.1', '--http2', '-4', '-6', '-j', '--junk-session-cookies', '-sS',
]);

/** 解析 curl 命令为请求结构。 */
export function parseCurl(command: string): CurlRequest {
  const rawTokens = tokenizeShell(command.trim());
  let tokens = rawTokens;
  if (tokens[0] === 'curl') tokens = tokens.slice(1);
  if (tokens.length === 0) throw new ToolError({ zh: '未找到 curl 命令', en: 'No curl command found' });

  const headers: Record<string, string> = {};
  const dataParts: string[] = [];
  let request: string | null = null;
  let url = '';
  let user: string | null = null;
  let getFlag = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === 'curl' && i === 0) continue;
    if (token.startsWith('-') && token.length > 1 && token !== '-') {
      const flag = token.split('=')[0];
      const inlineValue = token.includes('=') ? token.slice(token.indexOf('=') + 1) : null;
      const kind = VALUE_FLAGS[flag];
      if (kind) {
        const value = inlineValue ?? tokens[++i];
        if (value === undefined)
          throw new ToolError({ zh: `选项 ${flag} 缺少参数`, en: `Option ${flag} is missing its argument` });
        if (kind === 'request') request = value;
        else if (kind === 'header') {
          const sep = value.indexOf(':');
          if (sep < 0)
            throw new ToolError({
              zh: `请求头格式应为 Name: value，收到：${value}`,
              en: `Header format should be Name: value, received: ${value}`,
            });
          headers[value.slice(0, sep).trim()] = value.slice(sep + 1).trim();
        } else if (kind === 'data') {
          if (!value.startsWith('@')) dataParts.push(value);
        } else if (kind === 'user') user = value;
        else if (kind === 'cookie') headers.Cookie = value;
        else if (kind === 'userAgent') headers['User-Agent'] = value;
        else if (kind === 'referer') headers.Referer = value;
        else if (kind === 'url') url = value;
      } else if (BOOLEAN_FLAGS.has(flag)) {
        if (flag === '--get' || flag === '-G') getFlag = true;
        if (flag === '--head' || flag === '-I') request = 'HEAD';
      } else if (/^-[A-Za-z]+$/.test(token) && [...token.slice(1)].every((c) => 'sSLkNvjfniocOI'.includes(c))) {
        // 组合短选项如 -sSL；含 o 时消耗下一个参数
        if (token.includes('o')) i += 1;
      } else {
        throw new ToolError({ zh: `不支持的选项：${token}`, en: `Unsupported option: ${token}` });
      }
      continue;
    }
    if (!url) url = token;
    else throw new ToolError({ zh: `无法解析的参数：${token}`, en: `Unparseable argument: ${token}` });
  }

  if (!url) throw new ToolError({ zh: '未找到请求 URL', en: 'No request URL found' });

  const data = dataParts.length > 0 ? dataParts.join('&') : null;
  let method = request ?? (data ? 'POST' : 'GET');
  let finalUrl = url;
  if (getFlag && data) {
    method = 'GET';
    finalUrl = url.includes('?') ? `${url}&${data}` : `${url}?${data}`;
  }

  let auth: CurlRequest['auth'] = null;
  if (user) {
    const sep = user.indexOf(':');
    auth = { username: sep >= 0 ? user.slice(0, sep) : user, password: sep >= 0 ? user.slice(sep + 1) : '' };
  }

  return { url: finalUrl, method: method.toUpperCase(), headers, data, auth };
}

function jsQuote(value: string): string {
  return JSON.stringify(value);
}

function phpQuote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function javaQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function goQuote(value: string): string {
  if (!value.includes('`')) return '`' + value + '`';
  return javaQuote(value);
}

function headerLines(headers: Record<string, string>): [string, string][] {
  return Object.entries(headers);
}

function withAuth(req: CurlRequest): { headers: Record<string, string>; basic: string | null } {
  const headers = { ...req.headers };
  if (req.auth) {
    const token = btoaSafe(`${req.auth.username}:${req.auth.password}`);
    headers.Authorization = `Basic ${token}`;
    return { headers, basic: `${req.auth.username}:${req.auth.password}` };
  }
  return { headers, basic: null };
}

function btoaSafe(value: string): string {
  if (typeof btoa === 'function') return btoa(value);
  return Buffer.from(value, 'binary').toString('base64');
}

function headerJsBlock(headers: Record<string, string>, indent: string): string {
  const entries = headerLines(headers).map(([k, v]) => `${indent}  ${jsQuote(k)}: ${jsQuote(v)}`);
  return entries.length ? `{\n${entries.join(',\n')}\n${indent}}` : '{}';
}

export function curlToCode(command: string, lang: CurlLang): string {
  const req = parseCurl(command);
  const { headers } = withAuth(req);
  const hasBody = req.data !== null;
  const lowerMethod = req.method.toLowerCase();

  switch (lang) {
    case 'python': {
      const lines = ['import requests', '', `url = ${jsQuote(req.url)}`];
      if (Object.keys(headers).length) lines.push(`headers = ${pyDict(headers)}`);
      if (hasBody) lines.push(`payload = ${jsQuote(req.data ?? '')}`);
      lines.push('');
      const args = [jsQuote(req.method), 'url'];
      if (Object.keys(headers).length) args.push('headers=headers');
      if (hasBody) args.push('data=payload');
      lines.push(`response = requests.request(${args.join(', ')})`);
      lines.push('');
      lines.push('print(response.text)');
      return lines.join('\n');
    }
    case 'feapder': {
      const lines = ['import feapder', ''];
      if (Object.keys(headers).length) lines.push(`headers = ${pyDict(headers)}`);
      if (hasBody) lines.push(`data = ${jsQuote(req.data ?? '')}`);
      if (Object.keys(headers).length || hasBody) lines.push('');
      lines.push('class ApiSpider(feapder.AirSpider):');
      lines.push('    def start_requests(self):');
      const reqArgs = [`url=${jsQuote(req.url)}`, `method=${jsQuote(lowerMethod)}`];
      if (Object.keys(headers).length) reqArgs.push('headers=headers');
      if (hasBody) reqArgs.push('data=data');
      lines.push(`        yield feapder.Request(${reqArgs.join(', ')})`);
      lines.push('');
      lines.push('    def parse(self, request, response):');
      lines.push('        print(response.body)');
      lines.push('');
      lines.push('if __name__ == "__main__":');
      lines.push('    ApiSpider().start()');
      return lines.join('\n');
    }
    case 'php': {
      const lines = ['<?php', '', '$curl = curl_init();', '', 'curl_setopt_array($curl, ['];
      lines.push(`  CURLOPT_URL => ${phpQuote(req.url)},`);
      lines.push('  CURLOPT_RETURNTRANSFER => true,');
      lines.push('  CURLOPT_ENCODING => "",');
      lines.push('  CURLOPT_MAXREDIRS => 10,');
      lines.push('  CURLOPT_TIMEOUT => 30,');
      lines.push(`  CURLOPT_CUSTOMREQUEST => ${phpQuote(req.method)},`);
      if (hasBody) lines.push(`  CURLOPT_POSTFIELDS => ${phpQuote(req.data ?? '')},`);
      if (Object.keys(headers).length) {
        const hs = headerLines(headers).map(([k, v]) => `    ${phpQuote(`${k}: ${v}`)}`);
        lines.push(`  CURLOPT_HTTPHEADER => [\n${hs.join(',\n')}\n  ],`);
      }
      lines.push(']);', '', '$response = curl_exec($curl);', '$err = curl_error($curl);', 'curl_close($curl);', '');
      lines.push('if ($err) {');
      lines.push('  echo "cURL Error #: " . $err;');
      lines.push('} else {');
      lines.push('  echo $response;');
      lines.push('}');
      return lines.join('\n');
    }
    case 'java': {
      const lines = [
        'import java.net.URI;',
        'import java.net.http.HttpClient;',
        'import java.net.http.HttpRequest;',
        'import java.net.http.HttpResponse;',
        '',
        'public class Main {',
        '    public static void main(String[] args) throws Exception {',
        '        HttpClient client = HttpClient.newHttpClient();',
        '        HttpRequest request = HttpRequest.newBuilder()',
        `            .uri(URI.create(${javaQuote(req.url)}))`,
      ];
      for (const [k, v] of headerLines(headers)) {
        lines.push(`            .header(${javaQuote(k)}, ${javaQuote(v)})`);
      }
      const bodyStr = javaQuote(req.data ?? '');
      const methodCall =
        req.method === 'GET'
          ? '.GET()'
          : req.method === 'POST'
            ? `.POST(HttpRequest.BodyPublishers.ofString(${bodyStr}))`
            : req.method === 'PUT'
              ? hasBody
                ? `.PUT(HttpRequest.BodyPublishers.ofString(${bodyStr}))`
                : '.method("PUT", HttpRequest.BodyPublishers.noBody())'
              : req.method === 'DELETE'
                ? '.DELETE()'
                : `.method(${javaQuote(req.method)}, ${hasBody ? `HttpRequest.BodyPublishers.ofString(${bodyStr})` : 'HttpRequest.BodyPublishers.noBody()'})`;
      lines.push(`            ${methodCall}`);
      lines.push('            .build();');
      lines.push('        HttpResponse<String> response = client.send(request,');
      lines.push('            HttpResponse.BodyHandlers.ofString());');
      lines.push('        System.out.println(response.body());');
      lines.push('    }', '}');
      return lines.join('\n');
    }
    case 'nodejs': {
      const lines = ["const axios = require('axios');", '', 'const config = {'];
      lines.push(`  method: ${jsQuote(lowerMethod)},`);
      lines.push(`  url: ${jsQuote(req.url)},`);
      if (Object.keys(headers).length) lines.push(`  headers: ${headerJsBlock(headers, '  ')},`);
      if (hasBody) lines.push(`  data: ${jsQuote(req.data ?? '')},`);
      lines.push('};', '', 'axios(config)');
      lines.push('  .then((response) => console.log(JSON.stringify(response.data)))');
      lines.push('  .catch((error) => console.log(error));');
      return lines.join('\n');
    }
    case 'javascript': {
      const lines = ['const options = {'];
      lines.push(`  method: ${jsQuote(req.method)},`);
      if (Object.keys(headers).length) lines.push(`  headers: ${headerJsBlock(headers, '  ')},`);
      if (hasBody) lines.push(`  body: ${jsQuote(req.data ?? '')},`);
      lines.push('};', '', `fetch(${jsQuote(req.url)}, options)`);
      lines.push('  .then((response) => response.text())');
      lines.push('  .then((data) => console.log(data))');
      lines.push('  .catch((error) => console.error(error));');
      return lines.join('\n');
    }
    case 'golang': {
      const lines = ['package main', '', 'import ('];
      lines.push('\t"fmt"', '\t"io"', '\t"net/http"');
      if (hasBody) lines.push('\t"strings"');
      lines.push(')', '', 'func main() {');
      lines.push(`\turl := ${goQuote(req.url)}`);
      if (hasBody) lines.push(`\tpayload := strings.NewReader(${goQuote(req.data ?? '')})`);
      lines.push(
        `\treq, _ := http.NewRequest(${goQuote(req.method)}, url, ${hasBody ? 'payload' : 'nil'})`,
      );
      for (const [k, v] of headerLines(headers)) {
        lines.push(`\treq.Header.Add(${goQuote(k)}, ${goQuote(v)})`);
      }
      lines.push('\tres, _ := http.DefaultClient.Do(req)', '\tdefer res.Body.Close()');
      lines.push('\tbody, _ := io.ReadAll(res.Body)', '', '\tfmt.Println(string(body))', '}');
      return lines.join('\n');
    }
    default:
      throw new ToolError({ zh: `不支持的语言：${lang}`, en: `Unsupported language: ${lang}` });
  }
}

function pyDict(headers: Record<string, string>): string {
  const entries = headerLines(headers).map(([k, v]) => `    ${jsQuote(k)}: ${jsQuote(v)}`);
  return entries.length ? `{\n${entries.join(',\n')}\n}` : '{}';
}
