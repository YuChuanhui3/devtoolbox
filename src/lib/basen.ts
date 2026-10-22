import { ToolError } from './errors';

export const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function bytesToBase(bytes: Uint8Array, alphabet: string): string {
  const base = BigInt(alphabet.length);
  let zeroCount = 0;
  while (zeroCount < bytes.length && bytes[zeroCount] === 0) zeroCount += 1;

  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);

  const digits: string[] = [];
  while (value > 0n) {
    digits.unshift(alphabet[Number(value % base)]);
    value /= base;
  }
  return alphabet[0].repeat(zeroCount) + digits.join('');
}

function baseToBytes(text: string, alphabet: string, label: string): Uint8Array {
  if (!text) return new Uint8Array(0);
  const index = new Map(alphabet.split('').map((char, position) => [char, position]));
  const base = BigInt(alphabet.length);

  let zeroCount = 0;
  while (zeroCount < text.length && text[zeroCount] === alphabet[0]) zeroCount += 1;

  let value = 0n;
  for (const char of text) {
    const digit = index.get(char);
    if (digit === undefined) {
      throw new ToolError(
        { zh: `${label} 字符不合法：${char}`, en: `${label} contains an invalid character: ${char}` },
        { zh: `合法字符表：${alphabet}`, en: `Valid alphabet: ${alphabet}` },
      );
    }
    value = value * base + BigInt(digit);
  }

  const littleEndian: number[] = [];
  while (value > 0n) {
    littleEndian.push(Number(value % 256n));
    value /= 256n;
  }
  return new Uint8Array([...Array.from({ length: zeroCount }, () => 0), ...littleEndian.reverse()]);
}

export const base58Encode = (bytes: Uint8Array): string => bytesToBase(bytes, BASE58_ALPHABET);
export const base58Decode = (text: string): Uint8Array => baseToBytes(text, BASE58_ALPHABET, 'Base58');
export const base62Encode = (bytes: Uint8Array): string => bytesToBase(bytes, BASE62_ALPHABET);
export const base62Decode = (text: string): Uint8Array => baseToBytes(text, BASE62_ALPHABET, 'Base62');

const BASE100_UPPER = 'ABCDEFGHIJ';
const BASE100_LOWER = 'abcdefghij';

/** Base100 趣味编码：每个十进制数字映射为一对字母（0 → Aa … 9 → Jj）。 */
export function encodeBase100(digits: string): string {
  const cleaned = digits.trim();
  if (!cleaned) return '';
  if (!/^\d+$/.test(cleaned)) {
    throw new ToolError(
      { zh: 'Base100 仅接受十进制数字串', en: 'Base100 accepts only decimal digit strings' },
      { zh: 'Base100 将每个数字编码为一对字母（如 0→Aa、9→Jj），请先只保留数字。', en: 'Base100 encodes each digit as a pair of letters (e.g. 0→Aa, 9→Jj); keep only digits first.' },
    );
  }
  return Array.from(cleaned, (digit) => {
    const value = Number(digit);
    return BASE100_UPPER[value] + BASE100_LOWER[value];
  }).join('');
}

export function decodeBase100(input: string): string {
  const cleaned = input.replace(/\s+/g, '');
  if (!cleaned) return '';
  if (cleaned.length % 2 !== 0) {
    throw new ToolError(
      { zh: 'Base100 密文长度应为偶数', en: 'Base100 ciphertext length should be even' },
      { zh: '每两个字母对应一个数字（如 Aa → 0）。', en: 'Each pair of letters corresponds to one digit (e.g. Aa → 0).' },
    );
  }
  let result = '';
  for (let i = 0; i < cleaned.length; i += 2) {
    const upper = BASE100_UPPER.indexOf(cleaned[i]);
    const lower = BASE100_LOWER.indexOf(cleaned[i + 1]);
    if (upper === -1 || lower === -1 || upper !== lower) {
      throw new ToolError(
        { zh: `Base100 字符对不合法：${cleaned.slice(i, i + 2)}`, en: `Invalid Base100 character pair: ${cleaned.slice(i, i + 2)}` },
        { zh: '合法字符对为大写 A-J 后紧跟对应的小写 a-j。', en: 'A valid pair is an uppercase A-J followed by the matching lowercase a-j.' },
      );
    }
    result += String(upper);
  }
  return result;
}
