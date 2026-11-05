import { ToolError } from '../errors';
import { proxyFetch, type TimedResponse } from '../net';
import type { L10n } from '@/i18n/locale';
import { interpolate } from './vars';

/**
 * OAuth 2.0 客户端侧的纯逻辑：PKCE、授权 URL、回调解析、取令牌表单。
 *
 * 硬边界说清楚：
 * - 取令牌是一次真实的跨域请求，只有目标授权服务器允许 CORS 时才成；
 * - 授权码模式要求 IdP 白名单 redirect_uri，而离线单文件包跑在 `file://` 上，没有可用的回调地址，
 *   所以那条路只在部署后的站点上成立。
 */

export interface OAuthToken {
  accessToken: string;
  tokenType: string;
  /** 秒。 */
  expiresIn?: number;
  /** 绝对毫秒时间点。 */
  expiresAt?: number;
  scope?: string;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export type OAuthGrant = 'client_credentials' | 'password' | 'authorization_code';

export interface TokenFormInput {
  grantType: OAuthGrant;
  clientId: string;
  clientSecret?: string;
  scope?: string;
  username?: string;
  password?: string;
  code?: string;
  codeVerifier?: string;
  redirectUri?: string;
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** RFC 7636 要求 43–128 字符的 code_verifier；优先用 crypto 的随机字节。 */
export function randomVerifier(length = 64): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (const byte of bytes) out += BASE64URL[byte % 64];
  return out;
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 + base64url，即 PKCE 的 S256。缺 crypto.subtle 时报错而不是退化成 plain。 */
export async function sha256Base64Url(text: string): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle?.digest) {
    throw new ToolError(
      { zh: '当前环境没有 WebCrypto，无法做 PKCE', en: 'This browser has no WebCrypto, so PKCE is unavailable' },
      { zh: '请用现代浏览器打开部署后的站点；离线包只支持免授权的取令牌方式', en: 'Use a modern browser on the hosted site; the offline package supports only the grants that need no redirect' },
    );
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toBase64Url(digest);
}

export async function createPkce(): Promise<PkcePair> {
  const verifier = randomVerifier();
  return { verifier, challenge: await sha256Base64Url(verifier), method: 'S256' };
}

export interface AuthorizeUrlInput {
  authUrl: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state: string;
  challenge: string;
}

/**
 * 表单序列化。查询串里用 %20 而不是 +：RFC 6749 的 query ABNF 把 `+` 当普通字符，
 * 有些授权服务器会把 `scope=a+b` 读成字面量加号；%20 两种解码算法都认。
 */
function formEncode(pairs: [string, string][]): string {
  return pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
}

export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  const params: [string, string][] = [
    ['response_type', 'code'],
    ['client_id', input.clientId],
    ['redirect_uri', input.redirectUri],
    ['state', input.state],
    ['code_challenge', input.challenge],
    ['code_challenge_method', 'S256'],
  ];
  if (input.scope?.trim()) params.push(['scope', input.scope.trim()]);
  const joiner = input.authUrl.includes('?') ? '&' : '?';
  return `${input.authUrl}${joiner}${formEncode(params)}`;
}

export interface RedirectOutcome {
  code?: string;
  state?: string;
  error?: string;
  description?: string;
}

/**
 * 从回调地址里取授权码。HashRouter 下 code 落在 `#/tools/...?code=…`，
 * 所以 search 与 hash 都要扫一遍；先出现的 key 生效。
 */
export function readRedirect(query: string, hash: string): RedirectOutcome {
  const collect = (raw: string): Record<string, string> => {
    const at = raw.indexOf('?');
    const out: Record<string, string> = {};
    for (const segment of (at < 0 ? raw : raw.slice(at + 1)).split('&')) {
      if (!segment || segment.startsWith('/')) continue;
      const eq = segment.indexOf('=');
      const key = decodeURIComponent(eq < 0 ? segment : segment.slice(0, eq));
      if (!key || key in out) continue;
      out[key] = eq < 0 ? '' : decodeURIComponent(segment.slice(eq + 1));
    }
    return out;
  };
  const merged = { ...collect(hash ?? ''), ...collect(query ?? '') };
  const outcome: RedirectOutcome = {};
  if (merged.code) outcome.code = merged.code;
  if (merged.error) outcome.error = merged.error;
  if (merged.error_description) outcome.description = merged.error_description;
  if (merged.state) outcome.state = merged.state;
  return outcome;
}

/** 取令牌用的表单参数，纯函数便于单测断言。 */
export function tokenForm(input: TokenFormInput): Record<string, string> {
  const form: Record<string, string> = {
    grant_type: input.grantType,
    client_id: input.clientId,
  };
  if (input.clientSecret) form.client_secret = input.clientSecret;
  if (input.scope?.trim()) form.scope = input.scope.trim();
  if (input.grantType === 'password') {
    form.username = input.username ?? '';
    form.password = input.password ?? '';
  }
  if (input.grantType === 'authorization_code') {
    form.code = input.code ?? '';
    if (input.codeVerifier) form.code_verifier = input.codeVerifier;
    if (input.redirectUri) form.redirect_uri = input.redirectUri;
  }
  return form;
}

export interface FetchTokenContext {
  scope: Record<string, string>;
  /** 注入以便单测不碰网络。 */
  transport?: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<TimedResponse>;
  now?: () => number;
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 授权服务器返回的 JSON → 令牌；错误响应翻成带原因的工具错误。 */
export function toToken(json: Record<string, unknown>, now: number): OAuthToken {
  const accessToken = typeof json.access_token === 'string' ? json.access_token : '';
  if (!accessToken) {
    const error = typeof json.error === 'string' ? json.error : 'no_access_token';
    const description = typeof json.error_description === 'string' ? json.error_description : '';
    throw new ToolError(
      { zh: `获取令牌失败：${error}${description ? ` — ${description}` : ''}`, en: `Token request failed: ${error}${description ? ` — ${description}` : ''}` },
      { zh: '检查 client_id/密钥、grant_type、scope 与 redirect_uri 是否与授权服务器一致', en: 'Check the client id/secret, grant_type, scope and redirect_uri against the authorization server' },
    );
  }
  const expiresIn = typeof json.expires_in === 'number' && Number.isFinite(json.expires_in) ? Math.max(0, Math.round(json.expires_in)) : undefined;
  const tokenType = typeof json.token_type === 'string' && json.token_type.trim() ? json.token_type.trim() : 'Bearer';
  return {
    accessToken,
    tokenType,
    ...(expiresIn === undefined ? {} : { expiresIn, expiresAt: now + expiresIn * 1000 }),
    ...(typeof json.scope === 'string' && json.scope ? { scope: json.scope } : {}),
  };
}

/** 直连取令牌；body 是 x-www-form-urlencoded，这是规范要求的形态。 */
export async function fetchToken(tokenUrl: string, input: TokenFormInput, ctx: FetchTokenContext): Promise<OAuthToken> {
  const target = interpolate(tokenUrl, ctx.scope).text;
  if (!/^https?:\/\//i.test(target)) {
    throw new ToolError(
      { zh: 'Token URL 必须是 http(s) 地址', en: 'The token URL must be an http(s) URL' },
      { zh: '例如 https://idp.example.com/oauth/token', en: 'For example https://idp.example.com/oauth/token' },
    );
  }
  const transport = ctx.transport ?? ((url, init) => proxyFetch(url, { mode: 'direct', ...init }));
  const body = formEncode(Object.entries(tokenForm(input)));
  const response = await transport(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const json = parseJson(response.text);
  if (response.status >= 400 && !json.error) json.error = `http_${response.status}`;
  return toToken(json, ctx.now?.() ?? Date.now());
}

/**
 * 抹掉地址栏里的一次性授权参数。code 与 state 留在 URL 上会被复制、被贴进工单，
 * 刷新时还会再走一遍换取令牌。
 */
export function stripAuthParams(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  const once = ['code', 'state', 'error', 'error_description'];
  const clean = (params: URLSearchParams): string => {
    for (const key of once) params.delete(key);
    return params.toString();
  };
  url.search = clean(url.searchParams);
  const at = url.hash.indexOf('?');
  if (at >= 0) {
    const kept = clean(new URLSearchParams(url.hash.slice(at + 1)));
    url.hash = `${url.hash.slice(0, at)}${kept ? `?${kept}` : ''}`;
  }
  return url.toString();
}

/** 授权码流程的中间态：verifier 与 state 必须活过一次整页跳转。 */
export interface PendingAuth {
  requestId: string;
  verifier: string;
  state: string;
  redirectUri: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
}

const PENDING_KEY = 'devtoolbox-oauth-pending';

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function session(): KeyValueStore | null {
  try {
    const store = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    if (!store) return null;
    return {
      getItem: (key) => store.getItem(key),
      setItem: (key, value) => store.setItem(key, value),
      removeItem: (key) => store.removeItem(key),
    };
  } catch {
    // 隐私模式下访问 sessionStorage 本身就会抛。
    return null;
  }
}

export function loadPendingAuth(store: KeyValueStore | null = session()): PendingAuth | null {
  const raw = store?.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingAuth>;
    if (typeof parsed?.verifier !== 'string' || typeof parsed.state !== 'string' || typeof parsed.tokenUrl !== 'string') return null;
    return {
      requestId: typeof parsed.requestId === 'string' ? parsed.requestId : '',
      verifier: parsed.verifier,
      state: parsed.state,
      redirectUri: typeof parsed.redirectUri === 'string' ? parsed.redirectUri : '',
      tokenUrl: parsed.tokenUrl,
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : '',
      ...(typeof parsed.clientSecret === 'string' ? { clientSecret: parsed.clientSecret } : {}),
      ...(typeof parsed.scope === 'string' ? { scope: parsed.scope } : {}),
    };
  } catch {
    return null;
  }
}

export function clearPendingAuth(store: KeyValueStore | null = session()): void {
  try {
    store?.removeItem(PENDING_KEY);
  } catch {
    // 清不掉也不能挡住用户继续操作。
  }
}

export interface BeginAuthInput {
  requestId: string;
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
  redirectUri: string;
}

/**
 * 生成 PKCE 与 state、记下中间态，返回要打开的授权 URL。
 * `file://` 没有合法的 redirect_uri，调用方要先拦住。
 */
export async function beginAuthCode(input: BeginAuthInput, store: KeyValueStore | null = session()): Promise<string> {
  if (!/^https?:\/\//i.test(input.authUrl)) {
    throw new ToolError(
      { zh: 'Authorize URL 必须是 http(s) 地址', en: 'The authorize URL must be an http(s) URL' },
      { zh: '例如 https://idp.example.com/oauth/authorize', en: 'For example https://idp.example.com/oauth/authorize' },
    );
  }
  if (!store) {
    throw new ToolError(
      { zh: '当前浏览器不允许保存授权中间态', en: 'This browser will not hold the authorization state' },
      { zh: '隐私模式禁用了 sessionStorage，授权码流程无法安全地校验 state', en: 'Private mode blocked sessionStorage; the code flow cannot verify state' },
    );
  }
  const pair = await createPkce();
  const state = randomVerifier(32);
  store.setItem(
    PENDING_KEY,
    JSON.stringify({
      requestId: input.requestId,
      verifier: pair.verifier,
      state,
      redirectUri: input.redirectUri,
      tokenUrl: input.tokenUrl,
      clientId: input.clientId,
      ...(input.clientSecret ? { clientSecret: input.clientSecret } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
    } satisfies PendingAuth),
  );
  return buildAuthorizeUrl({
    authUrl: input.authUrl,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    scope: input.scope,
    state,
    challenge: pair.challenge,
  });
}

export type AuthCodeResult =
  | { kind: 'none' }
  | { kind: 'error'; message: L10n }
  | { kind: 'token'; token: OAuthToken; requestId: string };

/**
 * 回到站内后处理回调：校验 state、拿令牌、清中间态。
 * 地址栏里的 code 由调用方抹掉（见 http-toolkit 的返回处理），这里只管结果。
 */
export async function completeAuthCode(
  query: string,
  hash: string,
  ctx: FetchTokenContext,
  store: KeyValueStore | null = session(),
): Promise<AuthCodeResult> {
  const pending = loadPendingAuth(store);
  if (!pending) return { kind: 'none' };
  const redirect = readRedirect(query, hash);
  if (!redirect.code && !redirect.error) {
    // 还没回来（例如中途刷新了页面）：留着中间态，等下一次带 code 的加载。
    return { kind: 'none' };
  }
  clearPendingAuth(store);
  if (redirect.error) {
    return {
      kind: 'error',
      message: {
        zh: `授权被拒绝：${redirect.error}${redirect.description ? ` — ${redirect.description}` : ''}`,
        en: `Authorization denied: ${redirect.error}${redirect.description ? ` — ${redirect.description}` : ''}`,
      },
    };
  }
  if (redirect.state !== pending.state) {
    return {
      kind: 'error',
      message: {
        zh: 'state 与本次授权不匹配，已丢弃这个授权码',
        en: 'state does not match this authorization; the code was discarded',
      },
    };
  }
  const token = await fetchToken(
    pending.tokenUrl,
    {
      grantType: 'authorization_code',
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
      scope: pending.scope,
      code: redirect.code,
      codeVerifier: pending.verifier,
      redirectUri: pending.redirectUri,
    },
    ctx,
  );
  return { kind: 'token', token, requestId: pending.requestId };
}
