# DevToolbox 功能合并手册（写给执行改动的 AI）

本手册定义了在本仓库中「新增工具」与「增强既有工具」的标准合并方式。此前所有工具（含 虚拟银行卡生成器、虚拟地址生成器、JSON↔XML 增强尝试）均按此流程落地，请严格照做，不要自创路径。

执行前先读：本文件 + `src/data/tools.ts`（注册表）+ `src/data/tools.test.ts`（守卫测试）。

---

## 0. 决策：增强既有工具，还是新建工具？

| 情况 | 做法 |
|---|---|
| 给现有工具加选项/模式（如 XML 转换加注释保留） | 只改 `src/lib/*.ts` + 对应 `src/tools/*Tool.tsx`，**不新增注册条目**；同步更新 `tools.ts` 中该条目的 `description`/`descriptionEn` |
| 能力面向不同用户意图（如“生成测试数据” vs “格式转换”） | 新建工具，走 §1 全流程 |

增强既有工具时保持**可整体回退**：改动集中在 lib 选项对象 + UI 开关，不要重构无关代码。教训：JSON↔XML 的 remark/字段映射增强因用户觉得“没效果”被要求整体移除，靠选项化设计一次 `git checkout <旧提交> -- 三个文件` 即干净回滚。

---

## 1. 新增工具：七步清单（全部必做）

以 `virtual-card`（虚拟银行卡生成器）为参照实例。设新工具 id 为 `<id>`、组件名为 `XxxTool`。

### 步骤 1 — 纯逻辑库：`src/lib/<id>.ts`（新建）

- 所有业务逻辑写成**纯函数**放 `src/lib/`，组件里不写算法。
- 随机类逻辑必须接受注入的 `random: () => number` 参数（默认 `Math.random`），以便测试用固定种子复现（见 `faker.ts` 的 `stableRandom` 用法）。
- 抛错用 `ToolError`（`src/lib/errors.ts`），title/hint 都是 `{ zh, en }` 双语对象。
- 配套新建 `src/lib/<id>.test.ts`（vitest），至少覆盖：正常输出结构、边界（空输入/超限）、格式正则断言。

### 步骤 2 — 组件：`src/tools/XxxTool.tsx`（新建）

- `export default function XxxTool()`，无 props。
- **所有用户可见文案必须双语**：`const { t } = useI18n();` + `t({ zh: '数量', en: 'Count' })`。数据内容（如中文姓名池）可以是单语言，但标签、按钮、说明文字必须走 `t()`。
- 复用现有 UI 组件（`@/components/ui/` 与 `@/components/tool/`）：
  - 转换类工具：直接用 `TransformTool`（参考 `src/tools/shared/JsonXmlTool.tsx`）。
  - 生成器类工具：`ActionBar` + `Input`(数量) + `Button`(生成) + `Panel`(结果) + `CopyButton`/`CopyIconButton`/`DownloadButton`（参考 `MacAddressTool.tsx`、`VirtualBankCardTool.tsx`）。
- 组件底部放一行 `<p className="text-center text-[11px] text-ink-3">` 的能力/免责说明（双语）。
- 注意坑：
  - `DownloadButton` 的 MIME prop 叫 `mime`（不是 `mimeType`）；CSV 下载加 `\uFEFF` BOM。
  - `Select` 是自定义 listbox（button + portal），**不是原生 `<select>`**，自动化脚本要用 `role=combobox/option` 驱动。
  - 表格/长列表放 `Panel` 时用 `bodyClassName="p-0 overflow-x-auto"`。

### 步骤 3 — 组件映射：`src/tools/registry.tsx`

在对应分类注释区块内加一行（懒加载，保持分包）：

```tsx
'<id>': lazy(() => import('./XxxTool')),
```

### 步骤 4 — 工具注册表：`src/data/tools.ts` 的 `RAW_TOOLS`

在所属分类条目区追加（字段缺一不可）：

```ts
{
  id: '<id>',
  name: '中文名',
  nameEn: 'English Name',        // 必填，守卫测试强制
  category: '<categoryId>',      // 见 src/data/categories.ts：encode|dev|markdown|data|image|network|text
  description: '中文描述。',
  descriptionEn: 'English description.',  // 必填，守卫测试强制
  tags: ['…', '…'],              // 参与搜索，中英都放
  aliases: ['…'],                // 用户可能的搜法（json2xml 之类）
  icon: 'CreditCard',            // 必须已在 ToolIcon 注册，见步骤 5
  priority: 'P2',                // P0 核心 / P1 常用 / P2 长尾
},
```

- **中文名首字若是汉字，必须登记拼音**：`tools.ts` 底部 `CJK_INITIAL_PINYIN` 表加 `虚: 'xu'` 这样的首字条目，否则守卫测试「每个工具名的首字都可排序」直接失败。首字是拉丁字母则无需登记。
- 命名风格与同族保持一致（例：转换类统一「JSON ↔ X 互转」，不用「JSON 与 X 互转」）。

### 步骤 5 — 图标（仅当新图标）：`src/components/ui/ToolIcon.tsx`

同一个 lucide 图标名要加**两处**（按字母序）：顶部 `import { … } from 'lucide-react'` 列表 + 下方图标映射对象。只加一处会 TS 报错或运行时找不到。

### 步骤 6 — SEO / 路由 / sitemap：**无需手动改**

`src/data/routes.ts` 从 `TOOLS` 自动派生全部路由与「在线XX工具」关键词标题；构建时 `scripts/gen-sitemap.ts` 与 `scripts/render-routes.ts` 自动生成 sitemap 和静态壳。只要步骤 4 注册正确，SEO 自动生效。不要往 `routes.ts` 里硬编码单条工具。

### 步骤 7 — README 计数同步：`README.md`

新增 N 个工具需同步以下位置（数字全部手改，无脚本）：

1. shields badge `badge/tools-<总数>-blue`
2. 英文简介 `**<总数> browser-based tools**`
3. `## Tool Categories (<总数> tools)`
4. 所属分类表格行的 Count + 代表工具列表（英文行）
5. 中文简介 `共 **<总数> 个高频工具**`
6. `93 个工具、错误提示…` 双语特性行
7. `### <分类>（<分类数>）` 小节标题 + 该节中文工具名顿号列表（按拼音序插入）
8. 目录树注释 `# <总数> 个工具组件`

---

## 2. 验证（提交前必须全绿）

```bash
npx tsc -b                      # exit 0（证书 warning 可忽略）
npx vitest run                  # 全绿；当前基线 61 文件 / 595+ 用例
```

浏览器冒烟（UI 改动必做，dev server 通常已在 `http://localhost:5173`）：

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/   # 200，否则自行 npm run dev
```

用 playwright-core（`/tmp/webtool-smoke/node_modules`，headless shell 见该目录旧脚本）打开 `/tools/<id>/`：确认渲染、点「生成/转换」、切国家等交互，截图肉眼看版式。

---

## 3. 提交与推送约定

1. `git status` 审查：**本仓库可能有其他会话并发编辑**。只 `git add` 本次任务涉及的文件，禁止 `git add -A`。若发现不属于本任务的未提交改动，保持原样不要提交。
2. commit message：英文单行、动词开头（例：`Add virtual bank card and multi-country address generators`）。移除功能单独一个 commit（例：`Remove XML comment capture and field mapping options`）。
3. 推送走代理（直连 github.com 会失败）：

```bash
git -c http.proxy=http://127.0.0.1:7890 push origin main
```

4. 部署验证（GitHub Pages，Actions 约 1–2 分钟）：

```bash
export HTTPS_PROXY=http://127.0.0.1:7890
gh run list --limit 1 && gh run watch <id> --exit-status
curl -s --proxy http://127.0.0.1:7890 https://yuchuanhui3.github.io/devtoolbox/tools/<id>/ | grep -o "<title>[^<]*</title>"
```

线上 title 应显示「在线<中文名>工具 · DevToolbox」。

---

## 4. 已知坑速查

| 坑 | 对策 |
|---|---|
| 守卫测试：缺 `nameEn`/`descriptionEn` | 注册条目两字段必填 |
| 守卫测试：中文名首字未登记拼音 | `CJK_INITIAL_PINYIN` 加首字 |
| 新工具没进侧栏/搜索/sitemap | 检查步骤 3、4 是否都做了（routes 自动派生自 TOOLS） |
| `Select` 无原生 option（自动化脚本选不中） | 用 `role=combobox` 点击展开 + `getByRole('option')` |
| fast-xml-parser `commentPropName: 'remark'` 会让真实 `<remark>` 标签报 Invalid tag | 用前检测输入含同名标签则降级关闭 |
| 每次 build 的 asset hash 都变 | `__BUILD_TIME__` define 内嵌所致，属正常，勿做 bundle diff 校验 |
| 直连 push/gh 超时 | 一律走 `http://127.0.0.1:7890` 代理 |
| 测试输出含 NUL 乱码 | `npx vitest run 2>&1 | tr -d '\000' | grep -a …` |
