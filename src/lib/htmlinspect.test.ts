import { describe, expect, test } from 'vitest';
import { extractLinks, extractSeo } from './htmlinspect';

const HTML = `<!DOCTYPE html><html lang="zh-CN"><head>
<title>Hello 世界</title>
<meta charset="utf-8">
<meta name="description" content="site desc">
<meta name="keywords" content="a,b">
<meta name="robots" content="noindex">
<meta property="og:title" content="OG Title">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="https://ex.cn/">
<meta name="viewport" content="width=device-width">
</head><body>
<a href="/docs/1">docs</a>
<a href="https://ex.cn/about">about</a>
<a href="https://other.org/x?b=1#c">ext</a>
<a href="https://other.org/x">dup ext</a>
<a href="mailto:a@b.c">mail</a>
<a href="javascript:void(0)">js</a>
<a href="#frag">frag</a>
<a href="/docs/1">dup internal</a>
<h1>Main</h1><h1>Two</h1><h2>sub</h2>
<img src="/a.png" alt="a"><img src="/b.png">
</body></html>`;

describe('extractLinks', () => {
  test('classifies internal and external, dedupes, skips non-http', () => {
    const { internal, external, skipped } = extractLinks(HTML, 'https://ex.cn/blog');
    expect(internal.map((l) => l.absolute)).toEqual([
      'https://ex.cn/docs/1',
      'https://ex.cn/about',
    ]);
    expect(external.map((l) => l.absolute)).toEqual([
      'https://other.org/x?b=1',
      'https://other.org/x',
    ]);
    expect(skipped).toBe(3);
    expect(internal[0].text).toBe('docs');
  });

  test('rejects invalid base', () => {
    expect(() => extractLinks(HTML, 'not a url')).toThrow('基准地址不合法');
  });
});

describe('extractSeo', () => {
  test('reads common seo signals', () => {
    const seo = extractSeo(HTML, 'https://ex.cn/');
    expect(seo.title).toBe('Hello 世界');
    expect(seo.titleLength).toBe(8);
    expect(seo.description).toBe('site desc');
    expect(seo.keywords).toBe('a,b');
    expect(seo.canonical).toBe('https://ex.cn/');
    expect(seo.lang).toBe('zh-CN');
    expect(seo.charset).toBe('utf-8');
    expect(seo.robotsMeta).toBe('noindex');
    expect(seo.og).toEqual({ title: 'OG Title' });
    expect(seo.twitter).toEqual({ card: 'summary' });
    expect(seo.h1).toEqual(['Main', 'Two']);
    expect(seo.h2Count).toBe(1);
    expect(seo.imageTotal).toBe(2);
    expect(seo.imagesWithoutAlt).toBe(1);
    expect(seo.linkInternal).toBe(2);
    expect(seo.linkExternal).toBe(2);
  });

  test('tolerates empty html', () => {
    const seo = extractSeo('', 'https://ex.cn/');
    expect(seo.title).toBe('');
    expect(seo.h1).toEqual([]);
  });
});
