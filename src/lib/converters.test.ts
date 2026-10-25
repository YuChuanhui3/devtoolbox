import { describe, expect, test } from 'vitest';
import {
  csvToJson,
  detectCsvDelimiter,
  jsonToCsv,
  jsonToXml,
  jsonToYaml,
  xmlToJson,
  yamlToJson,
} from './converters';

describe('format converters', () => {
  test('jsonToYaml converts JSON to YAML and sorts keys', () => {
    const yaml = jsonToYaml('{"b":2,"a":{"d":4,"c":3}}', 2, true);
    expect(yaml).toContain('a:');
    expect(yaml).toContain('c: 3');
    expect(yaml.indexOf('a:')).toBeLessThan(yaml.indexOf('b: 2'));
  });

  test('jsonToYaml rejects invalid JSON', () => {
    expect(() => jsonToYaml('{', 2)).toThrow(/JSON 解析失败/);
  });

  test('yamlToJson converts YAML to formatted JSON', () => {
    const json = yamlToJson('name: qwen\nage: 3\ntags:\n  - ai\n', 2);
    expect(JSON.parse(json)).toEqual({ name: 'qwen', age: 3, tags: ['ai'] });
    expect(json).toContain('\n  "name"');
  });

  test('yamlToJson reports YAML syntax errors with position', () => {
    expect(() => yamlToJson('a: [1, 2')).toThrow(/YAML 解析失败/);
    expect(() => yamlToJson('')).toThrow('输入内容为空');
  });

  test('jsonToXml wraps output in the requested root node', () => {
    const xml = jsonToXml('{"user":{"name":"qwen"}}', 'root');
    expect(xml).toContain('<root>');
    expect(xml).toContain('<user>');
    expect(xml).toContain('<name>qwen</name>');
    expect(xml).toContain('</root>');
  });

  test('jsonToXml wraps arrays as item nodes', () => {
    const xml = jsonToXml('[1,2]', 'list');
    expect(xml).toContain('<list>');
    expect(xml).toContain('<item>1</item>');
    expect(xml).toContain('<item>2</item>');
  });

  test('xmlToJson parses attributes and values', () => {
    const json = JSON.parse(xmlToJson('<user id="1"><name>qwen</name></user>', { keepAttributes: true }));
    expect(json).toEqual({ user: { '@_id': 1, name: 'qwen' } });

    const withoutAttributes = JSON.parse(
      xmlToJson('<user id="1"><name>qwen</name></user>', { keepAttributes: false }),
    );
    expect(withoutAttributes).toEqual({ user: { name: 'qwen' } });
  });

  test('xmlToJson rejects empty input', () => {
    expect(() => xmlToJson('', { keepAttributes: true })).toThrow('输入内容为空');
  });

  test('jsonToCsv converts object arrays to CSV', () => {
    const csv = jsonToCsv('[{"name":"a","age":1},{"name":"b","age":2}]');
    expect(csv).toBe('name,age\na,1\nb,2');
  });

  test('jsonToCsv rejects non-array and empty arrays', () => {
    expect(() => jsonToCsv('{"a":1}')).toThrow('JSON 转 CSV 需要一个数组');
    expect(() => jsonToCsv('[]')).toThrow('JSON 数组为空');
  });

  test('csvToJson parses with header and custom delimiter', () => {
    const json = JSON.parse(csvToJson('name;age\na;1\nb;2', { delimiter: ';', hasHeader: true }));
    expect(json).toEqual([
      { name: 'a', age: '1' },
      { name: 'b', age: '2' },
    ]);
  });

  test('csvToJson supports headerless rows', () => {
    const json = JSON.parse(csvToJson('a,1\nb,2', { delimiter: ',', hasHeader: false }));
    expect(json).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  test('csvToJson rejects empty input', () => {
    expect(() => csvToJson('', { delimiter: ',', hasHeader: true })).toThrow('输入内容为空');
  });

  test('detectCsvDelimiter chooses the most frequent separator', () => {
    expect(detectCsvDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectCsvDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectCsvDelimiter('a\tb\n1\t2')).toBe('\t');
  });
});
