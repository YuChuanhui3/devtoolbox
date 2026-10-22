import { describe, expect, test } from 'vitest';
import {
  expandPropertyKeys,
  flattenToProperties,
  parseProperties,
  propertiesToYaml,
  yamlToProperties,
} from './properties';

describe('parseProperties', () => {
  test('supports =, : and space separators', () => {
    const parsed = parseProperties('a=1\nb : 2\nc 3\n');
    expect(parsed).toEqual({ a: '1', b: '2', c: '3' });
  });

  test('skips comments and blank lines', () => {
    const parsed = parseProperties('# comment\n! another\n\nkey = value\n');
    expect(parsed).toEqual({ key: 'value' });
  });

  test('joins backslash-continued lines', () => {
    const parsed = parseProperties('url=http://example.com/\\\n    long/path');
    expect(parsed).toEqual({ url: 'http://example.com/long/path' });
  });

  test('unescapes separators and unicode', () => {
    const parsed = parseProperties('a\\=b\\:c=one\\ntwo\\u4e2d\\\\x');
    expect(parsed).toEqual({ 'a=b:c': 'one\ntwo中\\x' });
  });

  test('duplicate keys keep the last value', () => {
    expect(parseProperties('k=1\nk=2')).toEqual({ k: '2' });
  });

  test('key without value yields empty string', () => {
    expect(parseProperties('lonely')).toEqual({ lonely: '' });
  });

  test('rejects empty input', () => {
    expect(() => parseProperties('   \n')).toThrowError('输入内容为空');
  });

  test('rejects value-only line', () => {
    expect(() => parseProperties('=oops')).toThrowError('Properties 解析失败');
  });
});

describe('expandPropertyKeys', () => {
  test('expands dots and bracket indices', () => {
    const expanded = expandPropertyKeys({
      'server.host': 'localhost',
      'tags[0]': 'a',
      'tags[1]': 'b',
      'nested.list[2].name': 'x',
    });
    expect(expanded).toEqual({
      server: { host: 'localhost' },
      tags: ['a', 'b'],
      nested: { list: [null, null, { name: 'x' }] },
    });
  });

  test('keeps literal keys with dots intact when none', () => {
    expect(expandPropertyKeys({ plain: 'v' })).toEqual({ plain: 'v' });
  });

  test('conflict: index under object', () => {
    expect(() => expandPropertyKeys({ a: 'x', 'a[0]': 'y' })).toThrowError('键冲突');
  });

  test('path cannot start with index', () => {
    expect(() => expandPropertyKeys({ '[0]': 'x' })).toThrowError('Properties 键格式不正确');
  });
});

describe('flattenToProperties', () => {
  test('flattens nested objects and arrays', () => {
    const text = flattenToProperties({ a: { b: 1 }, list: ['x', 'y'] });
    expect(text).toBe('a.b=1\nlist[0]=x\nlist[1]=y');
  });

  test('escapes separators in keys and control chars in values', () => {
    const text = flattenToProperties({ 'k=v': 'line1\nline2\\end' });
    expect(text).toBe('k\\=v=line1\\nline2\\\\end');
  });

  test('empty containers render as empty value', () => {
    expect(flattenToProperties({ obj: {}, arr: [] })).toBe('obj=\narr=');
  });

  test('sortKeys orders output', () => {
    expect(flattenToProperties({ b: 1, a: 2 }, true)).toBe('a=2\nb=1');
  });

  test('rejects non-object root', () => {
    expect(() => flattenToProperties('scalar')).toThrowError('内容无法转成 Properties');
  });
});

describe('propertiesToYaml', () => {
  test('expands keys by default', () => {
    const out = propertiesToYaml('app.name=demo\napp.hosts[0]=a');
    expect(out).toContain('app:');
    expect(out).toContain('- a');
  });

  test('keeps flat keys when expandDots is false', () => {
    const out = propertiesToYaml('app.name=demo', { expandDots: false });
    expect(out).toContain('app.name: demo');
    expect(out).not.toContain('app:');
  });

  test('values stay strings', () => {
    expect(propertiesToYaml('flag=true')).toContain('"true"');
  });
});

describe('yamlToProperties', () => {
  test('round trip with expansion', () => {
    const props = 'db.host=localhost\ndb.port=5432\ndb.tags[0]=primary';
    const yamlText = propertiesToYaml(props);
    expect(yamlToProperties(yamlText)).toBe(props);
  });

  test('reports line info on syntax error', () => {
    expect(() => yamlToProperties('a:\n b: 1\n  c: 2')).toThrowError(/第 \d+ 行/);
  });

  test('rejects empty document', () => {
    expect(() => yamlToProperties('')).toThrowError('输入内容为空');
    expect(() => yamlToProperties('---\n')).toThrowError('YAML 内容为空');
  });
});
