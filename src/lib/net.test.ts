import { afterEach, describe, expect, test, vi } from 'vitest';
import { tl, type Localized } from '@/i18n/locale';
import {
  allOriginsGet,
  dnsResolve,
  dohTypeCode,
  dohTypeName,
  fetchJson,
  grabHtml,
  proxiedUrl,
  proxyFetch,
} from './net';

afterEach(() => {
  vi.unstubAllGlobals();
});

const response = (init: { status?: number; body?: string; headers?: Record<string, string>; ok?: boolean }) =>
  new Response(init.body ?? '', {
    status: init.status ?? 200,
    headers: init.headers,
  });

describe('proxiedUrl', () => {
  test('wraps target per mode', () => {
    const target = 'https://ex.cn/a?b=1';
    expect(proxiedUrl(target, 'direct')).toBe(target);
    expect(proxiedUrl(target, 'corsproxy')).toBe(`https://corsproxy.io/?url=${encodeURIComponent(target)}`);
    expect(proxiedUrl(target, 'allorigins')).toContain('api.allorigins.win/raw');
  });
});

describe('doh helpers', () => {
  test('type code mapping', () => {
    expect(dohTypeCode('a')).toBe('1');
    expect(dohTypeCode('TXT')).toBe('16');
    expect(() => dohTypeCode('BOGUS')).toThrow('不支持的记录类型');
    expect(dohTypeName(16)).toBe('TXT');
    expect(dohTypeName(999)).toBe('TYPE999');
  });
});

describe('fetchJson', () => {
  test('returns parsed json', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ body: JSON.stringify({ ok: 1 }) })));
    await expect(fetchJson('https://api')).resolves.toEqual({ ok: 1 });
  });

  test('throws ToolError on bad status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ status: 503 })));
    await expect(fetchJson('https://api')).rejects.toThrow('接口返回 503');
  });

  test('wraps network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('boom');
    }));
    await expect(fetchJson('https://api')).rejects.toThrow('请求失败：boom');
  });
});

describe('proxyFetch', () => {
  test('collects headers and text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ status: 201, body: 'hello', headers: { 'X-A': 'b' } })),
    );
    const result = await proxyFetch('https://ex.cn', { mode: 'corsproxy' });
    expect(result.status).toBe(201);
    expect(result.ok).toBe(true);
    expect(result.text).toBe('hello');
    expect(result.bytes).toBe(5);
    expect(result.headers).toContainEqual(['x-a', 'b']);
  });

  test('maps abort to timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    }));
    await expect(proxyFetch('https://ex.cn', { mode: 'direct' })).rejects.toThrow('请求超时');
  });

  test('hints proxy switch on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    const error = await proxyFetch('https://ex.cn', { mode: 'direct' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(tl((error as { hint?: Localized }).hint!, 'zh')).toContain('CORS');
  });
});

describe('allOriginsGet', () => {
  test('valid payload', async () => {
    const payload = { contents: 'hi', status: { url: 'u', content_type: 't', http_code: 200, response_time: 1, content_length: 2 } };
    vi.stubGlobal('fetch', vi.fn(async () => response({ body: JSON.stringify(payload) })));
    await expect(allOriginsGet('https://ex.cn')).resolves.toEqual(payload);
  });

  test('bad payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ body: JSON.stringify({}) })));
    await expect(allOriginsGet('https://ex.cn')).rejects.toThrow('allorigins 返回数据异常');
  });
});

describe('grabHtml', () => {
  const okPayload = JSON.stringify({
    contents: 'via get',
    status: { url: 'u', content_type: 'text/html', http_code: 200, response_time: 1, content_length: 8 },
  });

  test('passes through raw fetch success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ body: '<h1>hi</h1>' })));
    await expect(grabHtml('https://ex.cn', 'corsproxy')).resolves.toBe('<h1>hi</h1>');
  });

  test('falls back to /get when allorigins raw fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes('/raw')) throw new TypeError('Failed to fetch');
        return response({ body: okPayload });
      }),
    );
    await expect(grabHtml('https://ex.cn', 'allorigins')).resolves.toBe('via get');
  });

  test('rethrows raw error when fallback also fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('down');
    }));
    await expect(grabHtml('https://ex.cn', 'allorigins')).rejects.toThrow('请求失败：down');
  });

  test('no fallback for direct mode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('blocked');
    }));
    await expect(grabHtml('https://ex.cn', 'direct')).rejects.toThrow('请求失败：blocked');
  });
});

describe('dnsResolve', () => {
  test('builds cloudflare query', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      response({ body: JSON.stringify({ Status: 0, Answer: [] }) }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await dnsResolve('example.com.', 'A');
    expect(result.Status).toBe(0);
    expect(fetchMock.mock.calls[0][0]).toBe('https://cloudflare-dns.com/dns-query?name=example.com&type=A');
    await expect(dnsResolve('  ', 'A')).rejects.toThrow('请输入域名');
  });
});
