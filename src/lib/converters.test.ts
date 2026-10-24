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

  test('xmlToJson keeps comments as remark only when keepComments is on', () => {
    const xml = '<a><!--note--><b>1</b></a>';
    const kept = JSON.parse(xmlToJson(xml, { keepAttributes: true, keepComments: true }));
    expect(kept.a.remark).toBe('note');
    const dropped = JSON.parse(xmlToJson(xml, { keepAttributes: true }));
    expect(dropped.a.remark).toBeUndefined();
  });

  test('xmlToJson field mapping collapses name attributes into name→desc keys', () => {
    const xml =
      '<snd><field name="payAcc" desc="付款账户"/><field name="isRepeat" desc="是否重复" required="false"/><!--0:否;1:是--></snd>';
    const parsed = JSON.parse(
      xmlToJson(xml, { keepAttributes: true, keepComments: true, fieldMapping: true }),
    );
    expect(parsed.snd.field.payAcc).toBe('付款账户');
    expect(parsed.snd.field.isRepeat).toEqual({ desc: '是否重复', required: false });
    expect(parsed.snd.remark).toBe('0:否;1:是');
  });

  test('field mapping keeps {desc, remark} when the field has its own note', () => {
    const xml = '<list><field name="antiFraud" desc="反欺诈标志"><remark>0:实时;1:离线</remark></field></list>';
    const parsed = JSON.parse(
      xmlToJson(xml, { keepAttributes: true, keepComments: true, fieldMapping: true }),
    );
    expect(parsed.list.field.antiFraud).toEqual({ desc: '反欺诈标志', remark: '0:实时;1:离线' });
  });

  test('xmlToJson parses real remark elements even with keepComments on', () => {
    const parsed = JSON.parse(
      xmlToJson('<f><remark>说明</remark></f>', { keepAttributes: true, keepComments: true }),
    );
    expect(parsed.f.remark).toBe('说明');
  });

  test('jsonToXml writes remark values back as XML comments', () => {
    const xml = jsonToXml('{"a":{"remark":"note","b":"1"}}', 'root');
    expect(xml).toContain('<!--note-->');
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
