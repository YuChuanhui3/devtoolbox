import { describe, expect, test } from 'vitest';
import { canonicalLanguage, highlightCode, highlightCodeAuto, supportedLanguages } from './highlight';

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

  test('auto detection highlights unlabelled code and escapes markup', () => {
    const html = highlightCodeAuto('def greet(name):\n    return name');
    expect(html).toContain('hljs-keyword');
    expect(highlightCodeAuto('<script>alert(1)</script>')).not.toContain('<script>');
    expect(highlightCodeAuto('')).toBe('');
  });

  test('canonicalLanguage normalises aliases', () => {
    expect(canonicalLanguage('js')).toBe('javascript');
    expect(canonicalLanguage('python')).toBe('python');
    expect(canonicalLanguage('not-a-language')).toBe('');
    expect(canonicalLanguage('')).toBe('');
  });

  test('supportedLanguages lists the bundled grammars', () => {
    const languages = supportedLanguages();
    expect(languages).toContain('javascript');
    expect(languages).toContain('yaml');
    expect(languages.every((language) => canonicalLanguage(language) === language)).toBe(true);
  });
});
