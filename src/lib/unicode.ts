export interface EscapeUnicodeOptions {
  escapeAll?: boolean;
  uppercase?: boolean;
}

export interface DecodeUnicodeOptions {
  /** 仅还原非 ASCII 码点，避免破坏 JSON 语法字符。 */
  nonAsciiOnly?: boolean;
  /** 仅处理 JSON 字符串支持的 \\uXXXX，忽略 \\u{...} 与 \\xXX。 */
  jsonOnly?: boolean;
}

function formatCodePoint(codePoint: number, uppercase: boolean): string {
  if (codePoint > 0xffff) {
    const adjusted = codePoint - 0x10000;
    const high = 0xd800 + (adjusted >> 10);
    const low = 0xdc00 + (adjusted & 0x3ff);
    const highHex = high.toString(16).padStart(4, '0');
    const lowHex = low.toString(16).padStart(4, '0');
    return `\\u${uppercase ? highHex.toUpperCase() : highHex}\\u${uppercase ? lowHex.toUpperCase() : lowHex}`;
  }
  const hex = codePoint.toString(16).padStart(4, '0');
  return `\\u${uppercase ? hex.toUpperCase() : hex}`;
}

export function escapeUnicode(text: string, options: EscapeUnicodeOptions = {}): string {
  const { escapeAll = true, uppercase = false } = options;

  return Array.from(text)
    .map((char) => {
      const codePoint = char.codePointAt(0);
      if (codePoint === undefined) return char;
      if (!escapeAll && codePoint < 0x80) return char;
      return formatCodePoint(codePoint, uppercase);
    })
    .join('');
}

const HEX_PATTERN = /^[0-9a-fA-F]+$/;

function readEscape(text: string, index: number, jsonOnly: boolean): { codePoint: number; length: number } | null {
  if (text[index] !== '\\' || text[index + 1] !== 'u') {
    if (!jsonOnly && text[index] === '\\' && text[index + 1] === 'x') {
      const hex = text.slice(index + 2, index + 4);
      if (HEX_PATTERN.test(hex) && hex.length === 2) {
        return { codePoint: Number.parseInt(hex, 16), length: 4 };
      }
    }
    return null;
  }

  if (!jsonOnly && text[index + 2] === '{') {
    const end = text.indexOf('}', index + 3);
    if (end < 0) return null;
    const hex = text.slice(index + 3, end);
    if (!HEX_PATTERN.test(hex) || hex.length > 6) return null;
    const codePoint = Number.parseInt(hex, 16);
    if (codePoint > 0x10ffff) return null;
    return { codePoint, length: end - index + 1 };
  }

  const hex = text.slice(index + 2, index + 6);
  if (!HEX_PATTERN.test(hex) || hex.length !== 4) return null;
  return { codePoint: Number.parseInt(hex, 16), length: 6 };
}

export function decodeUnicode(text: string, options: DecodeUnicodeOptions = {}): string {
  const { nonAsciiOnly = false, jsonOnly = false } = options;
  let result = '';
  let index = 0;

  while (index < text.length) {
    if (text[index] !== '\\') {
      result += text[index];
      index += 1;
      continue;
    }

    if (text[index + 1] === '\\') {
      result += '\\\\';
      index += 2;
      continue;
    }

    const escape = readEscape(text, index, jsonOnly);
    if (escape && (!nonAsciiOnly || escape.codePoint >= 0x80)) {
      try {
        result += String.fromCodePoint(escape.codePoint);
        index += escape.length;
        continue;
      } catch {
        /* 非法码点按原样保留 */
      }
    }

    result += '\\';
    index += 1;
  }

  return result;
}
