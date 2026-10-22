import { describe, expect, test } from 'vitest';
import {
  BASE58_ALPHABET,
  BASE62_ALPHABET,
  base58Decode,
  base58Encode,
  base62Decode,
  base62Encode,
  decodeBase100,
  encodeBase100,
} from './basen';

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('base58 (BTC alphabet)', () => {
  test('known vector', () => {
    expect(base58Encode(enc('Hello World!'))).toBe('2NEpo7TZRRrLZSi2U');
  });

  test('leading zero bytes map to alphabet[0]', () => {
    const bytes = new Uint8Array([0, 0, ...Array.from(enc('hi'))]);
    const encoded = base58Encode(bytes);
    expect(encoded.startsWith('11')).toBe(true);
    expect(Array.from(base58Decode(encoded))).toEqual(Array.from(bytes));
  });

  test('round trip and invalid character', () => {
    expect(dec(base58Decode(base58Encode(enc('中文 BTC'))))).toBe('中文 BTC');
    expect(() => base58Decode('0OIl')).toThrow();
  });
});

describe('base62', () => {
  test('known vector', () => {
    expect(base62Encode(enc('Hello World!'))).toBe('T8dgcjRGkZ3aysdN');
  });

  test('round trip with leading zeros', () => {
    const bytes = new Uint8Array([0, 0, 1, 2, 3]);
    expect(Array.from(base62Decode(base62Encode(bytes)))).toEqual(Array.from(bytes));
  });

  test('alphabets do not contain each other’s excluded chars', () => {
    expect(BASE58_ALPHABET).not.toContain('0');
    expect(BASE58_ALPHABET).not.toContain('I');
    expect(BASE62_ALPHABET).toContain('0');
  });
});

describe('base100 digit-pair encoding', () => {
  test('digit pairs', () => {
    expect(encodeBase100('0')).toBe('Aa');
    expect(encodeBase100('129')).toBe('BbCcJj');
    expect(decodeBase100('BbCcJj')).toBe('129');
  });

  test('round trip', () => {
    expect(decodeBase100(encodeBase100('20261023'))).toBe('20261023');
  });

  test('errors', () => {
    expect(() => encodeBase100('12a')).toThrow();
    expect(() => decodeBase100('Aab')).toThrow();
    expect(() => decodeBase100('Az')).toThrow();
  });
});
