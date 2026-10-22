import { describe, expect, test } from 'vitest';
import {
  RADIX_LABELS,
  clamp,
  convertRadix,
  formatBytes,
  formatBytesBoth,
  randomIntInclusive,
} from './number';

describe('number utilities', () => {
  test('formatBytes handles zero, binary and decimal units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KiB');
    expect(formatBytes(1536)).toBe('1.5 KiB');
    expect(formatBytes(1000, 2, 1000)).toBe('1 KB');
    expect(formatBytes(-2048)).toBe('-2 KiB');
    expect(formatBytes(Number.NaN)).toBe('-');
  });

  test('formatBytesBoth returns both systems', () => {
    expect(formatBytesBoth(1024)).toEqual({ binary: '1 KiB', decimal: '1.02 KB' });
  });

  test('clamp constrains values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(20, 0, 10)).toBe(10);
  });

  test('randomIntInclusive returns values within range', () => {
    for (let index = 0; index < 50; index += 1) {
      const value = randomIntInclusive(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(randomIntInclusive(4, 4)).toBe(4);
  });

  test('randomIntInclusive validates ranges', () => {
    expect(() => randomIntInclusive(1.5, 2)).toThrow('范围必须是整数');
    expect(() => randomIntInclusive(5, 2)).toThrow('范围不正确');
    expect(() => randomIntInclusive(0, 2 ** 33)).toThrow('范围过大');
  });

  test('convertRadix converts between bases', () => {
    expect(convertRadix('255', 10)).toEqual({ 2: '11111111', 8: '377', 10: '255', 16: 'ff' });
    expect(convertRadix('0xff', 16)).toEqual({ 2: '11111111', 8: '377', 10: '255', 16: 'ff' });
    expect(convertRadix('', 10)).toEqual({ 2: '', 8: '', 10: '', 16: '' });
  });

  test('convertRadix supports big integers', () => {
    const result = convertRadix('9007199254740993', 10);
    expect(result?.[16]).toBe('20000000000001');
  });

  test('convertRadix reports invalid characters', () => {
    expect(() => convertRadix('102', 2)).toThrow('二进制包含非法字符');
    expect(() => convertRadix('8', 8)).toThrow('八进制包含非法字符');
    expect(() => convertRadix('1a', 10)).toThrow('十进制包含非法字符');
    expect(() => convertRadix('zz', 16)).toThrow('十六进制包含非法字符');
  });

  test('RADIX_LABELS exposes Chinese labels', () => {
    expect(RADIX_LABELS[2]).toBe('二进制');
    expect(RADIX_LABELS[16]).toBe('十六进制');
  });
});
