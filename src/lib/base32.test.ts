import { describe, expect, test } from 'vitest';
import { base32ToBytes, base32ToText, bytesToBase32, textToBase32 } from './base32';

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('base32 (RFC 4648)', () => {
  test('official encoding vectors', () => {
    expect(bytesToBase32(enc(''))).toBe('');
    expect(bytesToBase32(enc('f'))).toBe('MY======');
    expect(bytesToBase32(enc('fo'))).toBe('MZXQ====');
    expect(bytesToBase32(enc('foo'))).toBe('MZXW6===');
    expect(bytesToBase32(enc('foob'))).toBe('MZXW6YQ=');
    expect(bytesToBase32(enc('fooba'))).toBe('MZXW6YTB');
    expect(bytesToBase32(enc('foobar'))).toBe('MZXW6YTBOI======');
  });

  test('decode is case-insensitive and tolerates spaces/dashes', () => {
    expect(dec(base32ToBytes('mzxw6ytboi======'))).toBe('foobar');
    expect(dec(base32ToBytes('MZXW6 YTBOI====='))).toBe('foobar');
    expect(dec(base32ToBytes('MZXW6-YTBOI'))).toBe('foobar');
  });

  test('text helpers round trip', () => {
    expect(base32ToText(textToBase32('中文 abc123!'))).toBe('中文 abc123!');
  });

  test('rejects invalid characters', () => {
    expect(() => base32ToBytes('!')).toThrow();
  });
});
