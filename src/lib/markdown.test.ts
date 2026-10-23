import { describe, expect, test } from 'vitest';
import { renderMarkdown, renderMarkdownDocument } from './markdown';

describe('markdown rendering', () => {
  test('renders basic Markdown syntax', () => {
    const html = renderMarkdown('# 标题\n\n**加粗** 和 `代码`\n\n- 项目');
    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<strong>加粗</strong>');
    expect(html).toContain('<code>代码</code>');
    expect(html).toContain('<li>项目</li>');
  });

  test('removes scripts, event handlers and javascript URLs', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n\n[bad](javascript:alert(3))',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('src="x"');
  });

  test('adds safe link and image attributes', () => {
    const html = renderMarkdown('[示例](https://example.com)\n\n![图](https://example.com/a.png)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerpolicy="no-referrer"');
  });

  test('renders tables and task lists', () => {
    const html = renderMarkdown(
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] 完成\n- [ ] 未完成',
    );
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('type="checkbox"');
  });

  test('renderMarkdownDocument wraps content in a standalone HTML document', () => {
    const html = renderMarkdownDocument('# 标题\n\n内容', '测试 <标题>');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>测试 &lt;标题&gt;</title>');
    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<style>');
  });

  test('highlights fenced code blocks and keeps the token classes through sanitizing', () => {
    const html = renderMarkdown('```js\nconst answer = 42;\n```');
    expect(html).toContain('<code class="hljs language-js">');
    expect(html).toContain('<span class="hljs-keyword">const</span>');
    expect(html).toContain('<span class="hljs-number">42</span>');
  });

  test('escapes unknown languages instead of highlighting them', () => {
    const html = renderMarkdown('```not-a-language\n<b>&amp;</b>\n```');
    expect(html).toContain('<code class="hljs language-not-a-language">');
    expect(html).toContain('&lt;b&gt;&amp;amp;&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  });

  test('drops unsafe language info strings from the class attribute', () => {
    const html = renderMarkdown('```js"onclick="alert(1)\nx = 1\n```');
    expect(html).toContain('<code class="hljs">');
    expect(html).not.toContain('onclick');
  });

  test('renderMarkdownDocument embeds highlight token colors', () => {
    const html = renderMarkdownDocument('```py\ndef f():\n    pass\n```');
    expect(html).toContain('class="hljs language-py"');
    expect(html).toContain('.hljs-keyword');
  });

  test('handles empty markdown', () => {
    expect(renderMarkdown('')).toBe('');
  });
});
