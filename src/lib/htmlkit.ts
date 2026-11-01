const ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtmlEntities(input: string, escapeNonAscii = false): string {
  let result = input.replace(/[&<>"']/g, (char) => ENTITY_MAP[char] ?? char);
  if (escapeNonAscii) {
    result = result.replace(/[^\x00-\x7f]/g, (char) => `&#${char.codePointAt(0)};`);
  }
  return result;
}

/** 反转义只借 DOMParser 解析实体，脚本不会执行。 */
export function unescapeHtmlEntities(input: string): string {
  if (!input) return '';
  const doc = new DOMParser().parseFromString(input, 'text/html');
  return doc.documentElement.textContent ?? '';
}

export interface HtmlCleanOptions {
  keepLineBreaks: boolean;
  collapseWhitespace: boolean;
  keepLinks: boolean;
}

export const DEFAULT_HTML_CLEAN_OPTIONS: HtmlCleanOptions = {
  keepLineBreaks: true,
  collapseWhitespace: true,
  keepLinks: false,
};

const DROPPED_SELECTOR = 'script,style,noscript,template,iframe,object,embed,svg,canvas';
const BLOCK_SELECTOR =
  'p,div,li,h1,h2,h3,h4,h5,h6,tr,blockquote,pre,section,article,header,footer';

export function htmlToText(html: string, options: HtmlCleanOptions): string {
  if (!html.trim()) return '';

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(DROPPED_SELECTOR).forEach((element) => element.remove());

  if (options.keepLinks) {
    doc.querySelectorAll('a[href]').forEach((anchor) => {
      const href = anchor.getAttribute('href') ?? '';
      anchor.append(` (${href})`);
    });
  }

  doc.querySelectorAll('br').forEach((element) => element.replaceWith('\n'));
  doc.querySelectorAll(BLOCK_SELECTOR).forEach((element) => element.append('\n'));

  let text = doc.body.textContent ?? '';
  text = text.replace(/\u00a0/g, ' ');

  if (options.collapseWhitespace) {
    text = text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n');
  }

  if (options.keepLineBreaks) {
    text = text.replace(/\n{3,}/g, '\n\n').trim();
  } else {
    text = text.replace(/\s+/g, ' ').trim();
  }

  return text;
}
