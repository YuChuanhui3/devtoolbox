import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { ToolError } from './errors';
import { offsetToLineColumn } from './text';
import type { Localized } from '@/i18n/locale';

interface ParseErrorDescription {
  message: string;
  hint?: string;
}

function describeParseError(code: string): ParseErrorDescription {
  switch (code) {
    case 'InvalidSymbol':
      return { message: '存在非法字符', hint: 'JSON 仅支持双引号字符串，请检查是否混入了单引号或中文标点。' };
    case 'InvalidNumberFormat':
      return { message: '数字格式不正确', hint: '请检查是否出现 01 这类前导零，或非法的指数写法。' };
    case 'PropertyNameExpected':
      return { message: '缺少属性名', hint: '对象属性名必须使用双引号，例如 "name": "qwen"。' };
    case 'ValueExpected':
      return { message: '缺少合法的值', hint: '请检查冒号后是否遗漏了字符串、数字、对象或数组。' };
    case 'ColonExpected':
      return { message: '缺少冒号', hint: '属性名与值之间需要使用英文冒号 : 分隔。' };
    case 'CommaExpected':
      return { message: '缺少逗号', hint: '相邻字段或数组元素之间需要使用英文逗号 , 分隔。' };
    case 'CloseBraceExpected':
      return { message: '对象未闭合', hint: '请检查是否缺少右花括号 }。' };
    case 'CloseBracketExpected':
      return { message: '数组未闭合', hint: '请检查是否缺少右方括号 ]。' };
    case 'EndOfFileExpected':
      return { message: 'JSON 结束后存在多余内容', hint: '一个 JSON 文档只能包含一个顶层值。' };
    case 'InvalidCommentToken':
      return { message: '不支持注释', hint: '标准 JSON 不允许 // 或 /* */ 注释。' };
    case 'UnexpectedEndOfComment':
      return { message: '注释未闭合', hint: '请补全注释结束标记。' };
    case 'UnexpectedEndOfString':
      return { message: '字符串未闭合', hint: '请检查是否缺少字符串结尾的双引号。' };
    case 'UnexpectedEndOfNumber':
      return { message: '数字未写完', hint: '请检查数字末尾是否有缺失的内容。' };
    case 'InvalidUnicode':
      return { message: 'Unicode 转义格式不正确', hint: '\\u 后必须跟随 4 位十六进制字符。' };
    case 'InvalidEscapeCharacter':
      return { message: '字符串转义字符不合法', hint: '可用的转义包括 \\" \\\\ \\/ \\b \\f \\n \\r \\t \\uXXXX。' };
    case 'InvalidCharacter':
      return { message: '包含非法字符', hint: '请检查是否混入了不可见字符或全角符号。' };
    default:
      return { message: 'JSON 格式不正确' };
  }
}

export function parseJson(text: string): unknown {
  if (!text.trim()) {
    throw new ToolError(
      { zh: '输入内容为空', en: 'Input is empty' },
      { zh: '请粘贴 JSON 内容后再试。', en: 'Paste JSON content and try again.' },
    );
  }

  const errors: ParseError[] = [];
  const value = parse(text, errors, {
    allowTrailingComma: false,
    disallowComments: true,
    allowEmptyContent: false,
  });

  if (errors.length > 0) {
    const first = errors[0];
    const { line, column } = offsetToLineColumn(text, first.offset);
    const reason = describeParseError(printParseErrorCode(first.error));
    throw new ToolError(
      {
        zh: `JSON 解析失败：第 ${line} 行第 ${column} 列，${reason.message}。`,
        en: `JSON parsing failed: line ${line}, column ${column}, ${reason.message}.`,
      },
      reason.hint,
      { line, column },
    );
  }

  return value;
}

export function isJsonValid(text: string): boolean {
  try {
    parseJson(text);
    return true;
  } catch {
    return false;
  }
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}

const MAX_UNWRAP_DEPTH = 8;

/** 解析结果是字符串且内容本身还是 JSON（可能被转义多层）时，逐层还原。 */
export function unwrapJsonStrings(value: unknown): { value: unknown; depth: number } {
  let current = value;
  let depth = 0;
  while (typeof current === 'string' && depth < MAX_UNWRAP_DEPTH) {
    const candidate = current.trim();
    if (!/^[{["]/.test(candidate)) break;
    try {
      current = JSON.parse(candidate);
    } catch {
      break;
    }
    depth += 1;
  }
  return { value: current, depth };
}

export function formatJson(text: string, indent = 2, sortKeys = false): string {
  const { value } = unwrapJsonStrings(parseJson(text));
  const normalized = sortKeys ? sortKeysDeep(value) : value;
  return JSON.stringify(normalized, null, indent);
}

export function minifyJson(text: string): string {
  const { value } = unwrapJsonStrings(parseJson(text));
  return JSON.stringify(value);
}

export interface JsonEscapeOptions {
  /** 是否保留 JSON 字符串字面量的外层双引号，默认保留。 */
  outerQuotes?: boolean;
}

export function escapeJsonString(text: string, options: JsonEscapeOptions = {}): string {
  const { outerQuotes = true } = options;
  const literal = JSON.stringify(text);
  return outerQuotes ? literal : literal.slice(1, -1);
}

export function unescapeJsonString(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new ToolError(
      { zh: '输入内容为空', en: 'Input is empty' },
      { zh: '请粘贴需要去转义的 JSON 字符串。', en: 'Paste the JSON string to unescape.' },
    );
  }

  const quoted = trimmed.startsWith('"') && trimmed.endsWith('"');
  const candidate = quoted ? trimmed : `"${trimmed}"`;

  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch {
    throw new ToolError(
      { zh: 'JSON 去转义失败', en: 'JSON unescape failed' },
      quoted
        ? {
            zh: '请检查字符串中的转义序列是否完整，例如 \\n、\\t、\\"、\\\\、\\uXXXX。',
            en: 'Check that escape sequences in the string are complete, e.g. \\n, \\t, \\", \\\\, \\uXXXX.',
          }
        : {
            zh: '输入中包含未转义的双引号或换行，请先转义，或为内容补上外层引号后重试。',
            en: 'The input contains unescaped double quotes or newlines. Escape them, or wrap the content in outer quotes and try again.',
          },
    );
  }

  if (typeof value !== 'string') {
    throw new ToolError(
      { zh: '输入内容不是 JSON 字符串', en: 'Input is not a JSON string' },
      {
        zh: '去转义仅支持形如 "Hello\\nWorld" 的字符串字面量。',
        en: 'Unescape only supports string literals like "Hello\\nWorld".',
      },
    );
  }

  return value;
}

export function jsonTypeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'object') return `object(${Object.keys(value as object).length})`;
  if (typeof value === 'string') return `string(${value.length})`;
  return typeof value;
}

/**
 * 将 JSON 文本转换为带语法高亮的 HTML。
 * 输入会先做 HTML 转义，输出可安全用于 dangerouslySetInnerHTML。
 */
export function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let className = 'json-number';
      if (match.startsWith('"')) {
        className = match.trimEnd().endsWith(':') ? 'json-key' : 'json-string';
      } else if (match === 'true' || match === 'false') {
        className = 'json-boolean';
      } else if (match === 'null') {
        className = 'json-null';
      }
      return `<span class="${className}">${match}</span>`;
    },
  );
}

export interface JsonValidation {
  valid: boolean;
  message: Localized;
  hint?: Localized;
}

export function validateJson(text: string): JsonValidation {
  try {
    parseJson(text);
    return { valid: true, message: { zh: 'JSON 格式合法', en: 'Valid JSON' } };
  } catch (error) {
    const toolError = error instanceof ToolError ? error : null;
    return {
      valid: false,
      message: toolError?.localized ?? { zh: 'JSON 格式不正确', en: 'Invalid JSON format' },
      hint: toolError?.hint,
    };
  }
}
