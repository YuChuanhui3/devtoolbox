import { md5, ripemd160, sha1 } from '@noble/hashes/legacy.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { keccak_256, sha3_256, sha3_512, shake128, shake256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { md2Hex } from './md2';
import { md4Hex } from './md4';
import { ToolError } from './errors';
import type { L10n } from '@/i18n/locale';

export type HashAlgorithm =
  | 'md2'
  | 'md4'
  | 'md5'
  | 'ripemd160'
  | 'sha1'
  | 'sha256'
  | 'sha512'
  | 'sha3-256'
  | 'sha3-512'
  | 'keccak-256'
  | 'shake128'
  | 'shake256';

export interface AlgorithmInfo {
  id: HashAlgorithm;
  label: string;
  family: string;
  isXof?: boolean;
}

export const HASH_ALGORITHMS: AlgorithmInfo[] = [
  { id: 'md2', label: 'MD2', family: 'MD 系列' },
  { id: 'md4', label: 'MD4', family: 'MD 系列' },
  { id: 'md5', label: 'MD5', family: 'MD 系列' },
  { id: 'ripemd160', label: 'RIPEMD-160', family: 'MD 系列' },
  { id: 'sha1', label: 'SHA-1', family: 'SHA-1 / SHA-2' },
  { id: 'sha256', label: 'SHA-256', family: 'SHA-1 / SHA-2' },
  { id: 'sha512', label: 'SHA-512', family: 'SHA-1 / SHA-2' },
  { id: 'sha3-256', label: 'SHA3-256', family: 'SHA-3 / Keccak' },
  { id: 'sha3-512', label: 'SHA3-512', family: 'SHA-3 / Keccak' },
  { id: 'keccak-256', label: 'Keccak-256', family: 'SHA-3 / Keccak' },
  { id: 'shake128', label: 'SHAKE128', family: 'SHAKE（可变长度）', isXof: true },
  { id: 'shake256', label: 'SHAKE256', family: 'SHAKE（可变长度）', isXof: true },
];

export const DEFAULT_HASH_ALGORITHMS: HashAlgorithm[] = ['md5', 'sha1', 'sha256'];

export const FAMILY_LABELS: Record<string, L10n> = {
  'MD 系列': { zh: 'MD 系列', en: 'MD family' },
  'SHA-1 / SHA-2': { zh: 'SHA-1 / SHA-2', en: 'SHA-1 / SHA-2' },
  'SHA-3 / Keccak': { zh: 'SHA-3 / Keccak', en: 'SHA-3 / Keccak' },
  'SHAKE（可变长度）': { zh: 'SHAKE（可变长度）', en: 'SHAKE (variable length)' },
};

export interface HashOptions {
  shakeBytes?: number;
}

const SHAKE_MIN_BYTES = 1;
const SHAKE_MAX_BYTES = 4096;

function toBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === 'string' ? utf8ToBytes(input) : input;
}

export function hashInput(
  input: string | Uint8Array,
  algorithm: HashAlgorithm,
  options: HashOptions = {},
): string {
  const bytes = toBytes(input);
  switch (algorithm) {
    case 'md2':
      return md2Hex(bytes);
    case 'md4':
      return md4Hex(bytes);
    case 'md5':
      return bytesToHex(md5(bytes));
    case 'ripemd160':
      return bytesToHex(ripemd160(bytes));
    case 'sha1':
      return bytesToHex(sha1(bytes));
    case 'sha256':
      return bytesToHex(sha256(bytes));
    case 'sha512':
      return bytesToHex(sha512(bytes));
    case 'sha3-256':
      return bytesToHex(sha3_256(bytes));
    case 'sha3-512':
      return bytesToHex(sha3_512(bytes));
    case 'keccak-256':
      return bytesToHex(keccak_256(bytes));
    case 'shake128':
    case 'shake256': {
      const length = options.shakeBytes ?? (algorithm === 'shake128' ? 32 : 64);
      if (!Number.isInteger(length) || length < SHAKE_MIN_BYTES || length > SHAKE_MAX_BYTES) {
        throw new ToolError(
          { zh: `SHAKE 输出长度无效：${length}`, en: `Invalid SHAKE output length: ${length}` },
          { zh: `请输入 ${SHAKE_MIN_BYTES} ~ ${SHAKE_MAX_BYTES} 之间的整数（单位：字节）。`, en: `Enter an integer between ${SHAKE_MIN_BYTES} and ${SHAKE_MAX_BYTES} (unit: bytes).` },
        );
      }
      const xof = algorithm === 'shake128' ? shake128 : shake256;
      return bytesToHex(xof(bytes, { dkLen: length }));
    }
    default:
      throw new ToolError({ zh: `不支持的摘要算法：${algorithm}`, en: `Unsupported digest algorithm: ${algorithm}` });
  }
}

export function hashInputToAlgorithms(
  input: string | Uint8Array,
  algorithms: HashAlgorithm[],
  options: HashOptions = {},
): { id: HashAlgorithm; label: string; value: string }[] {
  const infoById = new Map(HASH_ALGORITHMS.map((info) => [info.id, info]));
  return algorithms.map((id) => {
    const info = infoById.get(id);
    if (!info) throw new ToolError({ zh: `不支持的摘要算法：${id}`, en: `Unsupported digest algorithm: ${id}` });
    return { id, label: info.label, value: hashInput(input, id, options) };
  });
}

/** Gravatar/邮箱场景：trim + 小写后计算 MD5。 */
export function emailMd5(email: string): string {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) throw new ToolError({ zh: '请输入邮箱地址', en: 'Enter an email address' });
  return bytesToHex(md5(utf8ToBytes(trimmed)));
}

export interface HashRow {
  label: string;
  value: string;
}

export function uppercaseRows<T extends { value: string }>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row, value: row.value.toUpperCase() }));
}
