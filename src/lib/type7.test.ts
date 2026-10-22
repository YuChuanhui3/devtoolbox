import { describe, expect, test } from 'vitest';
import { type7Decrypt, type7Encrypt } from './type7';

describe('cisco type 7 (XLAT)', () => {
  test('documented example: seed 2 + "lala" → 020A05570A', () => {
    expect(type7Encrypt('lala', 2)).toBe('020A05570A');
    expect(type7Decrypt('020A05570A')).toBe('lala');
  });

  test('round trip for random seeds', () => {
    for (const seed of [0, 13, 25, 26, 52]) {
      expect(type7Decrypt(type7Encrypt('Passw0rd!@#', seed))).toBe('Passw0rd!@#');
    }
  });

  test('decrypt accepts config lines with prefixes', () => {
    expect(type7Decrypt('enable password 7 020A05570A')).toBe('lala');
  });

  test('errors', () => {
    expect(() => type7Encrypt('')).toThrow();
    expect(() => type7Encrypt('abc', 53)).toThrow();
    expect(() => type7Decrypt('not-a-hash')).toThrow();
    expect(() => type7Decrypt('99ABCD')).toThrow();
  });
});
