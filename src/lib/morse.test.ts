import { describe, expect, test } from 'vitest';
import { morseDecode, morseEncode } from './morse';

describe('morse code', () => {
  test('encode vectors', () => {
    expect(morseEncode('SOS')).toBe('... --- ...');
    expect(morseEncode('Hello, World!')).toBe(
      '.... . .-.. .-.. --- --..-- / .-- --- .-. .-.. -.. -.-.--',
    );
    expect(morseEncode('123,')).toBe('.---- ..--- ...-- --..--');
  });

  test('chinese punctuation is normalized', () => {
    expect(morseEncode('，')).toBe('--..--');
    expect(morseEncode('？')).toBe('..--..');
  });

  test('round trip', () => {
    const text = 'DEV TOOLBOX 2026. OK?';
    expect(morseDecode(morseEncode(text))).toBe(text);
  });

  test('word separators: slash, pipe and double spaces', () => {
    expect(morseDecode('... - . / ... --- ...')).toBe('STE SOS');
    expect(morseDecode('... - .   ... --- ...')).toBe('STE SOS');
    expect(morseDecode('... - . | ... --- ...')).toBe('STE SOS');
  });

  test('errors', () => {
    expect(() => morseEncode('')).toThrow();
    expect(() => morseEncode('汉字')).toThrow();
    expect(() => morseDecode('abc')).toThrow();
    expect(() => morseDecode('..-...')).toThrow();
  });
});
