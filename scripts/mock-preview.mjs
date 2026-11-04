import { CORS_HEADERS, matchRoute, parseConfig, renderBody } from '../workers/api-mock/src/mock-core.js';

export const MOCK_PATH_PREFIX = '/__mock';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 与 workers/api-mock/src/index.js 同样的分流，只是落成 Node middleware。 */
export function createMockMiddleware(configRaw) {
  let config;
  try {
    config = parseConfig(configRaw);
  } catch {
    config = { name: 'invalid', routes: [] };
  }

  return async function mockMiddleware(req, res, next) {
    const rawPath = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (!rawPath.startsWith(MOCK_PATH_PREFIX)) {
      next();
      return;
    }
    if (config.name === 'invalid') {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS });
      res.end('{"error":"MOCK_PREVIEW_CONFIG is not valid JSON"}');
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    const requestPath = rawPath.slice(MOCK_PATH_PREFIX.length) || '/';
    const hit = matchRoute(config.routes, req.method ?? 'GET', requestPath);
    if (!hit) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS });
      res.end(JSON.stringify({ error: 'no-mock-route', hint: `api-mock「${config.name}」有 ${config.routes.length} 条路由，均未匹配 ${req.method} ${requestPath}` }));
      return;
    }
    const delay = Math.max(0, Math.round(hit.route.delayMs ?? 0));
    if (delay > 0) await sleep(delay);
    const headers = { ...CORS_HEADERS };
    for (const [key, value] of hit.route.headers ?? []) {
      if (String(key).trim()) headers[String(key).toLowerCase()] = String(value);
    }
    if (!headers['content-type']) headers['content-type'] = 'application/json; charset=utf-8';
    res.writeHead(hit.route.status ?? 200, headers);
    res.end(renderBody(hit.route.body ?? '', hit.params, Date.now()));
  };
}
