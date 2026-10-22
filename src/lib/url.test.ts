import { describe, expect, test } from 'vitest';
import {
  coerceQueryValue,
  jsonObjectToQuery,
  parseUrl,
  queryToJsonObject,
  type QueryFlags,
} from './url';

const DEFAULT_FLAGS: QueryFlags = {
  encode: true,
  parseArrays: true,
  coerceTypes: true,
  bracketArrays: false,
};

describe('url utilities', () => {
  test('parseUrl extracts URL components and query entries', () => {
    const parsed = parseUrl('https://example.com:8443/path/demo?name=qwen&tag=ai#top');
    expect(parsed.protocol).toBe('https');
    expect(parsed.hostname).toBe('example.com');
    expect(parsed.port).toBe('8443');
    expect(parsed.pathname).toBe('/path/demo');
    expect(parsed.hash).toBe('#top');
    expect(parsed.origin).toBe('https://example.com:8443');
    expect(parsed.query).toEqual([
      { key: 'name', value: 'qwen' },
      { key: 'tag', value: 'ai' },
    ]);
    expect(parsed.assumedProtocol).toBe(false);
  });

  test('parseUrl assumes https for scheme-less input', () => {
    const parsed = parseUrl('www.example.com/demo');
    expect(parsed.href).toBe('https://www.example.com/demo');
    expect(parsed.assumedProtocol).toBe(true);
  });

  test('parseUrl rejects empty or invalid input', () => {
    expect(() => parseUrl('')).toThrow('请输入 URL 地址');
    expect(() => parseUrl('http://')).toThrow('URL 解析失败');
  });

  test('coerceQueryValue converts primitive-looking strings', () => {
    expect(coerceQueryValue('42')).toBe(42);
    expect(coerceQueryValue('-3.5')).toBe(-3.5);
    expect(coerceQueryValue('true')).toBe(true);
    expect(coerceQueryValue('false')).toBe(false);
    expect(coerceQueryValue('null')).toBeNull();
    expect(coerceQueryValue('hello')).toBe('hello');
    expect(coerceQueryValue('007')).toBe('007');
    expect(coerceQueryValue('12345678901234567890')).toBe('12345678901234567890');
  });

  test('jsonObjectToQuery encodes keys and values', () => {
    const query = jsonObjectToQuery(
      { name: 'qwen', age: 3, tags: ['ai', 'tools'], profile: { city: '杭州' } },
      DEFAULT_FLAGS,
    );
    expect(query).toBe('name=qwen&age=3&tags=ai&tags=tools&profile%5Bcity%5D=%E6%9D%AD%E5%B7%9E');
  });

  test('jsonObjectToQuery can skip encoding and use bracket arrays', () => {
    const query = jsonObjectToQuery({ tags: ['a', 'b'] }, {
      ...DEFAULT_FLAGS,
      encode: false,
      bracketArrays: true,
    });
    expect(query).toBe('tags[]=a&tags[]=b');
  });

  test('jsonObjectToQuery rejects non-object values', () => {
    expect(() => jsonObjectToQuery([1, 2], DEFAULT_FLAGS)).toThrow('JSON 转 Query 需要一个对象');
    expect(() => jsonObjectToQuery('x', DEFAULT_FLAGS)).toThrow('JSON 转 Query 需要一个对象');
  });

  test('queryToJsonObject parses repeated keys and coerces types', () => {
    expect(queryToJsonObject('?name=qwen&age=3&flag=true&tag=a&tag=b', DEFAULT_FLAGS)).toEqual({
      name: 'qwen',
      age: 3,
      flag: true,
      tag: ['a', 'b'],
    });
  });

  test('queryToJsonObject supports bracket arrays', () => {
    expect(
      queryToJsonObject('tag[]=a&tag[]=b', {
        ...DEFAULT_FLAGS,
        bracketArrays: true,
      }),
    ).toEqual({ tag: ['a', 'b'] });
  });

  test('queryToJsonObject can disable coercion and array parsing', () => {
    expect(
      queryToJsonObject('age=3&tag=a&tag=b', {
        ...DEFAULT_FLAGS,
        coerceTypes: false,
        parseArrays: false,
      }),
    ).toEqual({ age: '3', tag: 'b' });
  });

  test('queryToJsonObject rejects empty input', () => {
    expect(() => queryToJsonObject('  ', DEFAULT_FLAGS)).toThrow('请输入 Query 字符串');
  });
});
