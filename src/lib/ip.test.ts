import { describe, expect, test } from 'vitest';
import {
  bigIntToIpv6,
  expandIpv6,
  ipFamily,
  ipToNumberString,
  ipv4ToNumber,
  ipv6ToBigInt,
  isPrivateIpv4,
  isValidIpv4,
  isValidIpv6,
  numberStringToIp,
  numberToIpv4,
  randomIpv4,
  randomIpv6,
} from './ip';

describe('ip validation', () => {
  test('isValidIpv4 accepts octets and rejects ranges', () => {
    expect(isValidIpv4('192.168.1.1')).toBe(true);
    expect(isValidIpv4('0.0.0.0')).toBe(true);
    expect(isValidIpv4('256.1.1.1')).toBe(false);
    expect(isValidIpv4('01.2.3.4')).toBe(false);
    expect(isValidIpv4('1.2.3')).toBe(false);
  });

  test('isValidIpv6 covers compressed and embedded forms', () => {
    expect(isValidIpv6('2001:db8::1')).toBe(true);
    expect(isValidIpv6('::ffff:192.0.2.1')).toBe(true);
    expect(isValidIpv6('fe80:0:0:0:0:0:0:1%eth0')).toBe(true);
    expect(isValidIpv6('2001:db8:::1')).toBe(false);
    expect(isValidIpv6('12345::1')).toBe(false);
    expect(isValidIpv6('192.168.1.1')).toBe(false);
  });

  test('expandIpv6 normalizes to eight groups', () => {
    expect(expandIpv6('::1')).toEqual(['0000', '0000', '0000', '0000', '0000', '0000', '0000', '0001']);
    expect(expandIpv6('::ffff:1.2.3.4')?.slice(6)).toEqual(['0102', '0304']);
    expect(expandIpv6('nope')).toBeNull();
  });

  test('ipFamily returns family or null', () => {
    expect(ipFamily('8.8.8.8')).toBe(4);
    expect(ipFamily('::1')).toBe(6);
    expect(ipFamily('x')).toBeNull();
  });
});

describe('ip conversions', () => {
  test('ipv4 round trip', () => {
    expect(ipv4ToNumber('192.168.1.100')).toBe(3232235876);
    expect(numberToIpv4(3232235876)).toBe('192.168.1.100');
    expect(ipv4ToNumber('0.0.0.0')).toBe(0);
    expect(ipv4ToNumber('255.255.255.255')).toBe(4294967295);
  });

  test('ipv4 rejects invalid input', () => {
    expect(() => ipv4ToNumber('1.1.1')).toThrow('不是合法的 IPv4');
    expect(() => numberToIpv4(-1)).toThrow('超出');
    expect(() => numberToIpv4(4294967296)).toThrow('超出');
  });

  test('ipv6 round trip with bigint', () => {
    const value = ipv6ToBigInt('2001:db8::1');
    expect(value).toBe((0x2001n << 112n) + (0xdb8n << 96n) + 1n);
    expect(bigIntToIpv6(value)).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(() => bigIntToIpv6(-1n)).toThrow('超出');
    expect(() => ipv6ToBigInt('zz')).toThrow('不是合法的 IPv6');
  });

  test('ipToNumberString and numberStringToIp', () => {
    expect(ipToNumberString('8.8.8.8')).toEqual({ decimal: '134744072', hex: '0x08080808', family: 4 });
    expect(numberStringToIp('134744072', 4)).toBe('8.8.8.8');
    expect(ipToNumberString('::1').family).toBe(6);
    expect(numberStringToIp('1', 6)).toBe('0000:0000:0000:0000:0000:0000:0000:0001');
    expect(() => numberStringToIp('abc', 4)).toThrow('非负十进制');
    expect(() => ipToNumberString('bad')).toThrow('不是合法的 IP');
  });

  test('isPrivateIpv4', () => {
    expect(isPrivateIpv4('10.1.2.3')).toBe(true);
    expect(isPrivateIpv4('172.20.1.1')).toBe(true);
    expect(isPrivateIpv4('172.32.0.1')).toBe(false);
    expect(isPrivateIpv4('8.8.8.8')).toBe(false);
    expect(isPrivateIpv4('bad')).toBe(false);
  });
});

describe('random ip', () => {
  const seq = (values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length];
  };

  test('randomIpv4 scope any', () => {
    expect(randomIpv4({ random: seq([0, 0.5, 1 - 1e-9, 0.25]) })).toBe('0.128.255.64');
  });

  test('randomIpv4 scope private stays in ranges', () => {
    const ip = randomIpv4({ scope: 'private', random: seq([0, 0, 0.5, 0.5, 0.5, 0, 0, 0]) });
    expect(isValidIpv4(ip)).toBe(true);
    expect(isPrivateIpv4(ip)).toBe(true);
  });

  test('randomIpv4 scope public avoids reserved', () => {
    for (const r of [0.1, 0.3, 0.7, 0.9]) {
      const ip = randomIpv4({ scope: 'public', random: () => r });
      expect(isValidIpv4(ip)).toBe(true);
      expect(isPrivateIpv4(ip)).toBe(false);
    }
  });

  test('randomIpv6 produces eight groups', () => {
    const ip = randomIpv6({ random: seq([0.5, 0, 0.999, 0.1, 0.2, 0.3, 0.4, 0.5]) });
    expect(isValidIpv6(ip)).toBe(true);
  });
});
