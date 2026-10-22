import { describe, expect, test } from 'vitest';
import { generatePwdHash, verifyPwdHash } from './pwdhash';

describe('bcrypt', () => {
  test('generate and verify', () => {
    const hash = generatePwdHash('bcrypt', 'hunter2', 4);
    expect(hash.startsWith('$2')).toBe(true);
    expect(verifyPwdHash('bcrypt', 'hunter2', hash)).toBe(true);
    expect(verifyPwdHash('bcrypt', 'Hunter2', hash)).toBe(false);
  });

  test('invalid hash rejected', () => {
    expect(() => verifyPwdHash('bcrypt', 'x', 'md5hash')).toThrow('Bcrypt');
  });
});

describe('scrypt', () => {
  test('generate and verify with fast params', () => {
    const hash = generatePwdHash('scrypt', 's3cret!', 0, { N: 1024, r: 8, p: 1, dkLen: 32 });
    expect(hash).toMatch(/^scrypt\$1024\$8\$1\$/);
    expect(verifyPwdHash('scrypt', 's3cret!', hash)).toBe(true);
    expect(verifyPwdHash('scrypt', 'wrong', hash)).toBe(false);
  });

  test('custom dkLen is honored on verify', () => {
    const hash = generatePwdHash('scrypt', 'pw', 0, { N: 1024, r: 8, p: 1, dkLen: 16 });
    expect(hash.split('$').pop()).toHaveLength(32);
    expect(verifyPwdHash('scrypt', 'pw', hash)).toBe(true);
  });

  test('parameter validation', () => {
    expect(() => generatePwdHash('scrypt', 'pw', 0, { N: 1000 })).toThrow('Scrypt N 无效');
    expect(() => generatePwdHash('scrypt', 'pw', 0, { r: 9 })).toThrow('r/p');
    expect(() => verifyPwdHash('scrypt', 'pw', 'plain-text')).toThrow('Scrypt 散列');
  });
});
