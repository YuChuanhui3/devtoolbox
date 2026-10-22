import { ToolError } from './errors';

const MORSE_TABLE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.',
  H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.',
  O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-',
  V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', "'": '.----.',
  '"': '..-..-', '(': '-.--.', ')': '-.--.-', '/': '-..-.', '-': '-....-',
  ';': '-...-', '=': '-...-', ':': '---...', '+': '.-.-.', '&': '.-...',
  _: '..--.-', '$': '...-..-', '@': '.--.-.',
};

const REVERSE_TABLE = new Map<string, string>();
for (const [char, code] of Object.entries(MORSE_TABLE)) {
  REVERSE_TABLE.set(code, char);
}

// 常见中文标点归一化到国际摩斯标点。
const CN_PUNCTUATION: Record<string, string> = {
  '，': ',', '。': '.', '？': '?', '！': '!', '；': ';', '：': ':',
  '（': '(', '）': ')', '“': '"', '”': '"', '‘': "'", '’': "'",
  '、': ',', '—': '-', '…': '.',
};

export function morseEncode(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new ToolError(
    { zh: '请输入需要编码的文本', en: 'Enter the text to encode' },
    { zh: '莫尔斯编码输入不能为空。', en: 'Morse encoding input must not be empty.' },
  );
  const words = trimmed.toUpperCase().split(/\s+/);
  return words
    .map((word) =>
      Array.from(word)
        .map((char) => {
          const normalized = CN_PUNCTUATION[char] ?? char;
          const code = MORSE_TABLE[normalized];
          if (!code) {
            throw new ToolError(
              { zh: `莫尔斯编码不支持字符：${char}`, en: `Morse encoding does not support this character: ${char}` },
              { zh: '支持 A-Z、0-9、空格与常见英文标点（中文标点会自动转换）。汉字等无法编码的字符请先到「UTF-8/URL」等工具处理。', en: 'Supports A-Z, 0-9, spaces, and common English punctuation (Chinese punctuation is converted automatically). For characters that cannot be encoded, such as Chinese characters, preprocess them with a tool like UTF-8/URL first.' },
            );
          }
          return code;
        })
        .join(' '),
    )
    .join(' / ');
}

export function morseDecode(morse: string): string {
  const cleaned = morse.trim();
  if (!cleaned) throw new ToolError(
    { zh: '请输入需要解码的莫尔斯电码', en: 'Enter the Morse code to decode' },
    { zh: '电码由 . - 与空格组成，词间用 / 分隔。', en: 'Code consists of . - and spaces, with words separated by /.' },
  );
  if (/[^\s.\-\/|]/.test(cleaned.replace(/[|]/g, ' / '))) {
    throw new ToolError(
      { zh: '莫尔斯电码包含非法字符', en: 'Morse code contains invalid characters' },
      { zh: '只允许 . - 空格与 /（词分隔符），请检查是否混入了字母或中文符号。', en: 'Only . - spaces and / (word separator) are allowed; check for letters or Chinese symbols mixed in.' },
    );
  }
  const normalized = cleaned.replace(/\|/g, ' / ');
  return normalized
    .split(/\/|\s{2,}/)
    .map((word) =>
      word
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((code) => {
          const char = REVERSE_TABLE.get(code);
          if (!char) {
            throw new ToolError(
              { zh: `无法识别的电码：${code}`, en: `Unrecognized code: ${code}` },
              { zh: '请检查 . 与 - 的组合，以及词内字母间是否为单空格。', en: 'Check the . and - combinations and whether letters within a word are separated by single spaces.' },
            );
          }
          return char;
        })
        .join(''),
    )
    .filter((word) => word !== '')
    .join(' ');
}
