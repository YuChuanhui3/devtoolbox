import { ToolError } from './errors';

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }
  return btoa(chunks.join(''));
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function normalizeBase64(input: string): string {
  let value = input.replace(/\s+/g, '');
  if (!value) {
    throw new ToolError(
      { zh: '输入内容为空', en: 'Input is empty' },
      { zh: '请粘贴需要解码的 Base64 文本。', en: 'Paste the Base64 text to decode.' },
    );
  }

  value = value.replace(/-/g, '+').replace(/_/g, '/');

  if (!BASE64_PATTERN.test(value)) {
    throw new ToolError(
      { zh: 'Base64 格式不正确', en: 'Base64 format is invalid' },
      { zh: '请检查是否包含空格、换行或非 Base64 字符（仅允许 A-Z、a-z、0-9、+、/、=）。', en: 'Check for spaces, line breaks, or non-Base64 characters (only A-Z, a-z, 0-9, +, /, = are allowed).' },
    );
  }

  const remainder = value.length % 4;
  if (remainder === 1) {
    throw new ToolError(
      { zh: 'Base64 长度不正确', en: 'Base64 length is invalid' },
      { zh: 'Base64 文本长度应为 4 的倍数，可能缺少字符。', en: 'Base64 text length should be a multiple of 4; characters may be missing.' },
    );
  }
  if (remainder > 0) {
    value += '='.repeat(4 - remainder);
  }

  return value;
}

export function textToBase64(text: string, urlSafe = false, stripPadding = false): string {
  const bytes = new TextEncoder().encode(text);
  let result = bytesToBase64(bytes);
  if (urlSafe) {
    result = result.replace(/\+/g, '-').replace(/\//g, '_');
    if (stripPadding) result = result.replace(/=+$/, '');
  }
  return result;
}

export function base64ToText(input: string): string {
  const normalized = normalizeBase64(input);
  try {
    const bytes = base64ToBytes(normalized);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError(
      { zh: 'Base64 解码失败', en: 'Base64 decoding failed' },
      { zh: '解码结果不是合法的 UTF-8 文本，可能该内容为二进制文件（如图片），请使用文件解码场景。', en: 'The decoded result is not valid UTF-8 text; the content may be a binary file (such as an image) — use the file decoding tool.' },
    );
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(buffer));
}

export function base64ToArrayBuffer(input: string): ArrayBuffer {
  const bytes = base64ToBytes(normalizeBase64(input));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function isLikelyBase64(input: string): boolean {
  try {
    normalizeBase64(input);
    return true;
  } catch {
    return false;
  }
}
