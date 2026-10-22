import { describe, expect, test } from 'vitest';
import {
  escapeJsonString,
  formatJson,
  highlightJson,
  isJsonValid,
  jsonTypeOf,
  minifyJson,
  parseJson,
  sortKeysDeep,
  unescapeJsonString,
  unwrapJsonStrings,
  validateJson,
} from './json';
import { ToolError } from './errors';
import { tl } from '@/i18n/locale';

describe('json utilities', () => {
  test('parseJson parses valid JSON', () => {
    expect(parseJson('{"name":"qwen","age":3}')).toEqual({ name: 'qwen', age: 3 });
  });

  test('parseJson rejects empty input with a friendly error', () => {
    expect(() => parseJson('   ')).toThrow('输入内容为空');
  });

  test('parseJson reports missing comma with line and column', () => {
    try {
      parseJson('{\n  "a": 1\n  "b": 2\n}');
      expect.unreachable('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      const message = (error as ToolError).message;
      expect(message).toContain('JSON 解析失败');
      expect(message).toMatch(/第 \d+ 行第 \d+ 列/);
      expect(message).toContain('缺少逗号');
      expect((error as ToolError).hint).toBeTruthy();
    }
  });

  test('parseJson reports missing colon', () => {
    expect(() => parseJson('{"a" 1}')).toThrow(/缺少冒号/);
  });

  test('parseJson reports unclosed object', () => {
    expect(() => parseJson('{"a": 1')).toThrow(/对象未闭合/);
  });

  test('parseJson reports comments as invalid', () => {
    expect(() => parseJson('{ // comment\n "a": 1 }')).toThrow(/不支持注释/);
  });

  test('parseJson reports invalid escape characters', () => {
    expect(() => parseJson('{"a":"\\q"}')).toThrow(/转义字符不合法/);
  });

  test('formatJson supports indentation and key sorting', () => {
    expect(formatJson('{"b":2,"a":1}', 2)).toBe('{\n  "b": 2,\n  "a": 1\n}');
    expect(formatJson('{"b":2,"a":1}', 2, true)).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  test('minifyJson removes whitespace', () => {
    expect(minifyJson('{\n  "a": 1\n}')).toBe('{"a":1}');
  });

  test('sortKeysDeep sorts nested objects without mutating input', () => {
    const input = { b: { d: 4, c: 3 }, a: [{ z: 1, y: 2 }] };
    const sorted = sortKeysDeep(input) as Record<string, unknown>;
    expect(Object.keys(sorted)).toEqual(['a', 'b']);
    expect(Object.keys(sorted.b as object)).toEqual(['c', 'd']);
    expect(Object.keys((sorted.a as Array<object>)[0])).toEqual(['y', 'z']);
    expect(Object.keys(input)).toEqual(['b', 'a']);
  });

  test('jsonTypeOf describes JSON values', () => {
    expect(jsonTypeOf(null)).toBe('null');
    expect(jsonTypeOf([1, 2])).toBe('array(2)');
    expect(jsonTypeOf({ a: 1 })).toBe('object(1)');
    expect(jsonTypeOf('abc')).toBe('string(3)');
    expect(jsonTypeOf(true)).toBe('boolean');
  });

  test('highlightJson escapes HTML and adds token classes', () => {
    const html = highlightJson('{"a":"<script>","n":1,"ok":true,"none":null}');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('json-key');
    expect(html).toContain('json-string');
    expect(html).toContain('json-number');
    expect(html).toContain('json-boolean');
    expect(html).toContain('json-null');
  });

  test('validateJson and isJsonValid report validity', () => {
    expect(isJsonValid('{"a":1}')).toBe(true);
    expect(isJsonValid('{"a":}')).toBe(false);
    expect(tl(validateJson('{"a":1}').message, 'zh')).toBe('JSON 格式合法');
    const invalid = validateJson('{"a":}');
    expect(invalid.valid).toBe(false);
    expect(tl(invalid.message, 'zh')).toContain('JSON 解析失败');
    expect(invalid.hint).toBeTruthy();
  });
});

describe('json string escape helpers', () => {
  test('escapes quotes, backslashes and newlines while keeping Chinese intact', () => {
    expect(escapeJsonString('{"a":"你好"}\n第二行')).toBe('"{\\"a\\":\\"你好\\"}\\n第二行"');
  });

  test('can omit the outer quotes', () => {
    expect(escapeJsonString('a"b\\c\td', { outerQuotes: false })).toBe('a\\"b\\\\c\\td');
  });

  test('unescapes both quoted and bare escaped content', () => {
    expect(unescapeJsonString('"Hello\\nWorld"')).toBe('Hello\nWorld');
    expect(unescapeJsonString('Hello\\nWorld')).toBe('Hello\nWorld');
    expect(unescapeJsonString('"\\u4f60\\u597d"')).toBe('你好');
    expect(unescapeJsonString('  "a\\tb"  ')).toBe('a\tb');
  });

  test('round-trips raw JSON text', () => {
    const source = '{\n  "name": "工具",\n  "emoji": "👋"\n}';
    expect(unescapeJsonString(escapeJsonString(source))).toBe(source);
    expect(unescapeJsonString(escapeJsonString(source, { outerQuotes: false }))).toBe(source);
  });

  test('reports friendly errors for invalid input', () => {
    expect(() => unescapeJsonString('   ')).toThrow('输入内容为空');
    expect(() => unescapeJsonString('"bad\\q"')).toThrow('JSON 去转义失败');
    expect(() => unescapeJsonString('{"a":1}')).toThrow('JSON 去转义失败');
    expect(() => unescapeJsonString('"abc" "def"')).toThrow('JSON 去转义失败');
  });
});

describe('escaped JSON auto-unwrap', () => {
  test('formatJson unescapes string-wrapped JSON before formatting', () => {
    expect(formatJson('"{\\"a\\":1}"')).toBe('{\n  "a": 1\n}');
    expect(minifyJson('{\n  "a":1\n}')).toBe('{"a":1}');
  });

  test('unwraps multiple escape layers', () => {
    const double = JSON.stringify(JSON.stringify('{"a":1}'));
    expect(formatJson(double)).toBe('{\n  "a": 1\n}');
    expect(unwrapJsonStrings(parseJson(double))).toEqual({ value: { a: 1 }, depth: 2 });
  });

  test('leaves ordinary strings and non-JSON content untouched', () => {
    expect(formatJson('"hello"')).toBe('"hello"');
    expect(formatJson('"{not json}"')).toBe('"{not json}"');
    expect(formatJson('"123"')).toBe('"123"');
    expect(unwrapJsonStrings('plain')).toEqual({ value: 'plain', depth: 0 });
  });
});
