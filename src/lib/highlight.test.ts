import { describe, expect, test } from 'vitest';
import { highlightCode } from './highlight';

describe('highlight utilities', () => {
  test('highlights known languages', () => {
    const html = highlightCode('SELECT * FROM users', 'sql');
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('users');
  });

  test('escapes code for unknown languages', () => {
    expect(highlightCode('<script>', 'unknown-language')).toBe('&lt;script&gt;');
  });

  test('handles empty input', () => {
    expect(highlightCode('', 'sql')).toBe('');
  });
});
