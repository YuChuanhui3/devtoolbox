import { describe, expect, test } from 'vitest';
import {
  countLines,
  countTextStats,
  escapeHtml,
  escapeRegExp,
  getLineColumnAt,
  normalizeNewlines,
  offsetToLineColumn,
  pluralizeCount,
  splitLines,
  unescapeRegExp,
} from './text';

describe('text utilities', () => {
  test('normalizeNewlines converts CRLF and CR to LF', () => {
    expect(normalizeNewlines('a\r\nb\rc')).toBe('a\nb\nc');
  });

  test('splitLines handles empty input and trailing newlines', () => {
    expect(splitLines('')).toEqual([]);
    expect(splitLines('a\nb\n')).toEqual(['a', 'b', '']);
    expect(countLines('a\nb\n')).toBe(3);
    expect(countLines('')).toBe(0);
  });

  test('countTextStats returns zeros for empty text', () => {
    expect(countTextStats('')).toEqual({
      chars: 0,
      charsNoSpace: 0,
      chinese: 0,
      letters: 0,
      digits: 0,
      words: 0,
      lines: 0,
      paragraphs: 0,
      bytes: 0,
    });
  });

  test('countTextStats counts Chinese, letters, digits and words', () => {
    const stats = countTextStats('你好 DevToolbox 2026!\n\nSecond paragraph');
    expect(stats.chinese).toBe(2);
    expect(stats.letters).toBe(25);
    expect(stats.digits).toBe(4);
    expect(stats.words).toBe(6);
    expect(stats.paragraphs).toBe(2);
    expect(stats.lines).toBe(3);
    expect(stats.bytes).toBeGreaterThan(stats.chars);
  });

  test('escapeHtml escapes dangerous characters', () => {
    expect(escapeHtml(`<div class="x">'&'</div>`)).toBe(
      '&lt;div class=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/div&gt;',
    );
  });

  test('escapeRegExp and unescapeRegExp round-trip', () => {
    const raw = 'a+b*c?d.e[f]g(h)i{j}k^l$m|n\\o';
    const escaped = escapeRegExp(raw);
    expect(escaped).toContain('\\+');
    expect(unescapeRegExp(escaped)).toBe(raw);
  });

  test('offsetToLineColumn clamps offsets and computes 1-based positions', () => {
    const text = 'first\nsecond\nthird';
    expect(offsetToLineColumn(text, 0)).toEqual({ line: 1, column: 1 });
    expect(offsetToLineColumn(text, 6)).toEqual({ line: 2, column: 1 });
    expect(offsetToLineColumn(text, 9)).toEqual({ line: 2, column: 4 });
    expect(offsetToLineColumn(text, 9999)).toEqual({ line: 3, column: 6 });
    expect(getLineColumnAt(text, -3)).toEqual({ line: 1, column: 1 });
  });

  test('pluralizeCount formats counts', () => {
    expect(pluralizeCount(3, 'items')).toBe('3 items');
  });

  describe('countTextStats matches the original multi-pass implementation', () => {
    // 单遍扫描重写必须与旧实现逐字段一致，否则 22 个工具的展示数字会漂移。
    function referenceStats(text: string) {
      if (!text) {
        return {
          chars: 0,
          charsNoSpace: 0,
          chinese: 0,
          letters: 0,
          digits: 0,
          words: 0,
          lines: 0,
          paragraphs: 0,
          bytes: 0,
        };
      }
      const chinese = text.match(/[一-鿿㐀-䶿]/g)?.length ?? 0;
      const letters = text.match(/[A-Za-z]/g)?.length ?? 0;
      const digits = text.match(/[0-9]/g)?.length ?? 0;
      const latinWords = text.match(/[A-Za-z0-9_]+(?:['’-][A-Za-z0-9_]+)*/g)?.length ?? 0;
      const paragraphs = normalizeNewlines(text)
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean).length;
      return {
        chars: Array.from(text).length,
        charsNoSpace: Array.from(text.replace(/\s/g, '')).length,
        chinese,
        letters,
        digits,
        words: latinWords + chinese,
        lines: countLines(text),
        paragraphs,
        bytes: new TextEncoder().encode(text).length,
      };
    }

    const corpus: Array<[string, string]> = [
      ['plain', 'Hello DevToolbox 2026'],
      ['mixed cn', '你好 DevToolbox 2026!\n\nSecond paragraph'],
      ['cn only', '中文字符统计'],
      ['cjk ext a', '㐀䶿 not in range 〿'],
      ['empty lines', '\n\n\n'],
      ['crlf', 'a\r\nb\r\nc'],
      ['lone cr', 'a\rb\rc\n'],
      ['trailing newline', 'a\nb\n'],
      ['whitespace para', 'a\n \nb'],
      ['tabs', '\t\ta\tb\t'],
      ['nbsp', 'a b　c'],
      ['thinspace', 'a b c'],
      ['ideographic', 'a　b'],
      ['bom', '﻿feff'],
      ['emoji', '🙂😀😁 pairs count once'],
      ['astral cn', '你好 🙂 𝕏 𝔸'],
      ['lone high surrogate', 'a\uD83D'],
      ['lone low surrogate', 'a\uDE00b'],
      ['apostrophe', "don't can't it's"],
      ['curly quote', 'it’s fine, y’all'],
      ['hyphen words', 'a-b-c -x y-'],
      ['double joiner', "ab''cd"],
      ['joiner runs', "a-'-'b"],
      ['underscore', '_ private _x_'],
      ['digits edge', '0 9 10 0x1F ٩'],
      ['json-ish', '{"a":1,"b":[1,2,3]}\n\n{"c":"x"}'],
      ['quotes', '"hello, world" "again"'],
      ['leading joiner', "'-'- a"],
      ['only joiners', "'''"],
      ['long mixed', '第1行 text\n第2行 more text\n\n\npara3\ttab\r\nwindows'],
    ];

    for (const [name, sample] of corpus) {
      test(name, () => {
        expect(countTextStats(sample)).toEqual(referenceStats(sample));
      });
    }

    test('randomized fuzz against reference', () => {
      const alphabet = [...'abZ0_ \n\r\t ’-中文字🙂“”'];
      let seed = 20261023;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      for (let round = 0; round < 3000; round += 1) {
        const length = Math.floor(rand() * 24);
        let text = '';
        for (let i = 0; i < length; i += 1) text += alphabet[Math.floor(rand() * alphabet.length)];
        expect({ text, stats: countTextStats(text) }).toEqual({ text, stats: referenceStats(text) });
      }
    });
  });
});
