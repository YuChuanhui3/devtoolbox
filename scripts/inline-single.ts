// 把 dist-single/ 里的构建产物压成一个 HTML：vite-node scripts/inline-single.ts
// 前置条件是 `vite build --config vite.config.single.ts`（base=./、无代码分割、资源已 data URI 化）。
// 产物 dist-single/DevToolbox.html 拷到内网任意目录即可双击打开，目录下不留任何附属文件。
import { readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? 'dist-single');
const outputFile = 'DevToolbox.html';
// 收尾要清空这个目录里除产物以外的一切，所以只允许指向构建输出目录
if (!path.basename(dir).startsWith('dist')) {
  throw new Error(`拒绝处理非构建输出目录：${dir}`);
}
const html = readFileSync(path.join(dir, 'index.html'), 'utf8');

// base=./ 产出 ./assets/x.js，个别标签会被写成 /assets/x.js，两种都落在同一个目录
const read = (ref: string): string => readFileSync(path.join(dir, ref.replace(/^\.?\//, '')), 'utf8');

const inlined = html
  .replace(/<script([^>]*?)\ssrc="([^"]+)"([^>]*)>\s*<\/script>/g, (all, head: string, src: string) => {
    if (!/type="module"/.test(head)) return all;
    // 内联后 HTML 分词器仍在 script data 状态里找 `</script`；`<\/script` 在 JS 字符串/正则里同值
    return `<script type="module">\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`;
  })
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/g, (all) => {
    const href = /href="([^"]+)"/.exec(all)?.[1];
    return href ? `<style>\n${read(href).trim()}\n</style>` : all;
  })
  .replace(/<link[^>]*rel="(?:modulepreload|preload|dns-prefetch|preconnect)"[^>]*>\s*/g, '');

// 检查外链时要把脚本/样式正文挖掉：JS 字符串里本来就满是 src="…"、href="…"
const shell = inlined
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '<script></script>')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '<style></style>');
const leftovers = [...shell.matchAll(/(?:src|href)="(?!data:|#)([^"]+)"/g)].map((match) => match[1]);
if (leftovers.length) {
  throw new Error(`还有外链没被内联：${leftovers.join(', ')}`);
}

const banner = `DevToolbox 离线单文件包 · 构建 ${new Date().toISOString()} · 生成方式 npm run build:single`;
const final = inlined.replace(/<!doctype html>/i, `<!doctype html>\n<!-- ${banner} -->`);
writeFileSync(path.join(dir, outputFile), final, 'utf8');

// 只清 dist-single 内的中间产物；index.html 与 public/ 拷贝件对离线包没有意义
for (const entry of readdirSync(dir)) {
  if (entry === outputFile) continue;
  rmSync(path.join(dir, entry), { recursive: true, force: true });
}

const bytes = Buffer.byteLength(final, 'utf8');
console.log(`[inline-single] ${outputFile} ${(bytes / 1024 / 1024).toFixed(2)} MB · JS/CSS/字体已全部内联`);
