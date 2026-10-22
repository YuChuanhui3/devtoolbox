import { ToolError } from './errors';

export interface CrcSpec {
  name: string;
  width: 16 | 32;
  poly: number;
  init: number;
  refin: boolean;
  refout: boolean;
  xorout: number;
}

export const CRC_PRESETS: CrcSpec[] = [
  { name: 'CRC-32 (IEEE 802.3)', width: 32, poly: 0x04c11db7, init: 0xffffffff, refin: true, refout: true, xorout: 0xffffffff },
  { name: 'CRC-16/IBM (ARC)', width: 16, poly: 0x8005, init: 0x0000, refin: true, refout: true, xorout: 0x0000 },
  { name: 'CRC-16/MODBUS', width: 16, poly: 0x8005, init: 0xffff, refin: true, refout: true, xorout: 0x0000 },
  { name: 'CRC-16/XMODEM', width: 16, poly: 0x1021, init: 0x0000, refin: false, refout: false, xorout: 0x0000 },
  { name: 'CRC-16/CCITT-FALSE', width: 16, poly: 0x1021, init: 0xffff, refin: false, refout: false, xorout: 0x0000 },
];

function reflect(value: number, width: number): number {
  let result = 0;
  let rest = value;
  for (let i = 0; i < width; i += 1) {
    result = (result << 1) | (rest & 1);
    rest >>>= 1;
  }
  return result >>> 0;
}

export function crcCalculate(data: Uint8Array, spec: CrcSpec): number {
  const mask = spec.width === 32 ? 0xffffffff : 0xffff;
  const topBit = spec.width === 32 ? 0x80000000 : 0x8000;
  const poly = spec.refin ? reflect(spec.poly, spec.width) : spec.poly;

  let crc = (spec.refin ? reflect(spec.init, spec.width) : spec.init) >>> 0;
  for (const byte of data) {
    if (spec.refin) {
      crc = (crc ^ byte) >>> 0;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = crc & 1 ? ((crc >>> 1) ^ poly) >>> 0 : crc >>> 1;
      }
    } else {
      crc = (crc ^ (byte << (spec.width - 8))) & mask;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = crc & topBit ? ((crc << 1) ^ poly) & mask : (crc << 1) & mask;
      }
    }
  }
  if (spec.refin !== spec.refout) crc = reflect(crc, spec.width);
  return ((crc ^ (spec.xorout & mask)) & mask) >>> 0;
}

export function crcHex(data: Uint8Array, spec: CrcSpec): string {
  return crcCalculate(data, spec)
    .toString(16)
    .padStart(spec.width / 4, '0')
    .toUpperCase();
}

export function presetByName(name: string): CrcSpec {
  const spec = CRC_PRESETS.find((item) => item.name === name);
  if (!spec) throw new ToolError({ zh: `未知的 CRC 预设：${name}`, en: `Unknown CRC preset: ${name}` });
  return spec;
}
