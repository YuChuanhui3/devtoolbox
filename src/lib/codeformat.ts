import {
  formatWebCode,
  minifyWebCode,
  WEB_EXTENSION,
  WEB_HIGHLIGHT_LANGUAGE,
  WEB_LANGUAGE_LABEL,
  type WebLanguage,
} from './webformat';
import {
  formatPretty,
  PRETTY_EXTENSION,
  PRETTY_HIGHLIGHT_LANGUAGE,
  PRETTY_LANGUAGE_LABEL,
  type PrettyLanguage,
} from './prettyformat';

/**
 * 代码格式化的统一入口：HTML / CSS / JS 走 js-beautify + Terser（能压缩、报错带行列），
 * TypeScript / JSON / YAML / Markdown 走按需加载的 Prettier 插件。
 */
export type FormatLanguage = WebLanguage | PrettyLanguage;

export const FORMAT_LANGUAGES: FormatLanguage[] = ['html', 'css', 'js', 'ts', 'json', 'yaml', 'markdown'];

export const FORMAT_LANGUAGE_LABEL: Record<FormatLanguage, string> = {
  ...WEB_LANGUAGE_LABEL,
  ...PRETTY_LANGUAGE_LABEL,
};

export const FORMAT_HIGHLIGHT_LANGUAGE: Record<FormatLanguage, string> = {
  ...WEB_HIGHLIGHT_LANGUAGE,
  ...PRETTY_HIGHLIGHT_LANGUAGE,
};

export const FORMAT_EXTENSION: Record<FormatLanguage, string> = {
  ...WEB_EXTENSION,
  ...PRETTY_EXTENSION,
};

/** Prettier 没有对应的压缩器，这些语言只提供格式化。 */
export const MINIFIABLE_LANGUAGES: FormatLanguage[] = ['html', 'css', 'js'];

export function canMinify(language: FormatLanguage): boolean {
  return MINIFIABLE_LANGUAGES.includes(language);
}

export function formatCode(language: FormatLanguage, source: string, indent: number): Promise<string> {
  return language in WEB_LANGUAGE_LABEL
    ? formatWebCode(language as WebLanguage, source, indent)
    : formatPretty(language as PrettyLanguage, source, indent);
}

export function minifyCode(language: FormatLanguage, source: string): Promise<string> {
  return minifyWebCode(language as WebLanguage, source);
}
