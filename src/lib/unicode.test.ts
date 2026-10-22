import { describe, expect, test } from 'vitest';
import { decodeUnicode, escapeUnicode } from './unicode';

describe('escapeUnicode', () => {
  test('escapes every code point by default', () => {
    expect(escapeUnicode('A中')).toBe('\\u0041\\u4e2d');
  });

  test('keeps ASCII untouched when escapeAll is false', () => {
    expect(escapeUnicode('{"名":"中文"}', { escapeAll: false })).toBe('{"\\u540d":"\\u4e2d\\u6587"}');
  });

  test('supports uppercase hexadecimal output', () => {
    expect(escapeUnicode('中', { uppercase: true })).toBe('\\u4E2D');
  });

  test('encodes non-BMP characters as surrogate pairs', () => {
    expect(escapeUnicode('👋')).toBe('\\ud83d\\udc4b');
    expect(escapeUnicode('👋', { uppercase: true })).toBe('\\uD83D\\uDC4B');
  });
});

describe('decodeUnicode', () => {
  test('decodes four-digit, braced and hex escapes', () => {
    expect(decodeUnicode('\\u4f60\\u597d')).toBe('你好');
    expect(decodeUnicode('\\u{1f44b}')).toBe('👋');
    expect(decodeUnicode('\\x41\\x42')).toBe('AB');
  });

  test('round-trips Chinese and emoji through escapeUnicode', () => {
    const source = '你好，DevToolbox 👋';
    expect(decodeUnicode(escapeUnicode(source))).toBe(source);
  });

  test('leaves escaped backslashes untouched', () => {
    expect(decodeUnicode('\\\\u4f60')).toBe('\\\\u4f60');
    expect(decodeUnicode('\\\\\\u4f60')).toBe('\\\\你');
  });

  test('keeps invalid or unsupported escapes unchanged', () => {
    const source = '\\u12G4 \\u{110000} \\xZZ \\u123';
    expect(decodeUnicode(source)).toBe(source);
  });

  test('nonAsciiOnly preserves JSON syntax characters', () => {
    const source = '"\\u4f60\\u0022\\n"';
    expect(decodeUnicode(source, { nonAsciiOnly: true })).toBe('"你\\u0022\\n"');
  });

  test('jsonOnly ignores braced and hex escapes', () => {
    const source = '\\u{1f44b} \\x41 \\u4f60';
    expect(decodeUnicode(source, { jsonOnly: true })).toBe('\\u{1f44b} \\x41 你');
  });

  test('decodes surrogate pairs written as separate escapes', () => {
    expect(decodeUnicode('\\ud83d\\udc4b')).toBe('👋');
  });
});
