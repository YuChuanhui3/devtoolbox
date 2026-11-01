import { describe, expect, it } from 'vitest';
import { MAX_REGEX_MATCHES, matchRegex } from './regexMatch';

describe('matchRegex', () => {
  it('自动补 g 标志并收集匹配与分组', () => {
    const outcome = matchRegex({ pattern: '(\\d+)-(?<tail>\\d+)', flags: '', text: '12-34 and 56-78' });
    expect(outcome.effectiveFlags).toBe('g');
    expect(outcome.matches).toHaveLength(2);
    expect(outcome.matches[0].groups).toEqual(['12', '34']);
    expect(outcome.matches[0].namedGroups).toEqual({ tail: '34' });
    expect(outcome.truncated).toBe(false);
    expect(outcome.timedOut).toBe(false);
  });

  it('非法正则返回原始错误而不是抛出', () => {
    const outcome = matchRegex({ pattern: '(unclosed', flags: 'g', text: 'x' });
    expect(outcome.error).toBeTruthy();
    expect(outcome.matches).toEqual([]);
  });

  it('空模式或空文本直接返回空结果', () => {
    expect(matchRegex({ pattern: '', flags: 'g', text: 'abc' }).matches).toEqual([]);
    expect(matchRegex({ pattern: 'a', flags: 'g', text: '' }).matches).toEqual([]);
  });

  it('零宽匹配不会死循环', () => {
    const outcome = matchRegex({ pattern: 'x*', flags: 'g', text: 'abc' });
    expect(outcome.matches.length).toBeLessThanOrEqual(MAX_REGEX_MATCHES);
    expect(outcome.timedOut).toBe(false);
  });

  it('超过 maxMatches 时截断并标记', () => {
    const outcome = matchRegex(
      { pattern: 'a', flags: 'g', text: 'a'.repeat(10) },
      { maxMatches: 3 },
    );
    expect(outcome.matches).toHaveLength(3);
    expect(outcome.truncated).toBe(true);
  });

  it('超过 deadline 时停止并标记 timedOut', () => {
    const outcome = matchRegex(
      { pattern: 'a', flags: 'g', text: 'a'.repeat(100000) },
      { maxMatches: 100000, deadlineMs: -1 },
    );
    expect(outcome.timedOut).toBe(true);
    expect(outcome.matches.length).toBeLessThan(100000);
  });
});
