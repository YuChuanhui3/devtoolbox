# DevToolbox · Free Online Developer Tools (在线开发者工具箱)

[![Deploy to GitHub Pages](https://github.com/YuChuanhui3/devtoolbox/actions/workflows/deploy.yml/badge.svg)](https://github.com/YuChuanhui3/devtoolbox/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Tools](https://img.shields.io/badge/tools-93-blue)
![PRs%20Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

**Live site: <https://YuChuanhui3.github.io/devtoolbox/>**

DevToolbox is a free, open-source online toolbox for developers: **93 browser-based tools** for JSON formatting, encoding & encryption, hashing, regex testing, image compression, QR codes, timestamps, UUIDs, Markdown, local file transfer and more. Everything runs 100% client-side — your text, JSON and images never leave your device. No account, no backend, no analytics scripts. The interface is fully bilingual (English / 中文) with instant switching.

## Why DevToolbox

- **Privacy-first, local processing** — all conversion, hashing and image tools run in your browser via Web Crypto, Canvas and Web Workers. Sensitive tools (AES, JWT, hashing) never save drafts.
- **Free online developer tools, zero install** — open a page and work; results copy/download/clear with one click.
- **Full English / 中文 bilingual UI** — every tool label, error message and reference dataset is translated; search works in both languages. Non-Chinese browsers default to English.
- **Peer-to-peer LAN file transfer** — WebRTC DataChannel file/transfer between phone and desktop on the same Wi-Fi, no server in between.
- **Built for daily use** — global search (`⌘/Ctrl + K`), favorites, recent tools, auto-saved drafts, light/dark/system theme, per-tool code splitting.

## Tool Categories (93 tools)

| Category | Count | Representative tools |
|---|---|---|
| Encoding & Encryption 编码加密 | 16 | Base64/Base32/Base58 codec, URL encoder, MD5/SHA digest, AES & RSA encrypt/decrypt, JWT decoder, bcrypt/scrypt, hex, gzip, htpasswd, random password |
| Developer Utilities 开发调试 | 29 | Timestamp converter, regex tester, UUID generator, code compare, cron parser, HTTP status codes & headers reference, port reference, color converter, SQL/HTML/JS formatter, CRC16/CRC32, self-signed cert, virtual bank card & multi-country identity generator |
| Data Formats 数据格式 | 10 | JSON formatter, JSON Schema validate & generate, JSON↔CSV/XML/YAML/Query converters, JSON Diff, JSONPath query, JSON to Java/TS/Go entities, YAML↔Properties |
| Network Tools 网络工具 | 25 | My IP lookup, IP info & DNS record query, curl to code, WebSocket tester, subnet mask calculator, robots.txt generator, shields badge, SEO checker, LAN file transfer (WebRTC), MQTT cheatsheet & examples |
| Image Tools 图像处理 | 4 | Image compressor, format converter (JPG/PNG/WebP), image ↔ Base64, QR code generator |
| Text Tools 文本处理 | 8 | Word/character counter, case converter, line utils, dedupe, sort, occurrence counter, HTML sanitize & entity escape |
| Markdown | 1 | Live Markdown editor with split view, syntax highlighting, DOMPurify-sanitized preview, export `.md` / `.html` |

Full tool lists per category are in the [中文说明](#中文说明) section below and on the live site.

## Quick Start

Requires Node.js 20+ (22 recommended).

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm run build        # typecheck + production build
npm run test:run     # 572 unit tests (Vitest + Testing Library)
```

## Tech Stack

React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Zustand + React Router 7. Purely static output — deployable to GitHub Pages, Netlify, Vercel, or any static host. See the [中文说明](#技术栈) for the full dependency table.

## Deployment

- **GitHub Actions → GitHub Pages**: push to `main` triggers `.github/workflows/deploy.yml`, which runs `npm run build:ghpages` (subpath base `/devtoolbox/` + sitemap generation) and publishes `dist/`.
- SPA deep links on GitHub Pages are handled by `public/404.html` + a URL-restore script in `index.html`; Netlify/Vercel use `_redirects` / `vercel.json` rewrites.
- `sitemap.xml` is generated from the tool registry via `npm run sitemap`.
- **SEO prerender**: `scripts/render-routes.ts` (vite-node) stamps every route with a static `index.html` shell — per-route `<title>` (在线XX工具 keyword pattern), meta description/keywords/OG and crawlable h1/intro/link body inside `#root`. Real users never see it (React's `createRoot` replaces the children), so crawlers without JS (Bing, Baidu, AI engines) get full content.
- **Search engine submission**: Google verified in Search Console with the sitemap submitted; for Bing use <https://www.bing.com/webmasters> (import the GSC property, then submit `sitemap.xml`); for Baidu submit via <https://ziyuan.baidu.com> — note github.io subpaths are indexed slowly by Baidu, a custom domain is the long-term fix.

## Contributing

PRs welcome. Adding a tool takes four steps: register metadata (with `nameEn`/`descriptionEn` — enforced by a guard test), build the component from the shared `TransformTool`/`EditorPanels` primitives, lazy-register it, and add pure-function tests under `src/lib/`. Details in 中文说明 → 新增一个工具.

Distributed under the **MIT License**. See [LICENSE](./LICENSE).

---

# 中文说明

一个纯前端、本地优先的开发者在线工具箱。覆盖编码加密、开发调试、Markdown、数据格式、图像处理、网络工具与文本处理，共 **93 个高频工具**。分类与分类内工具均按名称拼音首字母自动排序。界面支持中文 / English 双语切换。

没有账号、没有后端、没有第三方统计脚本。文本、JSON、图片等内容默认在浏览器内处理，不会上传服务器；收藏、最近使用与草稿仅保存在本机 `localStorage`。

## 功能特性

- **全局搜索**：`⌘ / Ctrl + K` 唤起，支持名称、别名、标签与描述搜索，键盘上下选择、Enter 打开。
- **中英双语**：设置或顶栏一键切换 中文 / English，即时生效无需刷新；93 个工具、错误提示、参考数据（端口、HTTP 状态码、Linux 命令等）全量双语，搜索中英互通；选择持久化到本机并同步 `<html lang>`，非中文浏览器首次访问默认英文。
- **工具分类**：编码加密、开发调试、Markdown、数据格式、图像处理、网络工具、文本处理七大分类，按名称拼音首字母排序。
- **收藏与最近使用**：收藏工具、记录最近访问，刷新后仍然保留。
- **主题模式**：浅色 / 深色 / 跟随系统，首次绘制前应用主题，避免闪烁。
- **统一工具页模板**：输入、参数、操作、结果、错误、相关工具保持一致交互。
- **复制 / 下载 / 清空 / 示例**：所有工具遵循同一套操作规范。
- **自动保存草稿**：普通文本工具自动保存输入草稿，可一键清除；加密、JWT 等敏感工具不保存。
- **安全渲染**：Markdown 预览经 DOMPurify 过滤，禁止脚本、iframe、事件属性与 `javascript:` 链接。
- **本地设置中心**：主题、语言（中文 / English）、草稿开关、本地匿名统计开关、本地数据清空、快捷键入口。
- **按需加载**：每个工具独立分包，首页不加载全部工具代码。
- **局域网文件互传**：基于 WebRTC DataChannel 的点对点传输，扫码或复制粘贴配对，文件不出本机、不经过服务器。

## 工具清单

分类与分类内工具均按名称拼音首字母自动排序（详见 `src/data/tools.ts` 的派生排序），新增工具无需手工调整顺序。

### 编码加密（16）

AES 加密解密、Base32/58/62/100 互转、Base64 编码解码、Bcrypt/Scrypt 哈希、DES/3DES/Rabbit/RC4、Gzip 压缩解压、Hex 文本互转、htpasswd 生成器、JS 字符串转义、JWT 解析、MD5 / SHA 摘要、莫斯密码互转、RSA/RSA2 公私钥、随机密码生成、Unicode 转换、URL 编码解码。

### 开发调试（29）

常用端口查询、Cisco Type7 加解密、CRC16/CRC32 校验、Cron 表达式解析、代码对比、HTML/CSS/JS 格式化、HTTP Header 查询、HTTP 状态码、HTTP 请求方法、进制转换、Linux 命令速查、MIME Type 查询、屏幕 PPI 计算、时间戳转换、SQL 格式化、随机数生成、URL 地址解析、User-Agent 解析、UUID 生成、VMess/SS/SSR 链接解析、文件大小换算、迅雷/快车/旋风链接、虚拟地址生成器、虚拟银行卡生成器、颜色转换、正则表达式测试、正则转义、种子转磁力链接、自签名证书生成。

### Markdown（1）

Markdown 实时渲染：编辑 / 分栏 / 预览三种模式、同步滚动、语法高亮、自动保存、复制 Markdown / HTML、下载 `.md` / `.html`、移动端编辑 / 预览切换。

### 数据格式（10）

JSON Diff 对比、JSON ↔ CSV 互转、JSON ↔ XML 互转、JSON ↔ YAML 互转、JSON ↔ Query 互转、JSON 格式化、JSON Schema 校验生成、JSON 转多语言实体类、JSONPath 查询、YAML ↔ Properties 互转。

### 图像处理（4）

二维码生成、图片 Base64 互转、图片压缩、图片格式转换。图片处理通过 Canvas 在本地完成，支持批量处理、前后对比、单张 / 批量下载。

### 网络工具（25）

常用 User-Agent 大全、Cookie 查询、curl 转代码、获取你的 IP、IP 信息查询、IP 地址随机生成、IP 定位周边信息、IP 转数字 / 数字转 IP、局域网文件互传、浏览器信息获取、MAC 地址生成、模拟 HTTP 请求、模拟 WebSocket 请求、robots.txt 生成器、Shield Badge 徽章生成、User-Agent 随机生成、网站 SEO 查询、网站内外链接查询、网站头信息查看、网页自动刷新、WebCheck 网络检查、域名 DNS 解析记录、域名服务器查询、子网掩码计算换算、MQTT 速查与示例。

在线查询类工具依赖公开 API（ipify、Cloudflare DoH、WebSocket 测试服务等），部分需经 CORS 代理转发，页面内已标注数据来源与限制；局域网文件互传为 WebRTC 点对点直连，数据不经过任何服务器。

### 文本处理（8）

出现次数统计、大小写转换、多行文本处理、HTML 实体转义、HTML 标签清理、文本去重、文本排序、字数统计。

## 技术栈

| 类型 | 选型 |
|---|---|
| 框架 | React 19 + TypeScript |
| 构建 | Vite 6 |
| 路由 | React Router 7 |
| 状态 | Zustand（持久化到 localStorage） |
| i18n | 轻量自建 L10n 值对象（`src/i18n/`，零第三方依赖） |
| 样式 | Tailwind CSS 4 + 自定义 CSS Token |
| Markdown | marked + DOMPurify + highlight.js |
| 数据转换 | js-yaml、fast-xml-parser、PapaParse、jsonpath-plus、jsonc-parser |
| 代码能力 | sql-formatter、js-beautify、terser、Web Worker |
| 加密哈希 | @noble/hashes、crypto-js、bcryptjs、node-forge |
| 网络与传输 | WebRTC DataChannel、@zxing/browser（扫码）、ua-parser-js、cron-parser、diff、qrcode |
| 测试 | Vitest + Testing Library + jsdom |

## 快速开始

要求 Node.js 20+（推荐 22）。

```bash
npm install
npm run dev          # 开发服务器，默认 http://localhost:5173
npm run build        # 类型检查 + 生产构建
npm run build:ghpages # 生成 sitemap + 以 /devtoolbox/ 子路径构建（GitHub Pages 用）
npm run preview      # 预览生产构建
npm run test         # 监听模式运行单元测试
npm run test:run     # 单次运行全部测试
npm run coverage     # 生成覆盖率报告（coverage/）
```

## 项目结构

```text
src/
├── components/
│   ├── layout/          # 顶栏、侧栏、页脚、设置、快捷键
│   ├── search/          # 全局搜索弹层
│   ├── tool/            # 工具页通用面板、操作、错误、草稿等
│   └── ui/              # Button、Input、Dialog、Toast 等基础组件
├── data/                # 工具注册表、分类、静态参考数据与示例
├── hooks/               # 主题、快捷键、防抖、草稿、图片队列、SEO 标签等
├── i18n/                # 语言检测、L10n 值对象、useI18n 与语言切换
├── lib/                 # 纯函数与浏览器能力封装（JSON、编码、转换、图片等）
├── pages/               # 首页、全部工具、分类、收藏、最近、关于、隐私
├── store/               # Zustand 全局状态
├── tools/               # 93 个工具组件，按工具独立分包
└── workers/             # JSON 转代码 Web Worker
```

### 新增一个工具

1. 在 `src/data/tools.ts` 增加工具元数据（`id`、名称、分类、描述、标签、别名、图标），**并同时提供 `nameEn` 与 `descriptionEn`**——完整性守卫测试会强制检查。
2. 在 `src/tools/` 创建组件，复用 `TransformTool`、`InputPanel`、`OutputPanel`、`ToolActions`、`ToolAlert` 等通用组件。
3. 在 `src/tools/registry.tsx` 注册 `lazy(() => import('./YourTool'))`。
4. 如需纯函数能力，放在 `src/lib/` 并补充对应测试。

工具页路由统一为 `/tools/:toolId`，收藏、最近使用、搜索与相关工具会自动生效。展示顺序（分类 + 分类内工具）由 `src/data/tools.ts` 按名称拼音首字母自动派生；若新工具以汉字开头且首字未收录在 `CJK_INITIAL_PINYIN` 表中，排序守卫测试会提示补一行拼音。英文界面下工具与分类改按 `nameEn` 字母序排列（分类分组不变），`ReferenceListTool`、`TransformTool`、`ToolError`（`{ zh, en }` 消息）等通用组件可直接复用，无需重复实现双语逻辑。

## 数据与隐私

- 大部分工具在浏览器本地运行，文本、JSON、YAML、XML、CSV、图片等内容默认不上传服务器。
- 网络工具中的在线查询类（IP 信息、DNS、SEO、网页抓取等）会调用第三方公开 API 或经 CORS 代理转发目标地址，输入的目标 URL / 域名会离开本机，页面内已标注数据来源；请勿查询敏感内网地址。
- 局域网文件互传基于 WebRTC 点对点直连，文件只在两台设备间传输，不经过服务器，也不落盘保存会话记录。
- 收藏、最近使用、搜索历史、Markdown 草稿、工具草稿与本地统计保存在 `localStorage`。
- 本地统计仅记录工具访问 / 执行次数，不记录输入内容，不使用第三方脚本，可在设置中关闭并清除。
- 加密类工具（Hash、JWT、AES 等）标记为敏感工具，不自动保存输入草稿。
- 请勿在加密、JWT、AES 等工具中输入生产环境的敏感密钥。

更多说明见站内「隐私说明」页面。

## 测试与质量

- 单元测试覆盖 `src/lib/` 下的核心纯函数：JSON 解析与错误定位、JSON Schema 校验、编码解码、格式转换、颜色、Cron、Diff、Markdown 安全过滤、图片处理、SDP 压缩信封、分块传输协议等；另有 i18n 内核（`tl` / `detectLocale` / 语言切换渲染）与双语元数据完整性守卫测试。
- 当前测试规模：**59 个测试文件、572 个测试用例全部通过（2 个跳过）**。
- `src/lib/**` 覆盖率：**语句 96%+、分支 89%+、函数 98%+**。
- 已通过 `tsc -b` 类型检查与 `vite build` 生产构建。
- 已对全部工具路由做浏览器冒烟检查，并在英文界面下重跑；局域网文件互传另有双页 WebRTC 端到端测试（配对、文本、5MB 文件字节一致性、拒绝流程），中文与英文模式均已覆盖。

```bash
npm run test:run
npm run coverage
npm run typecheck
npm run build
```

## 部署

构建产物位于 `dist/`，可直接部署到任意静态托管服务。GitHub Pages 上线由 `.github/workflows/deploy.yml` 自动完成（`main` 分支推送触发，`npm run build:ghpages` + `actions/deploy-pages`）。

项目使用 `BrowserRouter` 的 History 路由，部署时需要将未知路径回退到 `index.html`：

- **GitHub Pages（子路径 `/devtoolbox/`）**：已提供 `public/404.html` + `index.html` 头部恢复脚本的 SPA 深链方案，构建需用 `--base=/devtoolbox/`（即 `npm run build:ghpages`）。
- **Netlify / Cloudflare Pages**：已提供 `public/_redirects`（`/* /index.html 200`）。
- **Vercel**：已提供根目录 `vercel.json` 的 rewrite 配置。
- **Nginx**：`try_files $uri $uri/ /index.html;`
- **其他静态服务器**：配置 SPA fallback 即可。

如使用其他子路径部署，需要同步调整 Vite `base`、`homepage` 与 sitemap 生成脚本中的路径前缀。

构建期会由 `scripts/render-routes.ts` 为每个路由生成带「在线XX工具」关键词标题、描述与简介正文的静态 `index.html` 壳（目录 index），供不执行 JS 的搜索引擎抓取；真实用户由 React 接管，看到的仍是完整应用。搜索引擎提交：Google 已完成站长验证并提交 `sitemap.xml`；Bing 在 <https://www.bing.com/webmasters> 导入 Google 属性后提交同一 sitemap；百度在 <https://ziyuan.baidu.com> 提交（github.io 子路径收录慢，长期建议自定义域名）。

## 浏览器兼容性

- Chrome / Edge / Safari / Firefox 最近两个大版本。
- 依赖 Web Crypto 的工具（SHA、AES）需要 HTTPS 或 localhost 安全上下文。
- 双语切换为纯客户端行为，URL 不变；`document.title` 与 `<html lang>` 随语言同步。工具内示例数据与部分标签（如检索用中文关键词）保持中文。
- 图片压缩 / 转换依赖 Canvas 与 `createImageBitmap`，不支持时会自动回退或给出提示。
- 移动端布局优化为单列与编辑 / 预览切换。

## 已知限制

- 图片输出支持 JPG / PNG / WebP；GIF 仅处理首帧，BMP 由浏览器解码后重新编码。
- 在线查询类网络工具依赖第三方公开 API 与 CORS 代理，可用性与速率受上游影响，页面内已标注；路由追踪、SSL 套件检测、证书链查询、网页截图等需要服务端能力，不在纯前端范围内。
- 局域网文件互传要求两台设备在同一 Wi-Fi / 局域网（仅 host 候选，不穿 NAT），配对信息一次性有效；断线后未完成的文件需重新发送，不支持续传。
- 本地统计为设备维度，不做跨设备汇总。

## 文档

- [产品需求文档（合并版）](./docs/prd.md)

## 许可

本项目基于 [MIT License](./LICENSE) 开源。
