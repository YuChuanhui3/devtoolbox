import { marked, type Token, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import { highlightCode } from './highlight';

marked.setOptions({
  gfm: true,
  breaks: false,
  async: false,
});

/** 语言名来自用户输入，只允许安全字符进 class，其余情况退化为无语言高亮。 */
export function normalizeCodeLanguage(lang: string | undefined): string {
  const first = (lang ?? '').trim().split(/[\s,]+/)[0] ?? '';
  return /^[A-Za-z0-9+#-]{1,40}$/.test(first) ? first : '';
}

// 代码块在渲染阶段就完成高亮，而不是等 DOM 挂载后再补：
// 预览、复制 HTML、导出 .html 三条路径共用同一份结果，切换编辑/预览模式也不会漏掉高亮。
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = normalizeCodeLanguage(lang);
      const className = language ? `hljs language-${language}` : 'hljs';
      return `<pre><code class="${className}">${highlightCode(text, language)}</code></pre>\n`;
    },
  },
});

let hookRegistered = false;

function ensureSanitizeHooks(): void {
  if (hookRegistered) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element)) return;
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy');
      node.setAttribute('referrerpolicy', 'no-referrer');
    }
  });
  hookRegistered = true;
}

const SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base'],
  FORBID_ATTR: ['style', 'srcdoc', 'formaction'],
  ALLOW_DATA_ATTR: false,
};

/**
 * Markdown -> 安全 HTML。
 * 先由 marked 解析，再由 DOMPurify 过滤脚本与事件属性，预览区不会执行任何脚本。
 */
export function renderMarkdown(markdown: string): string {
  ensureSanitizeHooks();

  const raw = marked.parse(markdown, { async: false, gfm: true, breaks: false }) as string;
  return DOMPurify.sanitize(raw, SANITIZE_OPTIONS);
}

export type MarkdownSegment =
  | { kind: 'html'; html: string }
  | { kind: 'code'; code: string; language: string };

/**
 * 预览分段渲染：顶层代码块单独拆出来交给组件渲染（复制按钮 + 语言下拉），
 * 其余标记仍走同一条 marked + DOMPurify 管线，安全性不变。
 */
export function renderMarkdownSegments(markdown: string): MarkdownSegment[] {
  ensureSanitizeHooks();

  const segments: MarkdownSegment[] = [];
  let buffer: Token[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const html = DOMPurify.sanitize(marked.parser(buffer), SANITIZE_OPTIONS);
    if (html.trim()) segments.push({ kind: 'html', html });
    buffer = [];
  };

  for (const token of marked.lexer(markdown)) {
    if (token.type === 'code') {
      flush();
      const block = token as Tokens.Code;
      segments.push({ kind: 'code', code: block.text, language: normalizeCodeLanguage(block.lang) });
      continue;
    }
    buffer.push(token);
  }
  flush();

  return segments;
}

export function renderMarkdownDocument(markdown: string, title = 'Markdown 导出'): string {
  ensureSanitizeHooks();
  const raw = marked.parse(markdown, { async: false, gfm: true, breaks: false }) as string;
  const body = DOMPurify.sanitize(raw, SANITIZE_OPTIONS);

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeTitle(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 820px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; line-height: 1.75; color: #1f2328; background: #fff; }
  h1, h2 { border-bottom: 1px solid #e5e7eb; padding-bottom: .3em; }
  pre { background: #f6f8fa; border-radius: 10px; padding: 16px; overflow: auto; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .88em; background: #f2f4f7; padding: .15em .4em; border-radius: 6px; }
  pre code { background: transparent; padding: 0; }
  .hljs-comment, .hljs-quote { color: #6a737d; }
  .hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-type { color: #d73a49; }
  .hljs-string, .hljs-regexp, .hljs-addition, .hljs-attribute { color: #032f62; }
  .hljs-number, .hljs-symbol, .hljs-bullet { color: #005cc5; }
  .hljs-title, .hljs-section { color: #6f42c1; }
  .hljs-built_in, .hljs-attr { color: #e36209; }
  .hljs-meta { color: #005cc5; }
  .hljs-deletion { color: #b31d28; background: #ffeef0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d0d7de; padding: 8px 12px; text-align: left; }
  th { background: #f6f8fa; }
  blockquote { margin: 1em 0; padding: .2em 1em; border-left: 3px solid #2196f3; color: #57606a; background: #f0f7ff; }
  img { max-width: 100%; border-radius: 10px; }
  a { color: #0969da; }
  @media (prefers-color-scheme: dark) {
    body { color: #e6edf3; background: #0d1117; }
    h1, h2 { border-color: #30363d; }
    pre { background: #161b22; }
    code { background: #21262d; }
    th, td { border-color: #30363d; }
    th { background: #161b22; }
    blockquote { background: #161b22; color: #8b949e; border-color: #4da6ff; }
    a { color: #58a6ff; }
    .hljs-comment, .hljs-quote { color: #8b949e; }
    .hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-type { color: #ff7b72; }
    .hljs-string, .hljs-regexp, .hljs-addition, .hljs-attribute { color: #a5d6ff; }
    .hljs-number, .hljs-symbol, .hljs-bullet { color: #79c0ff; }
    .hljs-title, .hljs-section { color: #d2a8ff; }
    .hljs-built_in, .hljs-attr { color: #ffa657; }
    .hljs-meta { color: #79c0ff; }
    .hljs-deletion { color: #ffdcd7; background: #67060c; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function escapeTitle(title: string): string {
  return title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
