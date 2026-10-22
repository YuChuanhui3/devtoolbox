import { describe, expect, test } from 'vitest';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  base64ToBytes,
  base64ToText,
  bytesToBase64,
  isLikelyBase64,
  normalizeBase64,
  textToBase64,
} from './base64';

describe('base64 utilities', () => {
  test('round-trips UTF-8 text with Chinese and emoji', () => {
    const text = 'Hello, 世界 👋';
    const encoded = textToBase64(text);
    expect(base64ToText(encoded)).toBe(text);
  });

  test('supports URL-safe output and missing padding', () => {
    const text = 'a+b/c?';
    const urlSafe = textToBase64(text, true, true);
    expect(urlSafe).not.toMatch(/[+/=]/);
    expect(base64ToText(urlSafe)).toBe(text);
  });

  test('normalizeBase64 strips whitespace and pads', () => {
    expect(normalizeBase64(' SGVs bG8= ')).toBe('SGVsbG8=');
    expect(normalizeBase64('SGVsbG8')).toBe('SGVsbG8=');
  });

  test('rejects invalid Base64 content', () => {
    expect(() => normalizeBase64('')).toThrow('输入内容为空');
    expect(() => normalizeBase64('abc$')).toThrow('Base64 格式不正确');
    expect(() => normalizeBase64('abcde')).toThrow('Base64 长度不正确');
  });

  test('decodes bytes and reports non-UTF8 payloads', () => {
    const bytes = base64ToBytes('AQID');
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(() => base64ToText('/w==')).toThrow(/解码失败/);
  });

  test('converts bytes and ArrayBuffers', () => {
    const bytes = new Uint8Array([72, 105]);
    expect(bytesToBase64(bytes)).toBe('SGk=');
    const buffer = base64ToArrayBuffer('SGk=');
    expect(new Uint8Array(buffer)).toEqual(bytes);
    expect(arrayBufferToBase64(buffer)).toBe('SGk=');
  });

  test('isLikelyBase64 validates inputs', () => {
    expect(isLikelyBase64('SGVsbG8=')).toBe(true);
    expect(isLikelyBase64('not base64!')).toBe(false);
  });
});
