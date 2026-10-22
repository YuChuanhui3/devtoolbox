import { describe, expect, test } from 'vitest';
import { generateMacs, isValidMac, parseOuiPrefix, randomMac } from './mac';

const fixed = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('mac', () => {
  test('randomMac default formatting', () => {
    const mac = randomMac({ random: fixed([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) });
    expect(isValidMac(mac)).toBe(true);
    expect(mac).toMatch(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/);
  });

  test('separators and case', () => {
    const base = { random: () => 0.01 };
    expect(randomMac({ ...base, separator: '-', uppercase: false })).toBe('00-02-02-02-02-02');
    expect(randomMac({ ...base, separator: '.' })).toBe('0002.0202.0202');
    expect(randomMac({ ...base, separator: 'none' })).toBe('000202020202');
  });

  test('locally administered and multicast bits', () => {
    const local = randomMac({ local: true, random: () => 0 });
    const first = parseInt(local.split(':')[0], 16);
    expect(first & 0x02).toBe(2);
    expect(first & 0x01).toBe(0);

    const multi = randomMac({ multicast: true, random: () => 0 });
    expect(parseInt(multi.split(':')[0], 16) & 0x01).toBe(1);
  });

  test('oui prefix respected', () => {
    const mac = randomMac({ oui: 'AC:DE:48', random: () => 0.5 });
    expect(mac.toUpperCase().startsWith('AC:DE:48:')).toBe(true);
    expect(parseOuiPrefix('AABBCC')).toEqual([0xaa, 0xbb, 0xcc]);
    expect(parseOuiPrefix('bad')).toBeNull();
    expect(parseOuiPrefix(null)).toBeNull();
  });

  test('generateMacs clamps count', () => {
    expect(generateMacs({ count: 3 })).toHaveLength(3);
    expect(generateMacs({ count: 0 })).toHaveLength(1);
    expect(generateMacs({ count: 9999 })).toHaveLength(500);
  });

  test('isValidMac accepts common formats', () => {
    expect(isValidMac('01-23-45-67-89-AB')).toBe(true);
    expect(isValidMac('01:23:45:67:89:ab')).toBe(true);
    expect(isValidMac('0123.4567.89ab')).toBe(true);
    expect(isValidMac('01:23-45:67-89:AB')).toBe(false);
    expect(isValidMac('nope')).toBe(false);
  });
});
