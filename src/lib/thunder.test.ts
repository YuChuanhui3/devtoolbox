import { describe, expect, test } from 'vitest';
import {
  decodeFlashget,
  decodeQqXuanfeng,
  decodeThunder,
  encodeFlashget,
  encodeQqXuanfeng,
  encodeThunder,
} from './thunder';

const URL_TEXT = 'http://ex.com/a.zip';

describe('thunder / flashget / qqdl link conversion', () => {
  test('thunder vectors', () => {
    expect(encodeThunder(URL_TEXT)).toBe('thunder://QUFodHRwOi8vZXguY29tL2EuemlwWlo=');
    expect(decodeThunder('thunder://QUFodHRwOi8vZXguY29tL2EuemlwWlo=')).toBe(URL_TEXT);
  });

  test('qqdl vector', () => {
    expect(encodeQqXuanfeng(URL_TEXT)).toBe('qqdl://aHR0cDovL2V4LmNvbS9hLnppcA==');
    expect(decodeQqXuanfeng('qqdl://aHR0cDovL2V4LmNvbS9hLnppcA==')).toBe(URL_TEXT);
  });

  test('flashget keeps suffix marker', () => {
    const link = encodeFlashget(URL_TEXT, 'sosobt');
    expect(link.startsWith('flashget://')).toBe(true);
    expect(link.endsWith('&sosobt')).toBe(true);
    expect(decodeFlashget(link)).toBe(URL_TEXT);
    expect(decodeFlashget(link.replace('&sosobt', ''))).toBe(URL_TEXT);
  });

  test('round trip through all platforms', () => {
    const https = 'https://mirror.example.org/files/big.iso';
    expect(decodeThunder(encodeThunder(https))).toBe(https);
    expect(decodeQqXuanfeng(encodeQqXuanfeng(https))).toBe(https);
    expect(decodeFlashget(encodeFlashget(https))).toBe(https);
  });

  test('input validation', () => {
    expect(() => encodeThunder('ex.com/a.zip')).toThrow();
    expect(() => encodeFlashget('')).toThrow();
    expect(() => decodeThunder('thunder://')).toThrow();
    expect(() => decodeThunder('thunder://QUFCQw==')).toThrow(); // decoded lacks AA..ZZ
  });
});
