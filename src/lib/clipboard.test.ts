import { afterEach, describe, expect, test, vi } from 'vitest';
import { copyText } from './clipboard';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clipboard utilities', () => {
  test('returns false for empty text', async () => {
    await expect(copyText('')).resolves.toBe(false);
  });

  test('uses the Clipboard API when available', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  test('falls back to execCommand when the Clipboard API fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) },
      configurable: true,
    });
    document.execCommand = vi.fn(() => true);

    await expect(copyText('fallback')).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  test('returns false when both methods fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    document.execCommand = vi.fn(() => {
      throw new Error('unsupported');
    });

    await expect(copyText('fail')).resolves.toBe(false);
  });
});
