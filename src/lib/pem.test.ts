import { describe, expect, test } from 'vitest';
import { derToPem, pemToDer } from './pem';

describe('PEM ↔ DER', () => {
  test('round trip wraps at 64 chars', () => {
    const der = new Uint8Array(200).map((_, index) => index % 251);
    const pem = derToPem(der, 'PUBLIC KEY');
    expect(pem.startsWith('-----BEGIN PUBLIC KEY-----\n')).toBe(true);
    expect(pem).toContain('-----END PUBLIC KEY-----\n');
    const bodyLines = pem.split('\n').slice(1, -2);
    expect(bodyLines.every((line) => line.length <= 64)).toBe(true);
    expect(Array.from(pemToDer(pem, 'PUBLIC KEY'))).toEqual(Array.from(der));
  });

  test('tolerates CRLF and surrounding noise', () => {
    const pem = 'junk\n-----BEGIN CERTIFICATE-----\r\ndQ==\r\n-----END CERTIFICATE-----\r\nmore';
    expect(Array.from(pemToDer(pem, 'CERTIFICATE'))).toEqual([117]);
  });

  test('errors', () => {
    expect(() => pemToDer('not pem at all')).toThrow('PEM 格式不正确');
    expect(() => pemToDer(derToPem(new Uint8Array([1]), 'PUBLIC KEY'), 'PRIVATE KEY')).toThrow(
      'PEM 类型不匹配',
    );
    expect(() => pemToDer('-----BEGIN PUBLIC KEY-----\n!!!\n-----END PUBLIC KEY-----')).toThrow(
      'Base64',
    );
  });
});
