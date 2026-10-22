import { beforeAll, describe, expect, test, vi } from 'vitest';
import {
  convertColor,
  hslToRgb,
  parseColor,
  rgbaToHex,
  rgbaToHsl,
  rgbaToHslString,
  rgbaToRgbString,
} from './color';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe('color utilities', () => {
  test('parseColor accepts 3-, 6- and 8-digit hex', () => {
    expect(parseColor('#2196F3')).toEqual({ r: 33, g: 150, b: 243, a: 1 });
    expect(parseColor('f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#00ff0080')).toEqual({ r: 0, g: 255, b: 0, a: 128 / 255 });
  });

  test('parseColor accepts rgb and rgba syntax', () => {
    expect(parseColor('rgb(33, 150, 243)')).toEqual({ r: 33, g: 150, b: 243, a: 1 });
    expect(parseColor('rgba(255 0 0 / 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(parseColor('rgb(100% 0% 0%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  test('parseColor accepts hsl syntax', () => {
    expect(parseColor('hsl(210, 100%, 50%)')).toEqual({ r: 0, g: 128, b: 255, a: 1 });
    expect(parseColor('hsla(0 100% 50% / 0.25)')).toEqual({ r: 255, g: 0, b: 0, a: 0.25 });
  });

  test('parseColor returns null for invalid input', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor('#12')).toBeNull();
    expect(parseColor('not-a-color')).toBeNull();
    expect(parseColor('rgb(1,2)')).toBeNull();
  });

  test('hslToRgb converts primary colors', () => {
    expect(hslToRgb(0, 100, 50)).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(hslToRgb(120, 100, 50)).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(hslToRgb(240, 100, 50)).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(hslToRgb(-60, 100, 50)).toEqual({ r: 255, g: 0, b: 255, a: 1 });
  });

  test('rgbaToHex and rgbaToRgbString format channels', () => {
    const color = { r: 33, g: 150, b: 243, a: 1 };
    expect(rgbaToHex(color)).toBe('#2196F3');
    expect(rgbaToRgbString(color)).toBe('rgb(33, 150, 243)');
    expect(rgbaToHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080');
    expect(rgbaToRgbString({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('rgba(0, 0, 0, 0.5)');
  });

  test('rgbaToHsl and rgbaToHslString compute HSL values', () => {
    expect(rgbaToHsl({ r: 255, g: 0, b: 0, a: 1 })).toEqual({ h: 0, s: 100, l: 50, a: 1 });
    expect(rgbaToHsl({ r: 128, g: 128, b: 128, a: 1 })).toEqual({ h: 0, s: 0, l: 50, a: 1 });
    expect(rgbaToHslString({ r: 33, g: 150, b: 243, a: 1 })).toBe('hsl(207, 90%, 54%)');
    expect(rgbaToHslString({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('hsla(0, 100%, 50%, 0.5)');
  });

  test('convertColor returns all formats', () => {
    const result = convertColor('#2196F3');
    expect(result?.hex).toBe('#2196F3');
    expect(result?.rgb).toBe('rgb(33, 150, 243)');
    expect(result?.hsl).toBe('hsl(207, 90%, 54%)');
    expect(convertColor('not-a-color')).toBeNull();
  });
});
