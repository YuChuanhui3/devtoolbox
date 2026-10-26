import { describe, expect, test } from 'vitest';
import { convertFormat, DEFAULT_CONVERT_OPTIONS, FORMATS, type ConvertOptions } from './formats';

const opts = (overrides: Partial<ConvertOptions> = {}): ConvertOptions => ({
  ...DEFAULT_CONVERT_OPTIONS,
  ...overrides,
});

describe('format registry', () => {
  test('JSON serializes with indent and sorted keys', () => {
    const out = FORMATS.json.serialize(JSON.parse('{"b":2,"a":{"d":4,"c":3}}'), opts({ sortKeys: true }));
    expect(out).toBe('{\n  "a": {\n    "c": 3,\n    "d": 4\n  },\n  "b": 2\n}');
  });

  test('YAML round-trips through JSON', () => {
    const value = FORMATS.yaml.parse('name: qwen\nage: 3\ntags:\n  - ai\n', opts());
    expect(JSON.parse(FORMATS.json.serialize(value, opts()))).toEqual({
      name: 'qwen',
      age: 3,
      tags: ['ai'],
    });
  });

  test('YAML parse errors report position', () => {
    expect(() => FORMATS.yaml.parse('a: [1, 2', opts())).toThrow(/YAML 解析失败/);
    expect(() => FORMATS.yaml.parse('', opts())).toThrow('输入内容为空');
  });
});

describe('XML conversion ignores attributes and uses tag names only', () => {
  test('attributes are dropped when parsing XML', () => {
    const json = FORMATS.json.serialize(FORMATS.xml.parse('<user id="1"><name>qwen</name></user>', opts()), opts());
    expect(JSON.parse(json)).toEqual({ user: { name: 'qwen' } });
  });

  test('legacy @_ and #text keys are cleaned when building XML', () => {
    const value = JSON.parse('{"user":{"@_id":1,"contact":{"#text":"qwen"}}}');
    const xml = FORMATS.xml.serialize(value, opts({ rootName: 'root' }));
    expect(xml).not.toContain('@_id');
    expect(xml).toContain('<contact>qwen</contact>');
  });

  test('invalid tag names are sanitized', () => {
    const xml = FORMATS.xml.serialize({ 'a b': { '1x': 'v' } }, opts({ rootName: 'root' }));
    expect(xml).toContain('<a_b>');
    expect(xml).toContain('<_1x>v</_1x>');
  });

  test('XML wraps root and repeats arrays as item nodes', () => {
    const xml = FORMATS.xml.serialize(JSON.parse('{"user":{"name":"qwen"}}'), opts({ rootName: 'root' }));
    expect(xml).toContain('<root>');
    expect(xml).toContain('<name>qwen</name>');

    const list = FORMATS.xml.serialize(JSON.parse('[1,2]'), opts({ rootName: 'list' }));
    expect(list).toContain('<item>1</item>');
    expect(list).toContain('<item>2</item>');
  });

  test('XML round-trips without attribute noise', () => {
    const json = convertFormat('<order><item name="a">1</item></order>', 'xml', 'json', opts());
    expect(JSON.parse(json)).toEqual({ order: { item: 1 } });
    expect(convertFormat(json, 'json', 'xml', opts())).not.toContain('@_');
  });

  test('XML rejects empty input', () => {
    expect(() => FORMATS.xml.parse('', opts())).toThrow('输入内容为空');
  });
});

describe('CSV conversion', () => {
  test('serializes object arrays', () => {
    const csv = FORMATS.csv.serialize(JSON.parse('[{"name":"a","age":1},{"name":"b","age":2}]'), opts());
    expect(csv).toBe('name,age\na,1\nb,2');
  });

  test('requires a non-empty array for output', () => {
    expect(() => FORMATS.csv.serialize({ a: 1 }, opts())).toThrow('CSV 输出需要一个数组');
    expect(() => FORMATS.csv.serialize([], opts())).toThrow('数组为空');
  });

  test('parses with header and custom delimiter', () => {
    const value = FORMATS.csv.parse('name;age\na;1\nb;2', opts({ csvDelimiter: ';' }));
    expect(value).toEqual([
      { name: 'a', age: '1' },
      { name: 'b', age: '2' },
    ]);
  });

  test('parses headerless rows', () => {
    const value = FORMATS.csv.parse('a,1\nb,2', opts({ csvHasHeader: false }));
    expect(value).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  test('rejects empty input', () => {
    expect(() => FORMATS.csv.parse('', opts())).toThrow('输入内容为空');
  });
});

describe('cross-format pipelines', () => {
  test('YAML to CSV', () => {
    const csv = convertFormat('- name: a\n- name: b\n', 'yaml', 'csv', opts());
    expect(csv).toBe('name\na\nb');
  });

  test('Properties to JSON expands dotted keys', () => {
    const json = convertFormat('app.name=DevToolbox\nfeatures.tags[0]=json\n', 'properties', 'json', opts());
    expect(JSON.parse(json)).toEqual({ app: { name: 'DevToolbox' }, features: { tags: ['json'] } });
  });

  test('JSON to Properties flattens nesting', () => {
    const text = convertFormat('{"app":{"name":"DevToolbox"}}', 'json', 'properties', opts());
    expect(text).toBe('app.name=DevToolbox');
  });

  test('Query to JSON and back', () => {
    const json = convertFormat('name=qwen&tag=ai&tag=tools', 'query', 'json', opts());
    expect(JSON.parse(json)).toEqual({ name: 'qwen', tag: ['ai', 'tools'] });
    expect(convertFormat(json, 'json', 'query', opts())).toBe('name=qwen&tag=ai&tag=tools');
  });

  test('same-format conversion normalizes', () => {
    expect(convertFormat('{"b":1,"a":2}', 'json', 'json', opts())).toBe('{\n  "b": 1,\n  "a": 2\n}');
  });
});
