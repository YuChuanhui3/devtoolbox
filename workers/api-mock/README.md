# api-mock

把「API 工作台」Mock 页签导出的快照部署成自己的假后端：浏览器之外的程序（本机脚本、同事的前端、CI）也能访问它。
应用本身仍零后端——这个 Worker 是用户自选的可选部署，不部署就只是工作台内的本地拦截。

## 三步部署

1. 打开 工具 → API 工作台 → Mock 页签，配好路由后点「复制快照」或「下载 JSON」（快照只含启用的路由）。
2. 把快照压成单行，粘贴进本目录 `wrangler.toml` 的 `[vars] MOCK_CONFIG = '…'`（外层单引号，内部单引号写成 `'\''`；直接粘贴下载的文件内容再手动去换行也可以）。
3. 部署：

   ```bash
   cd workers/api-mock
   npx wrangler login   # 首次
   npx wrangler deploy
   ```

   得到 `https://api-mock.<account>.workers.dev`，之后 `curl https://…/users/42` 即命中 `GET /users/:id`。

## 行为口径

- 匹配规则与工作台本地拦截同一套算法（`src/mock-core.js`，由 `src/lib/apiworkbench/mock-parity.test.ts` 对照防漂移）：
  分段打分 静态段 3 / `:param` 2 / `*` 1，平分取快照中先声明者；method 精确优先，`*` 兜底。
- 全量 CORS：任意来源可跨域访问，`OPTIONS` 预检固定 204。
- 未命中返回 404 JSON（`no-mock-route`，附路由条数提示），不会 500。
- 模板：响应体支持 `{{params.x}}`、`{{$uuid}}`、`{{$timestamp}}`、`{{$randomInt(a,b)}}`。
- `delayMs` 在 Worker 侧同样生效（挂起响应用，注意 Workers 免费档请求时长限制）。

## 本地预览（不装 wrangler 也能验证同一逻辑）

dev server 启动后访问 `http://localhost:5173/__mock/users/42`。默认内置一条演示路由；要验证自己的快照：

```bash
MOCK_PREVIEW_CONFIG="$(cat api-mock-snapshot.json | tr -d '\n')" npm run dev
# 或把快照存为项目根目录 mock-snapshot.json
```

## 安全提醒

快照会原样进入 Worker 配置（明文）。不要把真实 token、密钥写进 mock 响应体或请求头示例里；
MOCK_CONFIG 对所有能访问该 Worker URL 的人可见，建议只在测试期使用，用完 `npx wrangler delete`。
