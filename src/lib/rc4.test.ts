import { describe, expect, test } from 'vitest';
import { rc4 } from './rc4';

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

describe('rc4', () => {
  test('wikipedia test vectors', () => {
    expect(hex(rc4('Key', 'Plaintext'))).toBe('bbf316e8d940af0ad3');
    expect(hex(rc4('Wiki', 'pedia'))).toBe('1021bf0420');
    expect(hex(rc4('Secret', 'Attack at dawn'))).toBe('45a01f645fc35b383552544b9bf5');
  });

  test('symmetric encryption/decryption', () => {
    const plain = new TextEncoder().encode('RC4 测试 data!');
    const cipher = rc4('secret key', plain);
    expect(new TextDecoder().decode(rc4('secret key', cipher))).toBe('RC4 测试 data!');
  });

  test('empty key rejected', () => {
    expect(() => rc4('', 'x')).toThrow();
  });
});
