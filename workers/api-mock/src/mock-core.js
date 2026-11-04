/**
 * api-mock 的匹配/渲染核心，Workers 与 Node 预览共用一份，防止双实现漂移。
 * 算法与 src/lib/apiworkbench/mock.ts + vars.ts 对齐，改动后跑
 * src/lib/apiworkbench/mock-parity.test.ts 对照。
 */

const TOKEN_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

const HEX = '0123456789abcdef';

function randomHex(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += HEX[Math.floor(Math.random() * 16) % 16];
  return out;
}

function uuid() {
  const seq = randomHex(32).split('');
  seq[12] = '4';
  seq[16] = HEX[(parseInt(seq[16], 16) & 0b1011) | 0b1000];
  const s = seq.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function builtinValue(token, now) {
  if (!token.startsWith('$')) return null;
  if (token === '$uuid') return uuid();
  if (token === '$timestamp') return String(now);
  const randomInt = token.match(/^\$randomInt\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/);
  if (randomInt) {
    const lo = BigInt(randomInt[1]);
    const hi = BigInt(randomInt[2]);
    const [min, max] = lo <= hi ? [lo, hi] : [hi, lo];
    const span = max - min + 1n;
    const raw = BigInt(`0x${randomHex(12)}`);
    return String(min + (raw % (span > 0n ? span : 1n)));
  }
  return '';
}

export function interpolate(text, scope, now) {
  return text.replace(TOKEN_PATTERN, (whole, rawToken) => {
    const token = String(rawToken).trim();
    const builtin = builtinValue(token, now);
    if (builtin !== null) return builtin;
    return Object.prototype.hasOwnProperty.call(scope, token) ? scope[token] : whole;
  });
}

export function renderBody(body, params, now) {
  const scope = {};
  for (const key of Object.keys(params)) scope[`params.${key}`] = params[key];
  return interpolate(body, scope, now ?? Date.now());
}

export function pathSegments(path) {
  const beforeQuery = String(path).split('?')[0].split('#')[0];
  const trimmed = beforeQuery.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed ? trimmed.split('/') : [];
}

function scoreSegments(routeSegs, requestSegs, decode) {
  const params = {};
  let score = 0;
  for (let i = 0; i < routeSegs.length; i += 1) {
    const seg = routeSegs[i];
    if (seg === '*') {
      score += 1;
      continue;
    }
    const value = requestSegs[i];
    if (value === undefined) return null;
    if (seg.startsWith(':')) {
      try {
        params[seg.slice(1)] = decode(value);
      } catch {
        params[seg.slice(1)] = value;
      }
      score += 2;
      continue;
    }
    if (seg !== value) return null;
    score += 3;
  }
  if (requestSegs.length - routeSegs.length <= 0) return { score, params };
  return routeSegs.includes('*') ? { score, params } : null;
}

/** method 精确优先、'*' 兜底；静态 3 / :param 2 / * 1 打分，平分取先声明。 */
export function matchRoute(routes, method, pathname, decode = decodeURIComponent) {
  const segs = pathSegments(pathname);
  const wanted = String(method).toUpperCase();
  let best = null;
  let bestAny = null;
  for (const route of routes) {
    if (!route || route.enabled === false) continue;
    const isExact = route.method === wanted;
    if (!isExact && route.method !== '*') continue;
    const scored = scoreSegments(pathSegments(route.path), segs, decode);
    if (!scored) continue;
    if (isExact) {
      if (!best || scored.score > best.score) best = { route, params: scored.params, score: scored.score };
    } else if (!bestAny || scored.score > bestAny.score) {
      bestAny = { route, params: scored.params, score: scored.score };
    }
  }
  const winner = best ?? bestAny;
  return winner ? { route: winner.route, params: winner.params } : null;
}

/** 快照（parseMockSnapshot 的输出）或裸路由数组都能吃；快照里的路由默认全部启用。 */
export function parseConfig(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { name: 'mock', routes: [] };
  const parsed = JSON.parse(raw);
  const routes = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.routes) ? parsed.routes : [];
  return { name: typeof parsed?.name === 'string' ? parsed.name : 'mock', routes };
}

export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,PATCH,HEAD,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-max-age': '86400',
};
