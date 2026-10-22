import { ToolError } from './errors';
import { base64ToBytes, bytesToBase64 } from './base64';

export type ProxyProtocol = 'vmess' | 'ss' | 'ssr';

export interface VmessFields {
  ps: string;
  add: string;
  port: string | number;
  id: string;
  aid: string | number;
  scy: string;
  net: string;
  type: string;
  host: string;
  path: string;
  tls: string;
  sni: string;
}

function decodeBase64Text(value: string, label: string): string {
  try {
    return new TextDecoder('utf-8').decode(base64ToBytes(value));
  } catch {
    throw new ToolError(
      { zh: `${label} 的 Base64 内容无法解码`, en: `The Base64 content of ${label} cannot be decoded` },
      { zh: '请确认粘贴的是完整的链接（含协议前缀）。', en: 'Make sure you pasted the complete link (including the protocol prefix).' },
    );
  }
}

function stripScheme(link: string, scheme: string): string {
  const trimmed = link.trim();
  if (!trimmed.startsWith(scheme)) {
    throw new ToolError(
      { zh: `不是 ${scheme} 链接`, en: `Not a ${scheme} link` },
      { zh: `链接应以 ${scheme} 开头。`, en: `The link should start with ${scheme}.` },
    );
  }
  return trimmed.slice(scheme.length);
}

export function parseVmessLink(link: string): VmessFields & Record<string, unknown> {
  const body = stripScheme(link, 'vmess://');
  const json = decodeBase64Text(body, 'VMess');
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new ToolError(
      { zh: 'VMess 链接内的 JSON 解析失败', en: 'JSON parsing failed inside the VMess link' },
      { zh: '链接可能被截断或改写过。', en: 'The link may have been truncated or altered.' },
    );
  }
  const headers = parsed.headers as Record<string, unknown> | undefined;
  return {
    ...parsed,
    ps: String(parsed.ps ?? parsed.name ?? ''),
    add: String(parsed.add ?? ''),
    port: String(parsed.port ?? ''),
    id: String(parsed.id ?? ''),
    aid: String(parsed.aid ?? 'auto'),
    scy: String(parsed.scy ?? 'auto'),
    net: String(parsed.net ?? 'tcp'),
    type: String(parsed.type ?? 'none'),
    host: String(parsed.host ?? headers?.Host ?? ''),
    path: String(parsed.path ?? ''),
    tls: String(parsed.tls ?? ''),
    sni: String(parsed.sni ?? ''),
  };
}

export function buildVmessLink(fields: Record<string, unknown>): string {
  if (!fields.add || !fields.id) {
    throw new ToolError(
      { zh: 'VMess 生成失败', en: 'VMess generation failed' },
      { zh: '至少需要填写地址（add）与用户 ID（id）。', en: 'At least the address (add) and user ID (id) must be filled in.' },
    );
  }
  const payload = {
    v: '2',
    ps: fields.ps ?? '',
    add: fields.add,
    port: fields.port || '443',
    id: fields.id,
    aid: fields.aid ?? 'auto',
    scy: fields.scy ?? 'auto',
    net: fields.net ?? 'tcp',
    type: fields.type ?? 'none',
    host: fields.host ?? '',
    path: fields.path ?? '',
    tls: fields.tls ?? '',
    sni: fields.sni ?? '',
  };
  return `vmess://${bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)))}`;
}

export interface ShadowsocksFields {
  method: string;
  password: string;
  server: string;
  port: string;
  name: string;
}

export function parseSsLink(link: string): ShadowsocksFields {
  const body = stripScheme(link, 'ss://');
  const hashIndex = body.indexOf('#');
  const name = hashIndex === -1 ? '' : decodeURIComponent(body.slice(hashIndex + 1));
  const main = hashIndex === -1 ? body : body.slice(0, hashIndex);

  const atIndex = main.lastIndexOf('@');
  if (atIndex !== -1) {
    // SIP002：ss://base64(method:password)@host:port#名字
    const credentials = decodeBase64Text(main.slice(0, atIndex), 'SS');
    const [method, ...rest] = credentials.split(':');
    const serverPart = main.slice(atIndex + 1);
    const lastColon = serverPart.lastIndexOf(':');
    if (lastColon === -1)
      throw new ToolError(
        { zh: 'SS 链接缺少端口', en: 'The SS link is missing the port' },
        { zh: '格式应为 host:port。', en: 'The format should be host:port.' },
      );
    return { method, password: rest.join(':'), server: serverPart.slice(0, lastColon), port: serverPart.slice(lastColon + 1), name };
  }

  // 传统格式：ss://base64(method:password@host:port)
  const decoded = decodeBase64Text(main, 'SS');
  const match = /^([^:@]+):([^@]+)@([^:]+):(\d+)$/.exec(decoded);
  if (!match)
    throw new ToolError(
      { zh: '无法识别的 SS 链接', en: 'Unrecognized SS link' },
      { zh: '支持 SIP002 与传统两种格式。', en: 'SIP002 and the legacy format are both supported.' },
    );
  return { method: match[1], password: match[2], server: match[3], port: match[4], name };
}

export function buildSsLink(fields: ShadowsocksFields): string {
  if (!fields.server || !fields.port || !fields.method || !fields.password) {
    throw new ToolError(
      { zh: 'SS 生成失败', en: 'SS generation failed' },
      { zh: '加密方式、口令、服务器与端口都不能为空。', en: 'Encryption method, password, server, and port must not be empty.' },
    );
  }
  const credentials = bytesToBase64(new TextEncoder().encode(`${fields.method}:${fields.password}`));
  const name = fields.name ? `#${encodeURIComponent(fields.name)}` : '';
  return `ss://${credentials}@${fields.server}:${fields.port}${name}`;
}

export interface ShadowsocksRFields extends ShadowsocksFields {
  protocol: string;
  obfs: string;
  protocolParam: string;
  obfsParam: string;
}

const BASE64URL_PADDING = (value: string): string => value.replace(/-/g, '+').replace(/_/g, '/');

function decodeBase64Url(value: string): string {
  return decodeBase64Text(BASE64URL_PADDING(value), 'SSR');
}

function encodeBase64Url(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function parseSsrLink(link: string): ShadowsocksRFields {
  const body = stripScheme(link, 'ssr://');
  const [main, query] = body.split('/');
  const parts = decodeBase64Url(main).split(':');
  if (parts.length < 6)
    throw new ToolError(
      { zh: 'SSR 链接字段不足', en: 'The SSR link has too few fields' },
      { zh: '冒号分隔应为 6 ~ 8 段。', en: 'The colon-separated parts should be 6 to 8.' },
    );
  const params = new Map<string, string>();
  if (query) {
    for (const pair of query.split('&')) {
      const [key, rawValue = ''] = pair.split('=');
      params.set(key, decodeBase64Url(rawValue));
    }
  }
  return {
    server: parts[0],
    port: parts[1],
    protocol: parts[2],
    method: parts[3],
    obfs: parts[4],
    password: decodeBase64Url(parts[5]),
    protocolParam: params.get('protoparam') ?? '',
    obfsParam: params.get('obfsparam') ?? '',
    name: params.get('remarks') ?? '',
  };
}

export function buildSsrLink(fields: ShadowsocksRFields): string {
  if (!fields.server || !fields.port || !fields.method || !fields.password) {
    throw new ToolError(
      { zh: 'SSR 生成失败', en: 'SSR generation failed' },
      { zh: '服务器、端口、加密方式与口令都不能为空。', en: 'Server, port, encryption method, and password must not be empty.' },
    );
  }
  const main = [
    fields.server,
    fields.port,
    fields.protocol || 'origin',
    fields.method,
    fields.obfs || 'plain',
    encodeBase64Url(fields.password),
  ].join(':');
  const params: string[] = [];
  if (fields.protocolParam) params.push(`protoparam=${encodeBase64Url(fields.protocolParam)}`);
  if (fields.obfsParam) params.push(`obfsparam=${encodeBase64Url(fields.obfsParam)}`);
  if (fields.name) params.push(`remarks=${encodeBase64Url(fields.name)}`);
  return `ssr://${encodeBase64Url(main)}${params.length ? `/${params.join('&')}` : ''}`;
}
