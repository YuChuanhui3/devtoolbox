import { ToolError } from './errors';

export interface QueryEntry {
  key: string;
  value: string;
}

export interface ParsedUrl {
  href: string;
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  host: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
  query: QueryEntry[];
  assumedProtocol: boolean;
}

export function parseUrl(input: string): ParsedUrl {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new ToolError(
      { zh: '请输入 URL 地址', en: 'Enter a URL' },
      { zh: '例如 https://www.example.com/path?name=demo', en: 'For example, https://www.example.com/path?name=demo' },
    );
  }

  let candidate = trimmed;
  let assumedProtocol = false;

  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(candidate)) {
    if (candidate.startsWith('//')) {
      candidate = `https:${candidate}`;
    } else {
      candidate = `https://${candidate}`;
    }
    assumedProtocol = true;
  }

  try {
    const url = new URL(candidate);
    return {
      href: url.href,
      protocol: url.protocol.replace(/:$/, ''),
      username: url.username,
      password: url.password,
      hostname: url.hostname,
      port: url.port,
      host: url.host,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      origin: url.origin,
      query: Array.from(url.searchParams.entries()).map(([key, value]) => ({ key, value })),
      assumedProtocol,
    };
  } catch {
    throw new ToolError(
      { zh: 'URL 解析失败', en: 'URL parsing failed' },
      {
        zh: '请确认地址格式正确，例如 https://www.example.com/path?name=demo#section。',
        en: 'Make sure the address format is correct, for example https://www.example.com/path?name=demo#section.',
      },
    );
  }
}

const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;
const INTEGER_LENGTH_LIMIT = 15;

export function coerceQueryValue(value: string): string | number | boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (
    NUMBER_PATTERN.test(value) &&
    !(value.startsWith('0') && value.length > 1) &&
    !(value.startsWith('-0') && value.length > 2) &&
    value.replace(/[-.]/g, '').length <= INTEGER_LENGTH_LIMIT
  ) {
    return Number(value);
  }
  return value;
}

export type QueryValue = string | number | boolean | null;

export interface QueryFlags {
  encode: boolean;
  parseArrays: boolean;
  coerceTypes: boolean;
  bracketArrays: boolean;
}

function encodePart(value: string, encode: boolean): string {
  return encode ? encodeURIComponent(value) : value;
}

function flattenObject(
  value: Record<string, unknown>,
  prefix = '',
  output: Array<{ key: string; value: string }> = [],
): Array<{ key: string; value: string }> {
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = prefix ? `${prefix}[${rawKey}]` : rawKey;
    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        if (item !== null && typeof item === 'object') {
          flattenObject(item as Record<string, unknown>, `${key}[]`, output);
        } else {
          output.push({ key, value: String(item ?? '') });
        }
      }
    } else if (rawValue !== null && typeof rawValue === 'object') {
      flattenObject(rawValue as Record<string, unknown>, key, output);
    } else {
      output.push({ key, value: String(rawValue ?? '') });
    }
  }
  return output;
}

export function jsonObjectToQuery(value: unknown, flags: QueryFlags): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ToolError(
      { zh: 'JSON 转 Query 需要一个对象', en: 'Converting JSON to Query requires an object' },
      { zh: '顶层必须是 { "key": "value" } 形式的 JSON 对象。', en: 'The top level must be a JSON object of the form { "key": "value" }.' },
    );
  }

  const entries = flattenObject(value as Record<string, unknown>);
  if (entries.length === 0) return '';

  return entries
    .map((entry) => {
      const key =
        flags.bracketArrays && Array.isArray((value as Record<string, unknown>)[entry.key])
          ? `${entry.key}[]`
          : entry.key;
      return `${encodePart(key, flags.encode)}=${encodePart(entry.value, flags.encode)}`;
    })
    .join('&');
}

export function queryToJsonObject(query: string, flags: QueryFlags): Record<string, unknown> {
  const normalized = query.trim().replace(/^[?&]+/, '');
  if (!normalized) {
    throw new ToolError(
      { zh: '请输入 Query 字符串', en: 'Enter a Query string' },
      { zh: '例如 name=qwen&age=3&from=hangzhou', en: 'For example, name=qwen&age=3&from=hangzhou' },
    );
  }

  const params = new URLSearchParams(normalized);
  const result: Record<string, unknown> = {};

  for (const [rawKey, rawValue] of params.entries()) {
    const isArray = flags.bracketArrays && rawKey.endsWith('[]');
    const key = isArray ? rawKey.slice(0, -2) : rawKey;
    const value = flags.coerceTypes ? coerceQueryValue(rawValue) : rawValue;

    if (isArray) {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [value];
      }
      continue;
    }

    if (flags.parseArrays && Object.prototype.hasOwnProperty.call(result, key)) {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
      continue;
    }

    result[key] = value;
  }

  return result;
}
