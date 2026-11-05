import { describe, expect, test } from 'vitest';
import { tl } from '@/i18n/locale';
import { ToolError } from '../errors';
import {
  appendEvent,
  countEvents,
  describeCloseCode,
  formatPayload,
  MAX_WS_EVENTS,
  normalizeWsUrl,
  parseProtocols,
  reduceSession,
  sessionStats,
  type WsEvent,
} from './ws';

const event = (direction: WsEvent['direction'], text: string, at = 0): WsEvent => ({ time: '00:00:00', direction, text, at });

describe('reduceSession', () => {
  test('覆盖正常与异常生命周期', () => {
    expect(reduceSession('idle', 'connect')).toBe('connecting');
    expect(reduceSession('connecting', 'open')).toBe('open');
    expect(reduceSession('open', 'close-begin')).toBe('closing');
    expect(reduceSession('closing', 'closed')).toBe('closed');
    expect(reduceSession('closed', 'connect')).toBe('connecting');
    expect(reduceSession('closed', 'reset')).toBe('idle');
    expect(reduceSession('connecting', 'fail')).toBe('error');
    expect(reduceSession('error', 'connect')).toBe('connecting');
  });

  test('非法转换保持原状态', () => {
    expect(reduceSession('idle', 'open')).toBe('idle');
    expect(reduceSession('idle', 'closed')).toBe('idle');
    expect(reduceSession('open', 'connect')).toBe('open');
    expect(reduceSession('closing', 'open')).toBe('closing');
  });

  test('握手前被服务端断开也落到 closed', () => {
    expect(reduceSession('connecting', 'closed')).toBe('closed');
  });
});

describe('normalizeWsUrl', () => {
  test('ws/wss 原样通过', () => {
    expect(normalizeWsUrl('wss://echo.test/room', {})).toEqual({ url: 'wss://echo.test/room', corrected: null, missing: [] });
  });

  test('http/https 自动纠正并记录原协议', () => {
    expect(normalizeWsUrl('https://api.test/ws', {})).toEqual({ url: 'wss://api.test/ws', corrected: 'https', missing: [] });
    expect(normalizeWsUrl('http://api.test/ws', {}).corrected).toBe('http');
  });

  test('先插值再校验', () => {
    const result = normalizeWsUrl('{{wsHost}}/echo', { wsHost: 'wss://real.test' });
    expect(result.url).toBe('wss://real.test/echo');
    expect(result.missing).toEqual([]);
  });

  test('缺协议时给可试的提示', () => {
    try {
      normalizeWsUrl('echo.test', {});
      throw new Error('should throw');
    } catch (caught) {
      expect(caught).toBeInstanceOf(ToolError);
      expect((caught as ToolError).message).toMatch(/缺少协议头/);
      expect(tl((caught as ToolError).hint!, 'zh')).toContain('wss://echo.test');
    }
  });

  test('空格 / 空串 / 其它协议各有专属错误', () => {
    expect(() => normalizeWsUrl('wss://a b/c', {})).toThrow(/空格/);
    expect(() => normalizeWsUrl('   ', {})).toThrow(/请填写/);
    expect(() => normalizeWsUrl('tcp://a.test', {})).toThrow(/不支持的协议/);
  });
});

describe('appendEvent 与统计', () => {
  test('裁剪后不超过上限，且保留最新一条', () => {
    let events: WsEvent[] = [];
    for (let i = 0; i < MAX_WS_EVENTS + 40; i += 1) events = appendEvent(events, event('in', String(i), i));
    expect(events).toHaveLength(MAX_WS_EVENTS);
    expect(events[events.length - 1].text).toBe(String(MAX_WS_EVENTS + 39));
    expect(events[0].text).toBe('40');
  });

  test('计数与字节按方向归集', () => {
    const stats = sessionStats([event('in', 'abc'), event('out', 'hello'), event('sys', 'x')]);
    expect(stats).toEqual({ in: 1, out: 1, bytesIn: 3, bytesOut: 5 });
    expect(countEvents([event('in', 'a'), event('in', 'b'), event('sys', 'c')])).toEqual({ in: 2, out: 0, sys: 1 });
  });
});

describe('describeCloseCode', () => {
  test('标准码、自定义段与未知码', () => {
    expect(describeCloseCode(1000).zh).toBe('正常关闭');
    expect(describeCloseCode(1006).zh).toMatch(/未正常关闭/);
    expect(describeCloseCode(4001).zh).toBe('应用自定义关闭码');
    expect(describeCloseCode(3000).zh).toMatch(/网关/);
    expect(describeCloseCode(999).zh).toBe('未知关闭码');
    expect(describeCloseCode(1015).en).toBe('TLS handshake failure');
  });
});

describe('formatPayload / parseProtocols', () => {
  test('仅合法 JSON 才缩进', () => {
    expect(formatPayload('{"a":1}')).toEqual({ text: '{\n  "a": 1\n}', isJson: true });
    expect(formatPayload('[1,2]').isJson).toBe(true);
    expect(formatPayload('hello').isJson).toBe(false);
    expect(formatPayload('{"broken":').isJson).toBe(false);
    expect(formatPayload('x'.repeat(70_000)).isJson).toBe(false);
  });

  test('子协议去重去空', () => {
    expect(parseProtocols(' chat.proto, chat.proto , v2 ')).toEqual(['chat.proto', 'v2']);
    expect(parseProtocols('')).toEqual([]);
  });
});
