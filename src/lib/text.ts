export interface TextStats {
  chars: number;
  charsNoSpace: number;
  chinese: number;
  letters: number;
  digits: number;
  words: number;
  lines: number;
  paragraphs: number;
  bytes: number;
}

const PARAGRAPH_SEPARATOR_PATTERN = /\n\s*\n/;

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function splitLines(text: string): string[] {
  if (!text) return [];
  return normalizeNewlines(text).split('\n');
}

export function countLines(text: string): number {
  if (!text) return 0;
  return measureLineCount(text);
}

/**
 * 与 `normalizeNewlines(text).split('\n').length` 等价，但不复制字符串、不分配数组。
 * 行号槽在每次渲染都需要行数，走 split 等于每帧重建一个 N 元素数组。
 */
export function measureLineCount(text: string): number {
  if (!text) return 0;
  let lines = 1;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x0a) lines += 1;
    else if (code === 0x0d && text.charCodeAt(index + 1) !== 0x0a) lines += 1;
  }
  return lines;
}

/** 与正则 `\s` 完全一致（WhiteSpace + LineTerminator），但避免逐字符调用正则。 */
function isWhitespaceCode(code: number): boolean {
  return (
    code === 0x20 ||
    (code >= 0x09 && code <= 0x0d) ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

function isWordCharCode(code: number): boolean {
  return (
    (code >= 0x61 && code <= 0x7a) || // a-z
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x30 && code <= 0x39) || // 0-9
    code === 0x5f // _
  );
}

/** WORD_PATTERN 中 `(?:['’-][A-Za-z0-9_]+)*` 的连接符。 */
function isWordJoinerCode(code: number): boolean {
  return code === 0x27 || code === 0x2019 || code === 0x2d;
}

const EMPTY_STATS: TextStats = {
  chars: 0,
  charsNoSpace: 0,
  chinese: 0,
  letters: 0,
  digits: 0,
  words: 0,
  lines: 0,
  paragraphs: 0,
  bytes: 0,
};

/**
 * 单遍扫描统计。刻意保持与旧实现（多次 `String.match` + `Array.from` + `TextEncoder`）
 * 逐字段一致，因为这里输入往往是用户正在输入的整个文本框，分配量直接决定输入延迟。
 */
export function countTextStats(text: string): TextStats {
  if (!text) return { ...EMPTY_STATS };

  let chars = 0;
  let charsNoSpace = 0;
  let chinese = 0;
  let letters = 0;
  let digits = 0;
  let words = 0;
  let newlines = 0;
  let bytes = 0;

  let inWord = false;
  let pendingJoiner = false;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);

    if (pendingJoiner && !isWordCharCode(code)) {
      // 连接符后面没有单词字符 → 上一次匹配其实到此为止，当前字符按词外重新判定。
      inWord = false;
      pendingJoiner = false;
    }

    if (isWordCharCode(code)) {
      if (!inWord) {
        words += 1;
        inWord = true;
      }
      pendingJoiner = false;
      if ((code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a)) letters += 1;
      else if (code >= 0x30 && code <= 0x39) digits += 1;
    } else if (inWord && isWordJoinerCode(code)) {
      pendingJoiner = true;
    } else {
      inWord = false;
    }

    // 换行计数：\r\n 归一化为一个换行（交给 \n 计），孤立 \r 计一个。
    if (code === 0x0a) {
      newlines += 1;
    } else if (code === 0x0d && text[index + 1] !== '\n') {
      newlines += 1;
    }

    if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) {
      chinese += 1;
    }

    if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const low = text.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        // 代理对：一个码点、4 字节 UTF-8，且必然不是空白字符。
        chars += 1;
        charsNoSpace += 1;
        bytes += 4;
        index += 1;
        continue;
      }
    }

    chars += 1;
    if (!isWhitespaceCode(code)) charsNoSpace += 1;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
  }

  const blocks = normalizeNewlines(text).split(PARAGRAPH_SEPARATOR_PATTERN);
  let paragraphs = 0;
  for (const block of blocks) {
    for (let i = 0; i < block.length; i += 1) {
      if (!isWhitespaceCode(block.charCodeAt(i))) {
        paragraphs += 1;
        break;
      }
    }
  }

  return {
    chars,
    charsNoSpace,
    chinese,
    letters,
    digits,
    words: words + chinese,
    lines: newlines + 1,
    paragraphs,
    bytes,
  };
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function unescapeRegExp(text: string): string {
  return text.replace(/\\([.*+?^${}()|[\]\\/])/g, '$1');
}

export function offsetToLineColumn(
  text: string,
  offset: number,
): { line: number; column: number } {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, safeOffset);
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: Array.from(lines[lines.length - 1]).length + 1,
  };
}

export function getLineColumnAt(text: string, offset: number): { line: number; column: number } {
  return offsetToLineColumn(text, offset);
}

export function pluralizeCount(count: number, unit: string): string {
  return `${count} ${unit}`;
}
