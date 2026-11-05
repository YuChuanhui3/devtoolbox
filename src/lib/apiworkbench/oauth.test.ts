import { describe, expect, test } from 'vitest';
import { ToolError } from '../errors';
import type { TimedResponse } from '../net';
import {
  beginAuthCode,
  buildAuthorizeUrl,
  clearPendingAuth,
  completeAuthCode,
  createPkce,
  fetchToken,
  loadPendingAuth,
  randomVerifier,
  readRedirect,
  sha256Base64Url,
  stripAuthParams,
  toToken,
  tokenForm,
} from './oauth';

/** RFC 7636 附录 B 的已知答案。 */
const SPEC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const SPEC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('PKCE', () => {
  test('S256 与规范示例一致', async () => {
    await expect(sha256Base64Url(SPEC_VERIFIER)).resolves.toBe(SPEC_CHALLENGE);
  });

  test('verifier 长度与字符集符合 RFC 7636', () => {
    const verifier = randomVerifier();
    expect(verifier).toHaveLength(64);
    expect(verifier).toMatch(/^[A-Za-z0-9-_]+$/);
    expect(randomVerifier()).not.toBe(randomVerifier());
  });

  test('createPkce 成对返回且 method 固定 S256', async () => {
    const pair = await createPkce();
    expect(pair.method).toBe('S256');
    expect(await sha256Base64Url(pair.verifier)).toBe(pair.challenge);
  });
});

describe('授权 URL 与回调', () => {
  test('授权 URL 带上 PKCE 与 state，scope 空则不写', () => {
    const url = buildAuthorizeUrl({
      authUrl: 'https://idp.test/authorize',
      clientId: 'cid',
      redirectUri: 'https://app.test/#/tools/http-simulator',
      state: 'st',
      challenge: 'ch',
      scope: '  read write ',
    });
    expect(url.startsWith('https://idp.test/authorize?')).toBe(true);
    expect(url).toContain('response_type=code');
    expect(url).toContain('code_challenge=ch');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('scope=read%20write');
    const bare = buildAuthorizeUrl({ authUrl: 'https://idp.test/authorize?a=1', clientId: 'cid', redirectUri: 'r', state: 's', challenge: 'c', scope: '   ' });
    expect(bare).toContain('https://idp.test/authorize?a=1&response_type=code');
    expect(bare).not.toContain('scope=');
  });

  test('HashRouter 下 code 落在 hash 里也能取到', () => {
    expect(readRedirect('', '#/tools/http-simulator?mode=request&code=abc&state=st')).toEqual({ code: 'abc', state: 'st' });
    expect(readRedirect('?code=abc&state=st', '#/tools/http-simulator')).toEqual({ code: 'abc', state: 'st' });
  });

  test('错误回调用 error 与描述，解码百分号', () => {
    expect(readRedirect('?error=access_denied&error_description=user%20refused', '')).toEqual({ error: 'access_denied', description: 'user refused' });
  });

  test('没有 code 也没有 error 时返回空对象', () => {
    expect(readRedirect('', '#/tools/http-simulator')).toEqual({});
    expect(readRedirect('?lang=zh', '')).toEqual({});
  });
});

describe('取令牌表单', () => {
  test('client_credentials 只带 client 与 scope', () => {
    expect(tokenForm({ grantType: 'client_credentials', clientId: 'cid', clientSecret: 'sec', scope: 'read' })).toEqual({
      grant_type: 'client_credentials',
      client_id: 'cid',
      client_secret: 'sec',
      scope: 'read',
    });
  });

  test('空密钥与空 scope 不写出', () => {
    expect(tokenForm({ grantType: 'client_credentials', clientId: 'cid', clientSecret: '', scope: '  ' })).toEqual({
      grant_type: 'client_credentials',
      client_id: 'cid',
    });
  });

  test('password 带用户名密码', () => {
    expect(tokenForm({ grantType: 'password', clientId: 'cid', username: 'u', password: 'p' })).toMatchObject({ username: 'u', password: 'p' });
  });

  test('authorization_code 带 code/verifier/redirect_uri', () => {
    expect(tokenForm({ grantType: 'authorization_code', clientId: 'cid', code: 'c1', codeVerifier: 'v1', redirectUri: 'https://app.test/cb' })).toMatchObject({
      grant_type: 'authorization_code',
      code: 'c1',
      code_verifier: 'v1',
      redirect_uri: 'https://app.test/cb',
    });
  });
});

describe('toToken / fetchToken', () => {
  test('access_token 缺省 token_type 为 Bearer，expires_in 折成绝对时间', () => {
    expect(toToken({ access_token: 'at', expires_in: 60 }, 1_000)).toEqual({ accessToken: 'at', tokenType: 'Bearer', expiresIn: 60, expiresAt: 61_000 });
    expect(toToken({ access_token: 'at', token_type: 'MAC' }, 0).tokenType).toBe('MAC');
    expect(toToken({ access_token: 'at', scope: 'read write' }, 0).scope).toBe('read write');
    expect(toToken({ access_token: 'at', expires_in: 'nope' }, 0)).toEqual({ accessToken: 'at', tokenType: 'Bearer' });
  });

  test('没有 access_token 就把服务端的 error 抛出来', () => {
    expect(() => toToken({ error: 'invalid_client', error_description: 'bad secret' }, 0)).toThrow(/invalid_client/);
    expect(() => toToken({}, 0)).toThrow(/no_access_token/);
    try {
      toToken({ error: 'x' }, 0);
    } catch (caught) {
      expect(caught).toBeInstanceOf(ToolError);
    }
  });

  test('走注入的 transport，body 是 x-www-form-urlencoded', async () => {
    const seen: { url: string; init: unknown }[] = [];
    const token = await fetchToken(
      '{{idp}}/token',
      { grantType: 'client_credentials', clientId: 'cid', scope: 'read' },
      {
        scope: { idp: 'https://idp.test' },
        now: () => 5_000,
        transport: async (url, init) => {
          seen.push({ url, init });
          return { status: 200, ok: true, headers: [], text: '{"access_token":"tok","expires_in":10}', bytes: 1, ms: 1 };
        },
      },
    );
    expect(seen[0].url).toBe('https://idp.test/token');
    expect(token).toEqual({ accessToken: 'tok', tokenType: 'Bearer', expiresIn: 10, expiresAt: 15_000 });
    const body = new URLSearchParams((seen[0].init as { body: string }).body);
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('scope')).toBe('read');
  });

  test('非 http(s) 的 Token URL 与非法 JSON 都被拦下', async () => {
    await expect(fetchToken('idp.test/token', { grantType: 'client_credentials', clientId: 'c' }, { scope: {} })).rejects.toBeInstanceOf(ToolError);
    await expect(
      fetchToken(
        'https://idp.test/token',
        { grantType: 'client_credentials', clientId: 'c' },
        {
          scope: {},
          transport: async () => ({ status: 502, ok: false, headers: [], text: '<html>bad gateway</html>', bytes: 1, ms: 1 }),
        },
      ),
    ).rejects.toThrow(/http_502/);
  });
});

function fakeStore() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    dump: map,
  };
}

const okJson = (text: string): TimedResponse => ({ status: 200, ok: true, headers: [], text, bytes: text.length, ms: 1 });

describe('授权码回跳', () => {
  const base = {
    requestId: 'r1',
    authUrl: 'https://idp.test/authorize',
    tokenUrl: 'https://idp.test/token',
    clientId: 'cid',
    redirectUri: 'https://app.test/#/tools/http-simulator',
  };

  test('beginAuthCode 记下 verifier/state 并导出 S256 授权 URL', async () => {
    const store = fakeStore();
    const url = await beginAuthCode(base, store);
    expect(url).toContain('code_challenge_method=S256');
    const pending = loadPendingAuth(store);
    expect(pending?.requestId).toBe('r1');
    expect(pending?.verifier).toHaveLength(64);
    expect(await sha256Base64Url(pending!.verifier)).toBe(new URLSearchParams(url.split('?')[1]).get('code_challenge'));
    expect(new URLSearchParams(url.split('?')[1]).get('state')).toBe(pending?.state);
  });

  test('坏 URL 与无 sessionStorage 都拒绝开始授权', async () => {
    await expect(beginAuthCode({ ...base, authUrl: 'idp.test/authorize' }, fakeStore())).rejects.toBeInstanceOf(ToolError);
    await expect(beginAuthCode(base, null)).rejects.toThrow(/授权中间态/);
  });

  test('state 匹配则换取令牌并清掉中间态', async () => {
    const store = fakeStore();
    const url = await beginAuthCode(base, store);
    const pending = loadPendingAuth(store)!;
    const state = pending.state;
    expect(new URLSearchParams(url.split('?')[1]).get('state')).toBe(state);
    expect(new URLSearchParams(url.split('?')[1]).get('redirect_uri')).toBe(base.redirectUri);
    const seen: string[] = [];
    const result = await completeAuthCode(
      `?code=c1&state=${state}`,
      '',
      {
        scope: {},
        now: () => 90_000,
        transport: async (target, init) => {
          seen.push(`${target}?${new URLSearchParams(init.body).get('grant_type')}`);
          return okJson('{"access_token":"at","expires_in":30}');
        },
      },
      store,
    );
    expect(result).toEqual({
      kind: 'token',
      requestId: 'r1',
      token: { accessToken: 'at', tokenType: 'Bearer', expiresIn: 30, expiresAt: 120_000 },
    });
    expect(seen).toEqual(['https://idp.test/token?authorization_code']);
    expect(loadPendingAuth(store)).toBeNull();
  });

  test('state 不匹配就丢弃授权码', async () => {
    const store = fakeStore();
    await beginAuthCode(base, store);
    const result = await completeAuthCode('?code=c1&state=forged', '', { scope: {}, transport: async () => okJson('{}') }, store);
    expect(result.kind).toBe('error');
    expect(loadPendingAuth(store)).toBeNull();
  });

  test('授权被拒时带回 error 文案', async () => {
    const store = fakeStore();
    await beginAuthCode(base, store);
    const result = await completeAuthCode('', '#/tools/http-simulator?error=access_denied&state=whatever', { scope: {}, transport: async () => okJson('{}') }, store);
    expect(result.kind === 'error' ? result.message.zh : '').toContain('access_denied');
  });

  test('还没回跳（无 code 无 error）时保留中间态', async () => {
    const store = fakeStore();
    await beginAuthCode(base, store);
    expect(await completeAuthCode('', '#/tools/http-simulator', { scope: {} }, store)).toEqual({ kind: 'none' });
    expect(loadPendingAuth(store)?.requestId).toBe('r1');
  });

  test('没有中间态时什么都不做', async () => {
    const store = fakeStore();
    await beginAuthCode(base, store);
    clearPendingAuth(store);
    expect(await completeAuthCode('?code=c1&state=s', '', { scope: {} }, store)).toEqual({ kind: 'none' });
  });

  test('中间态脏数据读不出来就当没有', () => {
    const store = fakeStore();
    store.setItem('devtoolbox-oauth-pending', '{oops');
    expect(loadPendingAuth(store)).toBeNull();
    store.setItem('devtoolbox-oauth-pending', JSON.stringify({ verifier: 'v' }));
    expect(loadPendingAuth(store)).toBeNull();
  });

  test('地址栏里的一次性参数会被抹掉，路由参数留着', () => {
    expect(stripAuthParams('https://app.test/#/tools/http-simulator?mode=request&code=c&state=s')).toBe('https://app.test/#/tools/http-simulator?mode=request');
    expect(stripAuthParams('https://app.test/callback?code=c&state=s&lang=zh')).toBe('https://app.test/callback?lang=zh');
    expect(stripAuthParams('not a url')).toBe('not a url');
  });
});
