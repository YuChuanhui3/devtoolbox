import { ToolError } from './errors';

export interface LinkInfo {
  href: string;
  absolute: string;
  text: string;
  domain: string;
  internal: boolean;
}

function doc(html: string): Document {
  if (typeof DOMParser === 'undefined')
    throw new ToolError({
      zh: '当前环境不支持 HTML 解析',
      en: 'This environment does not support HTML parsing',
    });
  return new DOMParser().parseFromString(html, 'text/html');
}

export function extractLinks(html: string, baseUrl: string): { internal: LinkInfo[]; external: LinkInfo[]; skipped: number } {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new ToolError({
      zh: `基准地址不合法：${baseUrl}`,
      en: `Invalid base URL: ${baseUrl}`,
    });
  }
  const internal: LinkInfo[] = [];
  const external: LinkInfo[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  for (const anchor of Array.from(doc(html).querySelectorAll('a[href]'))) {
    const href = anchor.getAttribute('href') ?? '';
    if (/^(javascript:|mailto:|tel:|data:|#)/i.test(href.trim())) {
      skipped += 1;
      continue;
    }
    let absolute: URL;
    try {
      absolute = new URL(href, base);
    } catch {
      skipped += 1;
      continue;
    }
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') {
      skipped += 1;
      continue;
    }
    const key = absolute.toString().split('#')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    const info: LinkInfo = {
      href,
      absolute: key,
      text: (anchor.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120),
      domain: absolute.hostname,
      internal: absolute.hostname === base.hostname,
    };
    (info.internal ? internal : external).push(info);
  }
  return { internal, external, skipped };
}

export interface SeoReport {
  title: string;
  titleLength: number;
  description: string;
  keywords: string;
  canonical: string;
  lang: string;
  charset: string;
  robotsMeta: string;
  viewport: string;
  og: Record<string, string>;
  twitter: Record<string, string>;
  h1: string[];
  h2Count: number;
  imageTotal: number;
  imagesWithoutAlt: number;
  linkInternal: number;
  linkExternal: number;
}

export function extractSeo(html: string, baseUrl: string): SeoReport {
  const d = doc(html);
  const meta = (name: string) =>
    d.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ??
    d.querySelector(`meta[property="og:${name}"]`)?.getAttribute('content') ??
    '';

  const pick = (selector: string) => Array.from(d.querySelectorAll(selector)).map((el) => (el.textContent ?? '').trim()).filter(Boolean);
  const records = (prefix: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const el of Array.from(d.querySelectorAll(`meta[property^="${prefix}"], meta[name^="${prefix}"]`))) {
      const key = (el.getAttribute('property') ?? el.getAttribute('name') ?? '').replace(`${prefix}`, '');
      if (key) out[key] = el.getAttribute('content') ?? '';
    }
    return out;
  };

  let linkInternal = 0;
  let linkExternal = 0;
  try {
    const links = extractLinks(html, baseUrl);
    linkInternal = links.internal.length;
    linkExternal = links.external.length;
  } catch {
    /* baseUrl 非法时链接统计保持 0 */
  }

  const images = Array.from(d.querySelectorAll('img'));
  return {
    title: d.querySelector('title')?.textContent?.trim() ?? '',
    titleLength: (d.querySelector('title')?.textContent ?? '').trim().length,
    description: meta('description'),
    keywords: meta('keywords'),
    canonical: d.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
    lang: d.documentElement.getAttribute('lang') ?? '',
    charset: d.querySelector('meta[charset]')?.getAttribute('charset') ?? d.querySelector('meta[http-equiv="Content-Type"]')?.getAttribute('content') ?? '',
    robotsMeta: meta('robots'),
    viewport: meta('viewport'),
    og: records('og:'),
    twitter: records('twitter:'),
    h1: pick('h1'),
    h2Count: d.querySelectorAll('h2').length,
    imageTotal: images.length,
    imagesWithoutAlt: images.filter((img) => !(img.getAttribute('alt') ?? '').trim()).length,
    linkInternal,
    linkExternal,
  };
}
