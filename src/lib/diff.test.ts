import { describe, expect, test } from 'vitest';
import { compareText, compareTextInline, isEmptyDiff } from './diff';

describe('diff utilities', () => {
  test('detects added and removed lines', () => {
    const result = compareText('a\nb\n', 'a\nc\n', {
      ignoreWhitespace: false,
      compareAsJson: false,
    });
    expect(result.stats.added).toBe(1);
    expect(result.stats.removed).toBe(1);
    expect(result.stats.unchanged).toBe(1);
    expect(isEmptyDiff(result)).toBe(false);
  });

  test('ignores trailing whitespace differences when requested', () => {
    const result = compareText('a  \n', 'a\n', {
      ignoreWhitespace: true,
      compareAsJson: false,
    });
    expect(isEmptyDiff(result)).toBe(true);
  });

  test('compares formatted JSON values', () => {
    const result = compareText('{"b":2,"a":1}', '{\n  "b": 2,\n  "a": 1\n}', {
      ignoreWhitespace: false,
      compareAsJson: true,
    });
    expect(isEmptyDiff(result)).toBe(true);
  });

  test('rejects invalid JSON in JSON compare mode', () => {
    expect(() =>
      compareText('{', '{}', { ignoreWhitespace: false, compareAsJson: true }),
    ).toThrow(/JSON 对比失败/);
  });

  test('returns empty diff for identical input', () => {
    const result = compareText('same\n', 'same\n', {
      ignoreWhitespace: false,
      compareAsJson: false,
    });
    expect(isEmptyDiff(result)).toBe(true);
    expect(result.parts).toHaveLength(1);
  });
});

describe('compareTextInline', () => {
  test('word granularity marks changed words', () => {
    const result = compareTextInline('the quick fox', 'the slow fox', 'word');
    expect(result.stats.added).toBe(1);
    expect(result.stats.removed).toBe(1);
    expect(result.parts.map((p) => p.value).join('')).toBeTruthy();
    expect(result.parts.some((p) => p.added && p.value.includes('slow'))).toBe(true);
  });

  test('char granularity suits Chinese text', () => {
    const result = compareTextInline('今天天气很好', '今天天气不错', 'char');
    expect(result.stats.added).toBe(2);
    expect(result.stats.removed).toBe(2);
    expect(result.stats.unchanged).toBe(4);
  });

  test('identical input yields empty diff', () => {
    const result = compareTextInline('same text', 'same text', 'word');
    expect(result.stats.added).toBe(0);
    expect(result.stats.removed).toBe(0);
  });

  test('both empty returns no parts', () => {
    expect(compareTextInline('', '', 'char').parts).toHaveLength(0);
  });
});
