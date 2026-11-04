/**
 * api-mock：把 API 工作台导出的 mock 快照部署成真实的假后端，供本机浏览器之外的程序访问。
 * 快照来源：工作台 mock 页签 → 导出快照（只含启用路由）。
 *
 * 部署：
 *   1. 在 mock 页签复制快照 JSON；
 *   2. 粘贴进 wrangler.toml 的 [vars] MOCK_CONFIG（保持单行）；
 *   3. cd workers/api-mock && npx wrangler deploy
 *
 * 本地预览（同一份核心逻辑）：dev server 起好后访问 http://localhost:5173/__mock/<路径>。
 */
import { CORS_HEADERS, matchRoute, parseConfig, renderBody } from './mock-core.js';

function jsonResponse(body, status, headers) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...headers },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    let config;
    try {
      config = parseConfig(env.MOCK_CONFIG);
    } catch {
      return jsonResponse('{"error":"MOCK_CONFIG is not valid JSON"}', 500);
    }
    const hit = matchRoute(config.routes, request.method, url.pathname);
    if (!hit) {
      return jsonResponse(
        JSON.stringify({
          error: 'no-mock-route',
          hint: `api-mock「${config.name}」有 ${config.routes.length} 条路由，均未匹配 ${request.method} ${url.pathname}`,
        }),
        404,
      );
    }
    const delay = Math.max(0, Math.round(hit.route.delayMs ?? 0));
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const headers = {};
    for (const [key, value] of hit.route.headers ?? []) {
      if (String(key).trim()) headers[String(key).toLowerCase()] = String(value);
    }
    if (!headers['content-type']) headers['content-type'] = 'application/json; charset=utf-8';
    return jsonResponse(renderBody(hit.route.body ?? '', hit.params, Date.now()), hit.route.status ?? 200, headers);
  },
};
