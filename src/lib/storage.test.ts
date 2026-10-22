import { beforeEach, describe, expect, test } from 'vitest';
import { readStorage, removeStorage, writeStorage } from './storage';

describe('storage utilities', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('returns fallback when key is missing or invalid', () => {
    expect(readStorage('missing', { a: 1 })).toEqual({ a: 1 });
    window.localStorage.setItem('broken', '{not json');
    expect(readStorage('broken', 'fallback')).toBe('fallback');
  });

  test('writes and reads JSON values', () => {
    expect(writeStorage('key', { a: 1 })).toBe(true);
    expect(readStorage('key', null)).toEqual({ a: 1 });
  });

  test('removes values', () => {
    writeStorage('key', 'value');
    removeStorage('key');
    expect(readStorage('key', null)).toBeNull();
  });
});
