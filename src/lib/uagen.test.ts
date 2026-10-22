import { describe, expect, test } from 'vitest';
import { randomUserAgent, UA_BROWSERS, UA_OS_LIST } from './uagen';

const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('randomUserAgent', () => {
  test('covers all combos without throwing', () => {
    for (const browser of UA_BROWSERS) {
      for (const os of UA_OS_LIST) {
        const ua = randomUserAgent({ browser, os, random: seq([0.12, 0.5, 0.9, 0.3, 0.7, 0.1]) });
        expect(ua).toMatch(/^Mozilla\/5\.0/);
      }
    }
  });

  test('chrome windows template', () => {
    const ua = randomUserAgent({ browser: 'Chrome', os: 'Windows 11', random: () => 0 });
    expect(ua).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
  });

  test('edge embeds matching chrome major', () => {
    const ua = randomUserAgent({ browser: 'Edge', os: 'macOS', random: () => 0 });
    expect(ua).toContain('Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0');
  });

  test('firefox includes rv', () => {
    const ua = randomUserAgent({ browser: 'Firefox', os: 'Ubuntu', random: () => 0 });
    expect(ua).toContain('X11; Linux x86_64; rv:125.0');
    expect(ua).toMatch(/Firefox\/125\.0$/);
  });

  test('android and ios mobile markers', () => {
    expect(randomUserAgent({ browser: 'Chrome', os: 'Android', random: () => 0 })).toContain(' Mobile Safari/537.36');
    expect(randomUserAgent({ browser: 'Safari', os: 'iOS', random: () => 0 })).toContain('iPhone OS 17_0 like Mac OS X');
    expect(randomUserAgent({ browser: 'Firefox', os: 'iOS', random: () => 0 })).toContain('Safari/604.1');
    expect(randomUserAgent({ browser: 'Edge', os: 'Android', random: () => 0 })).toContain('EdgA/120.0.0.0');
  });

  test('default random picks valid strings', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(randomUserAgent()).toMatch(/^Mozilla\/5\.0 \(/);
    }
  });
});
