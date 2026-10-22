import { describe, expect, test } from 'vitest';
import { CRC_PRESETS, crcCalculate, crcHex, presetByName } from './crc';

const CHECK = new TextEncoder().encode('123456789');

const byName = (name: string) => {
  const spec = CRC_PRESETS.find((item) => item.name.includes(name));
  if (!spec) throw new Error(`preset not found: ${name}`);
  return spec;
};

describe('crc check values for "123456789"', () => {
  test('standard names', () => {
    expect(crcHex(CHECK, byName('CRC-32'))).toBe('CBF43926');
    expect(crcHex(CHECK, byName('CRC-16/IBM'))).toBe('BB3D');
    expect(crcHex(CHECK, byName('MODBUS'))).toBe('4B37');
    expect(crcHex(CHECK, byName('XMODEM'))).toBe('31C3');
    expect(crcHex(CHECK, byName('CCITT-FALSE'))).toBe('29B1');
  });

  test('decimal matches hex', () => {
    expect(crcCalculate(CHECK, byName('CRC-32'))).toBe(0xcbf43926);
  });

  test('presetByName rejects unknown names', () => {
    expect(() => presetByName('CRC-99')).toThrow();
  });
});
