// 构建期预渲染：为每个路由生成 dist/<route>/index.html 静态壳（目录 index），
// 供不执行 JS 的爬虫抓取；真实用户由 createRoot 接管并替换 #root 内容。
// vite-node 运行：node_modules/.bin/vite-node scripts/render-routes.ts
// 环境变量：ROUTE_BASE（如 /devtoolbox，默认空=根部署）、SITEMAP_ORIGIN（默认 Pages 地址，仅 og:url）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from '@/data/routes';
import { tl } from '@/i18n/locale';
import { getTool, getToolsByCategory } from '@/data/tools';
import { getCategory } from '@/data/categories';
import {
  categorySeoTitle,
  toolSeoDescription,
  toolSeoIntro,
  toolSeoTitle,
} from '@/lib/seoTemplates';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const base = process.env.ROUTE_BASE ?? '';
const origin = process.env.SITEMAP_ORIGIN ?? 'https://YuChuanhui3.github.io';

const esc = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const href = (path: string): string => `${base}${path === '/' ? '/' : `${path}/`}`;

const toolLink = (id: string): string => {
  const tool = getTool(id);
  if (!tool) return '';
  return `<a href="${esc(href(`/tools/${tool.id}`))}">${esc(tool.name)}</a>`;
};

const categoryNav = (categoryId?: string): string => {
  const list = categoryId
    ? getToolsByCategory(categoryId as never)
    : undefined;
  return list && list.length
    ? `<nav aria-label="同分类工具">${list.map((tool) => toolLink(tool.id)).join('、')}</nav>`
    : '';
};

const bodyFor = (path: string): string => {
  const route = ROUTES.find((item) => item.path === path);
  if (!route) return '';
  const h1 = `<h1>${esc(tl(route.title, 'zh'))}</h1>`;
  const desc = `<p>${esc(tl(route.description, 'zh'))}</p>`;

  if (path.startsWith('/tools/') && path !== '/tools') {
    const id = path.slice('/tools/'.length);
    const tool = getTool(id);
    if (!tool) return '';
    const category = getCategory(tool.category);
    return [
      h1,
      desc,
      `<p>${esc(toolSeoIntro(tool).zh)}</p>`,
      category
        ? `<nav aria-label="分类"><a href="${esc(href('/'))}">开发者在线工具箱</a> › <a href="${esc(href(`/category/${category.id}`))}">${esc(categorySeoTitle(category, getToolsByCategory(category.id).length).zh)}</a> › ${esc(tool.name)}</nav>`
        : '',
      categoryNav(tool.category),
    ].join('\n');
  }

  if (path.startsWith('/category/')) {
    const id = path.slice('/category/'.length);
    const category = getCategory(id);
    if (!category) return '';
    return [h1, desc, categoryNav(id)].join('\n');
  }

  if (path === '/about' || path === '/privacy') {
    return [h1, desc].join('\n');
  }

  // 首页与全部工具页：全量工具链接，锚文本覆盖各「在线XX工具」长尾
  const groups = ROUTES.filter((item) => item.path.startsWith('/tools/'))
    .map((item) => item.path.slice('/tools/'.length))
    .map((id) => getTool(id))
    .filter((tool) => tool !== undefined);
  const byCategory = new Map<string, string[]>();
  for (const tool of groups) {
    const list = byCategory.get(tool.category) ?? [];
    list.push(toolLink(tool.id));
    byCategory.set(tool.category, list);
  }
  const sections = [...byCategory.entries()]
    .map(([categoryId, links]) => {
      const category = getCategory(categoryId);
      return `<section><h2><a href="${esc(href(`/category/${categoryId}`))}">${esc(category ? tl(category.name, 'zh') : categoryId)}</a></h2><nav>${links.join('、')}</nav></section>`;
    })
    .join('\n');
  return [h1, desc, sections].join('\n');
};

let html = readFileSync(join(dist, 'index.html'), 'utf8');

for (const route of ROUTES) {
  const isHome = route.path === '/';
  const zhTitle = tl(route.title, 'zh');
  const title = isHome || zhTitle.includes('DevToolbox') ? zhTitle : `${zhTitle} · DevToolbox`;
  const description = tl(route.description, 'zh');
  const keywords = tl(route.keywords, 'zh');
  const url = `${origin}${base === '/' ? '' : base}${isHome ? '/' : `${route.path}/`}`;

  let doc = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[\s\S]*?"\s*\/>/,
      `<meta name="description" content="${esc(description)}" />`,
    )
    .replace(
      '<meta name="theme-color"',
      `<meta name="keywords" content="${esc(keywords)}" />\n    <link rel="canonical" href="${esc(url)}" />\n    <meta property="og:title" content="${esc(title)}" />\n    <meta property="og:description" content="${esc(description)}" />\n    <meta property="og:url" content="${esc(url)}" />\n    <meta name="theme-color"`,
    )
    .replace('<div id="root"></div>', `<div id="root">\n${bodyFor(route.path)}\n</div>`);

  if (doc === html && !isHome) {
    console.error(`[render-routes] template markers missing for ${route.path}`);
    process.exit(1);
  }

  if (isHome) {
    // 保留一份未 stamped 的原始模板没有意义：根 shell 即首页预渲染版
    writeFileSync(join(dist, 'index.html'), doc);
  } else {
    const dir = join(dist, ...route.path.split('/').filter(Boolean));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), doc);
  }
}

console.log(`[render-routes] wrote ${ROUTES.length} route shells under dist/ (base="${base}")`);
