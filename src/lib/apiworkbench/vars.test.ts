import { describe, expect, test } from 'vitest';
import { builtinValue, collectMissing, extractVars, interpolate, mergeVarLists, mergeVarScopes } from './vars';

const fixedRand = () => 0.5;

describe('extractVars', () => {
  test('去重提取 {{token}}，容忍空白', () => {
    expect(extractVars('{{a}}/{{ a }}/{{b}}/{{a}}')).toEqual(['a', 'b']);
    expect(extractVars('plain')).toEqual([]);
  });
});

describe('mergeVarScopes', () => {
  const v = (key: string, value: string, enabled = true) => ({ id: key, key, value, enabled });

  test('后层覆盖前层；禁用与空 key 忽略', () => {
    const scope = mergeVarScopes([v('a', 'col'), v('skip', 'x', false), v(' ', 'x')], [v('a', 'env'), v('b', '2')]);
    expect(scope).toEqual({ a: 'env', b: '2' });
  });
});

describe('mergeVarLists', () => {
  const w = (key: string, value: string, enabled = true) => ({ id: `id-${key}`, key, value, enabled });

  test('后层覆盖同名的整行，前面的行不再出现', () => {
    const merged = mergeVarLists([w('a', 'parent'), w('b', 'parent')], [w('a', 'child')]);
    expect(merged.map((row) => [row.key, row.value])).toEqual([['a', 'child'], ['b', 'parent']]);
  });

  test('禁用行也保留成行——子层关掉某项就是关掉，不回填父层的值', () => {
    const merged = mergeVarLists([w('a', 'parent')], [w('a', 'child', false)]);
    expect(merged).toEqual([w('a', 'child', false)]);
    expect(mergeVarScopes(merged)).toEqual({});
  });

  test('返回的是副本，改回去不会写脏源表', () => {
    const parent = [w('a', 'parent')];
    const merged = mergeVarLists(parent);
    merged[0].value = 'mutated';
    expect(parent[0].value).toBe('parent');
  });

  test('空 key 与空白 key 直接丢弃，继承链空白层不影响顺序', () => {
    expect(mergeVarLists([w(' ', 'x'), w('', 'y')], [], [w('a', '1')]).map((row) => row.key)).toEqual(['a']);
  });
});

describe('interpolate', () => {
  test('替换 scope 变量并保留缺失项、汇报 missing', () => {
    const out = interpolate('{{base}}/x/{{token}}', { base: 'https://api', token: 't' });
    expect(out).toEqual({ text: 'https://api/x/t', missing: [] });
    const miss = interpolate('{{base}}/{{ghost}}', { base: 'https://api' }, fixedRand, 1000);
    expect(miss.text).toBe('https://api/{{ghost}}');
    expect(miss.missing).toEqual(['ghost']);
  });

  test('内置 $uuid / $timestamp / $randomInt', () => {
    const uuid = builtinValue('$uuid', fixedRand, 0);
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(builtinValue('$timestamp', fixedRand, 1730000000000)).toBe('1730000000000');
    const n = Number(builtinValue('$randomInt(1,6)', fixedRand, 0));
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(6);
    expect(builtinValue('$unknown', fixedRand, 0)).toBe('');
    expect(builtinValue('plain', fixedRand, 0)).toBeNull();
  });

  test('{{unknownBuiltin}} 不在 scope 时视为 missing 而非内置', () => {
    const out = interpolate('{{$missing}}', {}, fixedRand, 0);
    expect(out.text).toBe('');
    expect(out.missing).toEqual([]);
  });
});

describe('collectMissing', () => {
  test('跳过 $ 内置，收集其余未定义变量', () => {
    expect(collectMissing(['{{a}} {{$uuid}}', '{{b}}/{{a}}'], { a: '1' })).toEqual(['b']);
  });
});
