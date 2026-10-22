import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: false,
  async: false,
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
