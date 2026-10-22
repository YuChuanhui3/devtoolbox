import { describe, expect, test } from 'vitest';
import { apr1Hash, randomApr1Salt, verifyApr1Hash } from './md5crypt';

describe('apr1 MD5-Crypt', () => {
  test('matches htpasswd reference vectors', () => {
    expect(apr1Hash('password', 'SuJ8tUiq')).toBe('$apr1$SuJ8tUiq$tBg26jh/uUpYg0OZXE1Ik1');
    expect(apr1Hash('hunter2', 'abcdefgh')).toBe('$apr1$abcdefgh$ckT15POyCRlen.h6XtGAZ1');
    expect(apr1Hash('p@ss', 'salt1234')).toBe('$apr1$salt1234$6YaINiOtUdCa4X62qMp6T1');
    expect(apr1Hash('Secret123', 'JBLmIw5t')).toBe('$apr1$JBLmIw5t$pYCoFLRlvgG0tdR7q0/uF1');
  });

  test('accepts a full hash as salt source', () => {
    expect(apr1Hash('password', '$apr1$SuJ8tUiq$anything')).toBe('$apr1$SuJ8tUiq$tBg26jh/uUpYg0OZXE1Ik1');
  });

  test('verify', () => {
    expect(verifyApr1Hash('password', '$apr1$SuJ8tUiq$tBg26jh/uUpYg0OZXE1Ik1')).toBe(true);
    expect(verifyApr1Hash('Password', '$apr1$SuJ8tUiq$tBg26jh/uUpYg0OZXE1Ik1')).toBe(false);
    expect(verifyApr1Hash('password', 'not-an-apr1')).toBe(false);
  });

  test('random salt output verifies against itself', () => {
    const hash = apr1Hash('top secret');
    expect(hash).toMatch(/^\$apr1\$.{8}\$.{22}$/);
    expect(verifyApr1Hash('top secret', hash)).toBe(true);
  });

  test('input validation', () => {
    expect(() => apr1Hash('')).toThrow();
    expect(() => apr1Hash('pw', 'wa$ytoo')).toThrow();
    expect(() => apr1Hash('pw', 'toolongsalt9')).toThrow();
    expect(randomApr1Salt(6)).toMatch(/^[./0-9A-Za-z]{6}$/);
  });
});
