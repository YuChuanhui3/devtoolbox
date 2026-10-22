// 生成 public/sitemap.xml：静态路由 + 7 个分类页 + 全部工具页。
// 构建前运行（npm run sitemap），产物随 dist 一起部署。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_ORIGIN = process.env.SITEMAP_ORIGIN ?? 'https://YuChuanhui3.github.io';
const BASE_PATH = process.env.SITEMAP_BASE ?? '/devtoolbox';

const toolsSrc = readFileSync(join(root, 'src/data/tools.ts'), 'utf8');
const categoriesSrc = readFileSync(join(root, 'src/data/categories.ts'), 'utf8');

const toolIds = [...toolsSrc.matchAll(/^\s*id: '([a-z0-9-]+)',/gm)].map((m) => m[1]);
const categoryIds = [...categoriesSrc.matchAll(/^\s*id: '([a-z0-9-]+)',/gm)].map((m) => m[1]);

const staticPaths = ['/', '/tools', '/about', '/privacy'];
const categoryPaths = categoryIds.map((id) => `/category/${id}`);
const toolPaths = toolIds.map((id) => `/tools/${id}`);

const freq = new Map([
  ['/', 'weekly'],
  ['/tools', 'weekly'],
]);

const urls = [...staticPaths, ...categoryPaths, ...toolPaths].map((p) => {
  const lastmod = new Date().toISOString().slice(0, 10);
  const changefreq = freq.get(p) ?? (p.startsWith('/tools/') ? 'monthly' : 'monthly');
  const priority = p === '/' ? '1.0' : p.startsWith('/tools/') ? '0.8' : '0.6';
  return `  <url>\n    <loc>${SITE_ORIGIN}${BASE_PATH}${p === '/' ? '/' : p}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
});

if (toolIds.length < 90) {
  console.error(`[gen-sitemap] only found ${toolIds.length} tool ids, refusing to write`);
  process.exit(1);
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public/sitemap.xml'), xml);
console.log(`[gen-sitemap] wrote public/sitemap.xml with ${urls.length} urls (${toolIds.length} tools, ${categoryIds.length} categories)`);
