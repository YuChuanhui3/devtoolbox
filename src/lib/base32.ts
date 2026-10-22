import { ToolError } from './errors';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PAD = '=';
const REVERSE = new Map(ALPHABET.split('').map((char, index) => [char, index]));

/** RFC 4648 Base32 编码（带 = 填充）。 */
export function bytesToBase32(bytes: Uint8Array): string {
  let result = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) {
    result += ALPHABET[(buffer << (5 - bits)) & 31];
  }
  const remainder = result.length % 8;
  if (remainder) result += PAD.repeat(8 - remainder);
  return result;
}

/** RFC 4648 Base32 解码，大小写不敏感、可省略填充与分隔空格。 */
export function base32ToBytes(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!cleaned) return new Uint8Array(0);
  let buffer = 0;
  let bits = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const value = REVERSE.get(char);
    if (value === undefined) {
      throw new ToolError(
        { zh: `Base32 字符不合法：${char}`, en: `Base32 contains an invalid character: ${char}` },
        { zh: '合法字符为 A-Z、2-7（不区分大小写），可带 = 填充。', en: 'Valid characters are A-Z, 2-7 (case-insensitive), optionally with = padding.' },
      );
    }
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 255);
    }
  }
  if (bits >= 5 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new ToolError(
      { zh: 'Base32 尾部存在非零填充位', en: 'Base32 has non-zero padding bits at the end' },
      { zh: '请确认密文完整且未被截断。', en: 'Make sure the ciphertext is complete and not truncated.' },
    );
  }
  return new Uint8Array(output);
}

export function textToBase32(text: string): string {
  return bytesToBase32(new TextEncoder().encode(text));
}

export function base32ToText(input: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(base32ToBytes(input));
}
