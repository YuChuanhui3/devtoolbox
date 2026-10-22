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
