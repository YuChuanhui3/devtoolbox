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
