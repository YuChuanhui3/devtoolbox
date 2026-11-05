import { describe, expect, test } from 'vitest';
import {
  applyParamsToUrl,
  bulkTextFromParams,
  escapeFrameChars,
  finalUrl,
  joinQuery,
  mergeParsedParams,
  paramsFromBulkText,
  paramsFromQuery,
  paramsFromUrlEdit,
  queryFromParams,
  splitQuery,
} from './params';
import type { WbParam } from './types';

const row = (key: string, value = '', enabled = true): WbParam => ({ key, value, enabled });

describe('splitQuery / joinQuery', () => {
  test('无查询串、空查询串、带片段', () => {
    expect(splitQuery('https://a.test/x')).toEqual({ base: 'https://a.test/x', query: '', hash: '' });
    expect(splitQuery('https://a.test/x?')).toEqual({ base: 'https://a.test/x', query: '', hash: '' });
    expect(splitQuery('https://a.test/x?a=1#frag')).toEqual({ base: 'https://a.test/x', query: 'a=1', hash: '#frag' });
    expect(splitQuery('https://a.test/x#frag')).toEqual({ base: 'https://a.test/x', query: '', hash: '#frag' });
  });

  test('片段先出现时，其中的 ? 不算查询串', () => {
    expect(splitQuery('https://a.test/#frag?x=1')).toEqual({ base: 'https://a.test/', query: '', hash: '#frag?x=1' });
  });

  test('第二个 ? 属于值的一部分', () => {
    expect(splitQuery('https://a.test/x?a=b?c').query).toBe('a=b?c');
  });

  test('join 只在有查询串时补 ?', () => {
    expect(joinQuery({ base: 'https://a.test/x', query: '', hash: '#h' })).toBe('https://a.test/x#h');
    expect(joinQuery({ base: 'https://a.test/x', query: 'a=1', hash: '' })).toBe('https://a.test/x?a=1');
  });
});

describe('paramsFromQuery', () => {
  test('普通、无值、多等号、空片段', () => {
    expect(paramsFromQuery('a=1&b=2')).toEqual([row('a', '1'), row('b', '2')]);
    expect(paramsFromQuery('flag')).toEqual([row('flag', '')]);
    expect(paramsFromQuery('a=b=c')).toEqual([row('a', 'b=c')]);
    expect(paramsFromQuery('a=1&&b=2&')).toEqual([row('a', '1'), row('b', '2')]);
    expect(paramsFromQuery('')).toEqual([]);
  });

  test('已编码内容与 + 号原样保留，不二次编解码', () => {
    expect(paramsFromQuery('q=a%2Bb+c&u=a%20b')).toEqual([row('q', 'a%2Bb+c'), row('u', 'a%20b')]);
  });

  test('重名键都保留', () => {
    expect(paramsFromQuery('tag=x&tag=y')).toEqual([row('tag', 'x'), row('tag', 'y')]);
  });
});

describe('queryFromParams', () => {
  test('禁用行与空键不落进 URL', () => {
    expect(queryFromParams([row('a', '1'), row('b', '2', false), row('', 'ghost')])).toBe('a=1');
  });

  test('键值两端空白被去掉，空值写成 k=', () => {
    expect(queryFromParams([row(' a ', ' b ')])) .toBe('a=b');
    expect(queryFromParams([row('flag')])).toBe('flag=');
  });

  test('{{变量}} 保持字面，否则发送前插值匹配不上', () => {
    expect(queryFromParams([row('q', '{{keyword}}')])).toBe('q={{keyword}}');
  });

  test('只转义 & 与 #，% 不动', () => {
    expect(escapeFrameChars('a&b')).toBe('a%26b');
    expect(escapeFrameChars('a#b')).toBe('a%23b');
    expect(escapeFrameChars('50%')).toBe('50%');
    expect(queryFromParams([row('q', 'x&y')])).toBe('q=x%26y');
  });
});

describe('表格与 URL 的双向同步', () => {
  test('表格 → URL → 表格 往返等价', () => {
    const params = [row('page', '2'), row('q', '{{keyword}}')];
    const url = applyParamsToUrl('https://a.test/list?old=1', params);
    expect(url).toBe('https://a.test/list?page=2&q={{keyword}}');
    expect(paramsFromQuery(splitQuery(url).query)).toEqual(params);
  });

  test('全部禁用时查询串消失，片段与路径不动', () => {
    const url = applyParamsToUrl('https://a.test/x?a=1#frag', [row('a', '1', false)]);
    expect(url).toBe('https://a.test/x#frag');
  });

  test('URL 未改动查询串时，表格里的禁用行不被刷掉', () => {
    const previous = [row('a', '1'), row('b', '2', false)];
    expect(paramsFromUrlEdit('https://a.test/x?a=1', previous)).toBe(previous);
    expect(paramsFromUrlEdit('https://a.test/x?a=1&c=3', previous)).toEqual([row('a', '1'), row('c', '3'), row('b', '2', false)]);
  });

  test('用户在 URL 里重新打出禁用行时，以 URL 为准变回启用', () => {
    const previous = [row('a', '1'), row('b', '2', false)];
    expect(paramsFromUrlEdit('https://a.test/x?a=1&b=2', previous)).toEqual([row('a', '1'), row('b', '2')]);
  });

  test('mergeParsedParams 只在键不重复时接回禁用行', () => {
    expect(mergeParsedParams([row('a', '9')], [row('a', '1', false), row('b', '2', false)])).toEqual([row('a', '9'), row('b', '2', false)]);
  });

  test('finalUrl 没有表格时原样返回', () => {
    expect(finalUrl('https://a.test/x?a=1', undefined)).toBe('https://a.test/x?a=1');
    expect(finalUrl('https://a.test/x?a=1', [])).toBe('https://a.test/x?a=1');
    expect(finalUrl('https://a.test/x?stale=1', [row('a', '1')])).toBe('https://a.test/x?a=1');
  });
});

describe('批量编辑', () => {
  test('每行一对，空行与行首 # 是注释', () => {
    expect(paramsFromBulkText(' a = 1 \n\n# note\nflag\nb=x=y\n')).toEqual([row('a', '1'), row('flag', ''), row('b', 'x=y')]);
  });

  test('批量视图只列启用行，应用后禁用行仍在表格里', () => {
    const params = [row('a', '1'), row('b', '2', false)];
    expect(bulkTextFromParams(params)).toBe('a=1');
    expect(mergeParsedParams(paramsFromBulkText(bulkTextFromParams(params)), params)).toEqual(params);
  });
});
