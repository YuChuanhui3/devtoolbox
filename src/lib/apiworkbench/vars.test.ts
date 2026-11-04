import { describe, expect, test } from 'vitest';
import { builtinValue, collectMissing, extractVars, interpolate, mergeVarScopes } from './vars';

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
