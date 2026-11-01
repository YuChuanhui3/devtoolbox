import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HTML_CLEAN_OPTIONS,
  escapeHtmlEntities,
  htmlToText,
  unescapeHtmlEntities,
} from './htmlkit';

describe('escapeHtmlEntities', () => {
  it('escapes the five required characters', () => {
    expect(escapeHtmlEntities(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('encodes non-ASCII only when asked', () => {
    expect(escapeHtmlEntities('世界')).toBe('世界');
    expect(escapeHtmlEntities('世界', true)).toBe('&#19990;&#30028;');
  });

  it('round-trips through unescape', () => {
    const source = '<b>Tom & "Jerry" 世界</b>';
    expect(unescapeHtmlEntities(escapeHtmlEntities(source))).toBe(source);
  });

  it('does not execute scripts while unescaping', () => {
    const output = unescapeHtmlEntities('&lt;img src=x onerror=alert(1)&gt;');
    expect(output).toContain('onerror');
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('htmlToText', () => {
  const html = `<h1>标题</h1><script>alert(1)</script><style>p{color:red}</style>
    <p>第一段&nbsp;&nbsp;文本</p><p>第二段</p><a href="https://example.com">链接</a>`;

  it('drops script and style content', () => {
    const text = htmlToText(html, DEFAULT_HTML_CLEAN_OPTIONS);
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color:red');
    expect(text).toContain('标题');
  });

  it('appends link targets when asked', () => {
    const text = htmlToText(html, { ...DEFAULT_HTML_CLEAN_OPTIONS, keepLinks: true });
    expect(text).toContain('链接 (https://example.com)');
  });

  it('keeps block separation only when line breaks are kept', () => {
    const kept = htmlToText(html, { ...DEFAULT_HTML_CLEAN_OPTIONS, keepLineBreaks: true });
    const flat = htmlToText(html, { ...DEFAULT_HTML_CLEAN_OPTIONS, keepLineBreaks: false });
    expect(kept.split('\n').length).toBeGreaterThan(1);
    expect(flat).not.toContain('\n');
  });

  it('turns non-breaking spaces into ordinary ones', () => {
    expect(htmlToText('<p>a\u00a0b</p>', DEFAULT_HTML_CLEAN_OPTIONS)).toBe('a b');
  });

  it('returns empty text for blank input', () => {
    expect(htmlToText('   ', DEFAULT_HTML_CLEAN_OPTIONS)).toBe('');
  });
});
