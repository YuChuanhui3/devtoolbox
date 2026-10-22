import { describe, expect, test } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  test('merges class names and skips falsy values', () => {
    expect(cn('a', false, undefined, 'b', null, { c: true, d: false })).toBe('a b c');
  });
});
