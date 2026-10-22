import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { describe, expect, test } from 'vitest';
import { formatLabel, generateHtpasswdLine } from './htpasswd';
import { verifyApr1Hash } from './md5crypt';

describe('htpasswd entries', () => {
  test('bcrypt format uses $2y$ prefix and verifies', () => {
    const entry = generateHtpasswdLine('bob', 'pass', 'bcrypt', 4);
    expect(entry.line.startsWith('bob:$2y$04$')).toBe(true);
    expect(bcrypt.compareSync('pass', entry.line.slice(4))).toBe(true);
    expect(bcrypt.compareSync('passx', entry.line.slice(4))).toBe(false);
  });

  test('apr1 format verifies against md5crypt', () => {
    const entry = generateHtpasswdLine('alice', 's3cret', 'apr1');
    const [, hash] = entry.line.split(':');
    expect(hash.startsWith('$apr1$')).toBe(true);
    expect(verifyApr1Hash('s3cret', hash)).toBe(true);
    expect(verifyApr1Hash('S3cret', hash)).toBe(false);
  });

  test('sha1 format matches node crypto', () => {
    const expected = createHash('sha1').update('secret').digest('base64');
    const entry = generateHtpasswdLine('admin', 'secret', 'sha1');
    expect(entry.line).toBe(`admin:{SHA}${expected}`);
  });

  test('plain format and label', () => {
    expect(generateHtpasswdLine('u', 'pw', 'plain').line).toBe('u:pw');
    expect(formatLabel('apr1')).toContain('MD5');
  });

  test('validation', () => {
    expect(() => generateHtpasswdLine('', 'pw', 'apr1')).toThrow('用户名');
    expect(() => generateHtpasswdLine('a:b', 'pw', 'apr1')).toThrow('冒号');
    expect(() => generateHtpasswdLine('a', '', 'bcrypt')).toThrow('口令');
  });
});
