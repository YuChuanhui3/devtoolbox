import { describe, expect, test } from 'vitest';
import { calcSubnet, maskToPrefix, parseCidrInput, prefixToMask } from './subnet';

describe('mask and prefix conversion', () => {
  test('prefixToMask', () => {
    expect(prefixToMask(24)).toBe('255.255.255.0');
    expect(prefixToMask(0)).toBe('0.0.0.0');
    expect(prefixToMask(32)).toBe('255.255.255.255');
    expect(prefixToMask(26)).toBe('255.255.255.192');
    expect(() => prefixToMask(33)).toThrow('0 ~ 32');
  });

  test('maskToPrefix', () => {
    expect(maskToPrefix('255.255.255.0')).toBe(24);
    expect(maskToPrefix('255.255.255.252')).toBe(30);
    expect(maskToPrefix('255.255.240.0')).toBe(20);
    expect(() => maskToPrefix('255.255.1.0')).toThrow('不是合法的连续子网掩码');
    expect(() => maskToPrefix('bad')).toThrow('格式不正确');
  });

  test('parseCidrInput handles forms', () => {
    expect(parseCidrInput('192.168.1.100/24')).toEqual({ ip: '192.168.1.100', prefix: 24 });
    expect(parseCidrInput('192.168.1.100', '255.255.255.0')).toEqual({ ip: '192.168.1.100', prefix: 24 });
    expect(() => parseCidrInput('')).toThrow('请输入 IP 地址');
  });
});

describe('calcSubnet', () => {
  test('standard /24', () => {
    const info = calcSubnet('192.168.1.100', 24);
    expect(info.network).toBe('192.168.1.0');
    expect(info.broadcast).toBe('192.168.1.255');
    expect(info.mask).toBe('255.255.255.0');
    expect(info.wildcard).toBe('0.0.0.255');
    expect(info.firstHost).toBe('192.168.1.1');
    expect(info.lastHost).toBe('192.168.1.254');
    expect(info.usableHosts).toBe(254);
    expect(info.totalAddresses).toBe(256);
    expect(info.cidr).toBe('192.168.1.0/24');
    expect(info.addressClass).toBe('C');
    expect(info.private).toBe(true);
  });

  test('mask string accepted', () => {
    expect(calcSubnet('10.0.5.7', '255.255.248.0').prefix).toBe(21);
  });

  test('edge prefixes', () => {
    expect(calcSubnet('1.1.1.1', 32).usableHosts).toBe(1);
    expect(calcSubnet('1.1.1.1', 31).usableHosts).toBe(2);
    expect(calcSubnet('1.1.1.1', 0).totalAddresses).toBe(2 ** 32);
  });

  test('class detection', () => {
    expect(calcSubnet('10.0.0.1', 8).addressClass).toBe('A');
    expect(calcSubnet('172.16.0.1', 12).addressClass).toBe('B');
    expect(calcSubnet('224.0.0.1', 4).addressClass).toBe('D');
    expect(calcSubnet('240.0.0.1', 4).addressClass).toBe('E');
  });

  test('invalid input', () => {
    expect(() => calcSubnet('bad', 24)).toThrow('不是合法的 IPv4');
    expect(() => calcSubnet('1.1.1.1', 33)).toThrow('0 ~ 32');
  });
});
