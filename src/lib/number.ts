import { ToolError } from './errors';

const UNIT_BASE_1024 = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
const UNIT_BASE_1000 = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function formatBytes(bytes: number, decimals = 2, base: 1024 | 1000 = 1024): string {
  if (!Number.isFinite(bytes)) return '-';
  if (bytes === 0) return '0 B';

  const units = base === 1024 ? UNIT_BASE_1024 : UNIT_BASE_1000;
  const index = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(base)), units.length - 1);
  const value = bytes / base ** index;
  const rounded = Number(value.toFixed(decimals));
  return `${rounded} ${units[index]}`;
}

export function formatBytesBoth(bytes: number): { binary: string; decimal: string } {
  return {
    binary: formatBytes(bytes, 2, 1024),
    decimal: formatBytes(bytes, 2, 1000),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function randomIntInclusive(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new ToolError(
      { zh: '范围必须是整数', en: 'Range must be integers' },
      { zh: '请检查最小值与最大值是否为整数。', en: 'Check that the minimum and maximum are integers.' },
    );
  }
  if (min > max) {
    throw new ToolError(
      { zh: '范围不正确', en: 'Invalid range' },
      { zh: '最小值不能大于最大值。', en: 'The minimum cannot be greater than the maximum.' },
    );
  }

  const range = max - min + 1;
  if (range > 0x100000000) {
    throw new ToolError(
      { zh: '范围过大', en: 'Range is too large' },
      { zh: '当前最多支持 2^32 个整数区间。', en: 'Currently supports ranges of at most 2^32 integers.' },
    );
  }
  if (range === 0x100000000) {
    return min + Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000) * range);
  }

  const limit = Math.floor(0x100000000 / range) * range;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);

  return min + (buffer[0] % range);
}

export const RADIX_LABELS: Record<2 | 8 | 10 | 16, string> = {
  2: '二进制',
  8: '八进制',
  10: '十进制',
  16: '十六进制',
};

export type Radix = 2 | 8 | 10 | 16;

const RADIX_PATTERNS: Record<Radix, RegExp> = {
  2: /^[01]+$/,
  8: /^[0-7]+$/,
  10: /^[0-9]+$/,
  16: /^[0-9a-f]+$/i,
};

export interface RadixResult {
  2: string;
  8: string;
  10: string;
  16: string;
}

export function convertRadix(rawValue: string, from: Radix): RadixResult | null {
  const value = rawValue.trim().replace(/^0[xob]/i, '');
  if (!value) {
    return { 2: '', 8: '', 10: '', 16: '' };
  }
  if (!RADIX_PATTERNS[from].test(value)) {
    throw new ToolError(
      {
        zh: `${RADIX_LABELS[from]}包含非法字符`,
        en: `${RADIX_LABELS[from]} contains invalid characters`,
      },
      from === 2
        ? { zh: '二进制仅允许 0 和 1。', en: 'Binary only allows 0 and 1.' }
        : from === 8
          ? { zh: '八进制仅允许 0-7。', en: 'Octal only allows 0-7.' }
          : from === 10
            ? { zh: '十进制仅允许 0-9。', en: 'Decimal only allows 0-9.' }
            : { zh: '十六进制仅允许 0-9 与 a-f。', en: 'Hexadecimal only allows 0-9 and a-f.' },
    );
  }

  const bigint = BigInt(`${from === 16 ? '0x' : from === 8 ? '0o' : from === 2 ? '0b' : ''}${value}`);
  return {
    2: bigint.toString(2),
    8: bigint.toString(8),
    10: bigint.toString(10),
    16: bigint.toString(16),
  };
}
