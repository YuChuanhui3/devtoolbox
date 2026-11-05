import { describe, expect, test } from 'vitest';
import { tl } from '@/i18n/locale';
import { ToolError } from '../errors';
import {
  appendEvent,
  binaryView,
  countEvents,
  describeBinaryFrame,
  describeCloseCode,
  formatPayload,
  MAX_WS_EVENTS,
  normalizeWsUrl,
  parseHexInput,
  parseProtocols,
  reduceSession,
  sessionStats,
  type BinaryFrame,
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

  test('二进制帧按真实字节计，不算那行摘要', () => {
    const frame = describeBinaryFrame(new Uint8Array([0, 1, 2, 3, 4, 0xab]), 512);
    const stats = sessionStats([{ ...event('in', '[binary 6 B]'), binary: frame }, event('out', 'ok')]);
    expect(stats).toEqual({ in: 1, out: 1, bytesIn: 6, bytesOut: 2 });
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

describe('describeBinaryFrame', () => {
  test('UTF-8 可解的帧才有文本看法', () => {
    const frame = describeBinaryFrame(new Uint8Array([104, 101, 108, 108, 111]));
    expect(frame).toMatchObject({ bytes: 5, text: 'hello', base64: 'aGVsbG8=', hex: '68 65 6c 6c 6f', truncated: false });
  });

  test('非法 UTF-8 不猜内容，text 为 null', () => {
    const frame = describeBinaryFrame(new Uint8Array([0, 0x11, 0xab]));
    expect(frame.text).toBeNull();
    expect(frame.base64).toBe('ABGr');
    expect(frame.hex).toBe('00 11 ab');
  });

  test('接受 ArrayBuffer，hex 截断但 base64 保持完整', () => {
    const buffer = new Uint8Array(600).fill(0xff).buffer;
    const frame = describeBinaryFrame(buffer, 512);
    expect(frame.bytes).toBe(600);
    expect(frame.truncated).toBe(true);
    expect(frame.hex.split(' ')).toHaveLength(512);
    expect(frame.base64).toHaveLength(800);
  });

  test('空帧三种看法都成立', () => {
    expect(describeBinaryFrame(new Uint8Array())).toMatchObject({ bytes: 0, text: '', base64: '', hex: '', truncated: false });
  });
});

describe('parseHexInput', () => {
  test('容忍空格、换行、逗号与 0x 前缀', () => {
    expect([...parseHexInput('00 11 22 AB')]).toEqual([0, 17, 34, 171]);
    expect([...parseHexInput('0x00,0xFF\n')]).toEqual([0, 255]);
    expect([...parseHexInput('68656c6c6f')]).toEqual([104, 101, 108, 108, 111]);
  });

  test('空输入与非法字符分别报错，绝不静默补半字节', () => {
    try {
      parseHexInput('   ');
      throw new Error('should throw');
    } catch (caught) {
      expect(caught).toBeInstanceOf(ToolError);
      expect((caught as ToolError).message).toMatch(/请输入十六进制/);
    }
    expect(() => parseHexInput('abc')).toThrow(/不合法/);
    expect(() => parseHexInput('0xzz')).toThrow(/不合法/);
  });
});

describe('binaryView', () => {
  const utf8: BinaryFrame = { bytes: 2, text: 'hi', base64: 'aGk=', hex: '68 69', truncated: false };
  const raw: BinaryFrame = { bytes: 3, text: null, base64: 'ABGr', hex: '00 11 ab', truncated: true };

  test('文本模式解不出就退回摘要，其它模式给编码原文', () => {
    expect(binaryView(utf8, 'text', '[binary 2 B]')).toBe('hi');
    expect(binaryView(raw, 'text', '[binary 3 B]')).toBe('[binary 3 B]');
    expect(binaryView(raw, 'base64', '[binary 3 B]')).toBe('ABGr');
    expect(binaryView(raw, 'hex', '[binary 3 B]')).toBe('00 11 ab …');
    expect(binaryView(utf8, 'hex', 'x')).toBe('68 69');
  });
});
