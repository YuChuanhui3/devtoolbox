import { describe, expect, test } from 'vitest';
import { calcPpi } from './ppi';
import { tl } from '@/i18n/locale';

describe('screen ppi calculator', () => {
  test('24-inch 1080p', () => {
    const r = calcPpi(1920, 1080, 24);
    expect(r.ppi).toBeCloseTo(91.79, 2);
    expect(r.aspectRatio).toBe('16:9');
    expect(tl(r.densityLabel, 'zh')).toContain('LDPI');
  });

  test('27-inch 4K is retira-level', () => {
    const r = calcPpi(3840, 2160, 27);
    expect(r.ppi).toBeCloseTo(163.18, 2);
    expect(tl(r.densityLabel, 'zh')).toContain('TVDPI');
  });

  test('physical size', () => {
    const r = calcPpi(1080, 1920, 6.1);
    expect(r.physicalWidthInches).toBeLessThan(r.physicalHeightInches);
    expect(r.ppi).toBeGreaterThan(350);
    expect(r.ppm).toBeCloseTo(r.ppi * 39.3701, 0);
  });

  test('validation', () => {
    expect(() => calcPpi(0, 1080, 24)).toThrow();
    expect(() => calcPpi(1920, 1080, 0)).toThrow();
    expect(() => calcPpi(1920, 1080, 201)).toThrow();
  });
});
