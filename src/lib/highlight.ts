import hljs from 'highlight.js/lib/common';
import { escapeHtml } from './text';

/** 返回转义后的高亮 HTML，可安全用于 dangerouslySetInnerHTML。 */
export function highlightCode(code: string, language: string): string {
  if (!code) return '';
  try {
    if (!hljs.getLanguage(language)) return escapeHtml(code);
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

/** 未声明语言时的自动识别；识别不出或失败都退回转义文本。 */
export function highlightCodeAuto(code: string): string {
  if (!code) return '';
  try {
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}

/** 当前分包里真正注册了的语言（highlight.js/lib/common，约 35 种）。 */
export function supportedLanguages(): string[] {
  return hljs.listLanguages();
}

/** 把 js / py / html 这类别名归一到注册名，让下拉框与语言列表对得上；不认识则返回空串。 */
export function canonicalLanguage(language: string): string {
  if (!language) return '';
  const definition = hljs.getLanguage(language);
  if (!definition) return '';
  const registered = supportedLanguages().find((name) => hljs.getLanguage(name) === definition);
  return registered ?? language;
}
