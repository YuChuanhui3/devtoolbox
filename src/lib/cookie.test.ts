import { describe, expect, it } from 'vitest';
import { decodeCookieValue, parseCookieString } from './cookie';

describe('decodeCookieValue', () => {
  it('解码合法的百分号编码', () => {
    expect(decodeCookieValue('hello%20world')).toBe('hello world');
    expect(decodeCookieValue('%E4%B8%AD%E6%96%87')).toBe('中文');
  });

  it('非法编码保持原样', () => {
    expect(decodeCookieValue('100%good')).toBe('100%good');
  });
});

describe('parseCookieString', () => {
  it('解析标准 Cookie 头', () => {
    expect(parseCookieString('Cookie: sid=abc123; theme=dark')).toEqual([
      { name: 'sid', value: 'abc123' },
      { name: 'theme', value: 'dark' },
    ]);
  });

  it('解析空格分隔的键值列表', () => {
    expect(parseCookieString('a=1 b=2')).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: '2' },
    ]);
  });

  it('值中的等号只按第一个切分并解码', () => {
    expect(parseCookieString('token=a%3Db%3Dc')).toEqual([{ name: 'token', value: 'a=b=c' }]);
  });

  it('忽略空段、缺少等号与空名称的片段', () => {
    expect(parseCookieString(';  ; noequals; =novalue; x=1')).toEqual([{ name: 'x', value: '1' }]);
  });

  it('空输入返回空数组', () => {
    expect(parseCookieString('')).toEqual([]);
    expect(parseCookieString('   ')).toEqual([]);
  });
});
