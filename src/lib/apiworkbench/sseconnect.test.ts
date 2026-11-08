import { describe, expect, test } from 'vitest';
import { countSseEvents, matchSseEventFilter, normalizeSseConfig, sseLogText, sseRetryDelay, type SseLogEvent } from './sseconnect';
import { ToolError } from '../errors';

const event = (over: Partial<SseLogEvent> = {}): SseLogEvent => ({
  time: '12:00:00',
  direction: 'in',
  event: 'message',
  text: 'hello',
  at: 1,
  ...over,
});

describe('normalizeSseConfig', () => {
  test('接受 http/https 地址并归一头部', () => {
    const result = normalizeSseConfig(
      { url: 'https://example.com/stream', headers: [{ key: 'Authorization', value: 'Bearer {{token}}', enabled: true }, { key: 'X-Debug', value: '1', enabled: false }] },
      { token: 'abc' },
    );
    expect(result.config.url).toBe('https://example.com/stream');
    expect(result.config.headers).toEqual([{ key: 'Authorization', value: 'Bearer abc' }]);
    expect(result.config.reconnect).toBe(true);
    expect(result.missing).toEqual([]);
  });

  test('变量缺失时 missing 非空但地址仍可归一；头部值缺失变量也列入 missing', () => {
    const result = normalizeSseConfig({ url: 'https://{{host}}/stream' }, {});
    expect(result.missing).toEqual(['host']);
    const withHeader = normalizeSseConfig({ url: 'https://a.dev/s', headers: [{ key: 'Authorization', value: 'Bearer {{token}}', enabled: true }] }, {});
    expect(withHeader.missing).toEqual(['token']);
    expect(withHeader.config.headers).toEqual([{ key: 'Authorization', value: 'Bearer {{token}}' }]);
  });

  test('空地址报错', () => {
    expect(() => normalizeSseConfig({ url: '  ' }, {})).toThrow(ToolError);
  });

  test('拒绝 ws:// 与含空格地址', () => {
    expect(() => normalizeSseConfig({ url: 'ws://example.com' }, {})).toThrow(ToolError);
    expect(() => normalizeSseConfig({ url: 'https://exa mple.com' }, {})).toThrow(ToolError);
  });

  test('重连间隔基数被夹紧到 [500, 30000]', () => {
    const low = normalizeSseConfig({ url: 'https://a.dev/s', retryBaseMs: 10 }, {});
    expect(low.config.retryBaseMs).toBe(500);
    const high = normalizeSseConfig({ url: 'https://a.dev/s', retryBaseMs: 999999 }, {});
    expect(high.config.retryBaseMs).toBe(30_000);
  });
});

describe('sseRetryDelay', () => {
  test('指数退避且封顶', () => {
    expect(sseRetryDelay(1, 1000)).toBe(1000);
    expect(sseRetryDelay(2, 1000)).toBe(2000);
    expect(sseRetryDelay(3, 1000)).toBe(4000);
    expect(sseRetryDelay(10, 1000)).toBe(30_000);
  });
});

describe('matchSseEventFilter', () => {
  test('空过滤器不过滤；非空时大小写敏感精确匹配', () => {
    expect(matchSseEventFilter('update', [])).toBe(true);
    expect(matchSseEventFilter('update', ['update'])).toBe(true);
    expect(matchSseEventFilter('update', ['UPDATE'])).toBe(false);
    expect(matchSseEventFilter('update', ['tick'])).toBe(false);
  });
});

describe('countSseEvents 与 sseLogText', () => {
  test('received 只计 in 方向事件，bytesIn 按 UTF-8 计', () => {
    const events = [event({ text: 'ab' }), event({ direction: 'sys', text: 'connected' }), event({ text: 'cd' })];
    const stats = countSseEvents(events);
    expect(stats.received).toBe(2);
    expect(stats.bytesIn).toBe(4);
    expect(stats.lastEventAt).not.toBeNull();
  });

  test('日志行带方向标记与事件类型', () => {
    const events = [event({ event: 'tick', text: '1' }), event({ direction: 'sys', text: 'reconnected' })];
    const text = sseLogText(events);
    expect(text).toContain('IN (tick) 1');
    expect(text).toContain('SYS reconnected');
  });
});

describe('matchSseEventFilter 已覆盖于上文', () => {
  test('占位（防空文件）', () => {
    expect(matchSseEventFilter('x', [])).toBe(true);
  });
});
