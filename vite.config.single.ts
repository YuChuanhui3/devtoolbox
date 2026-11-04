// 单文件离线包配置：npm run build:single → dist-single/DevToolbox.html，拷到任意目录双击打开。
// 之所以要单独一套配置：file:// 下浏览器既不加载外链 <script type="module">（CORS origin=null），
// 也不允许 new Worker('file://…')，所以代码分割、外链 chunk、外链字体在这个模式下全部必须消失。
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // 资源最终会被内联成 data URI，但残留的相对引用必须能落在同一个目录里
  base: './',
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'offline'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: { alias: { '@': path.resolve(root, './src') } },
  build: {
    target: 'es2022',
    outDir: 'dist-single',
    emptyOutDir: true,
    // 字体/图片转 data URI，产物里不留任何外链文件
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    // 没有独立 chunk 就没有依赖图，注入的 preload polyfill 只会去 fetch 不存在的文件
    modulePreload: false,
    reportCompressedSize: false,
    rollupOptions: { input: path.resolve(root, 'index.html'), output: { inlineDynamicImports: true } },
  },
});
