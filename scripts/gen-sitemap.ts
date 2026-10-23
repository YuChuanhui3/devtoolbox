// 生成 public/sitemap.xml（vite-node 运行：node_modules/.bin/vite-node scripts/gen-sitemap.ts）
// 环境变量：SITEMAP_ORIGIN（默认 https://YuChuanhui3.github.io）、SITEMAP_BASE（默认 /devtoolbox）
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from '@/data/routes';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const origin = process.env.SITEMAP_ORIGIN ?? 'https://YuChuanhui3.github.io';
const base = process.env.SITEMAP_BASE ?? '/devtoolbox';

const today = new Date().toISOString().slice(0, 10);

const urls = ROUTES.map((route) => {
  const path = route.path === '/' ? '/' : `${route.path}/`;
  const changefreq = route.path === '/' || route.path === '/tools' ? 'weekly' : 'monthly';
  const priority = route.path === '/' ? '1.0' : route.path.startsWith('/tools/') ? '0.8' : '0.6';
  return `  <url>\n    <loc>${origin}${base === '/' ? '' : base}${path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public/sitemap.xml'), xml);
console.log(`[gen-sitemap] wrote public/sitemap.xml with ${urls.length} urls`);
