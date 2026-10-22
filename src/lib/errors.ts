import { tl, type Localized } from '@/i18n/locale';

export interface ErrorLocation {
  line: number;
  column: number;
}

/**
 * 工具内可预期的错误。message/hint 支持中英双语值对象；
 * Error.message 始终保持中文解析结果，兼容既有断言与 worker 透传。
 */
export class ToolError extends Error {
  readonly localized: Localized;
  hint?: Localized;
  location?: ErrorLocation;

  constructor(message: Localized, hint?: Localized, location?: ErrorLocation) {
    super(tl(message, 'zh'));
    this.name = 'ToolError';
    this.localized = message;
    this.hint = hint;
    this.location = location;
  }
}

export function toToolError(error: unknown): ToolError {
  if (error instanceof ToolError) return error;
  if (error instanceof Error) return new ToolError(error.message);
  return new ToolError({
    zh: '处理失败，请检查输入内容后重试。',
    en: 'Processing failed. Check your input and try again.',
  });
}

export function errorMessage(error: unknown): string {
  return toToolError(error).message;
}

/**
 * 取包装错误时附带的补充说明。直接写 `error instanceof Error ? error.message : …`
 * 会把内层 ToolError 的 hint 丢掉（只剩标题），这里优先沿用内层 hint，
 * 其次是原始 message，最后才回落到本站点的提示。
 */
export function errorHint(error: unknown, fallback: Localized): Localized {
  const toolError = toToolError(error);
  if (toolError.hint) return toolError.hint;
  if (toolError.localized) return toolError.localized;
  return fallback;
}
