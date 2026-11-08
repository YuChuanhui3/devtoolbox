import { describe, expect, test } from 'vitest';
import {
  countSocketIoEvents,
  filterSocketIoEvents,
  formatSocketIoPayload,
  normalizeNamespace,
  normalizeSocketIoConfig,
  parseSocketIoTransports,
  socketIoLogText,
  validateSocketIoEventName,
  type SocketIoLogEvent,
} from './socketio';
import { ToolError } from '../errors';

describe('parseSocketIoTransports', () => {
  test('逗号或空白分隔、去重保序、忽略非法值', () => {
    expect(parseSocketIoTransports('polling, websocket')).toEqual(['polling', 'websocket']);
    expect(parseSocketIoTransports('websocket polling websocket')).toEqual(['websocket', 'polling']);
    expect(parseSocketIoTransports('polling, sse')).toEqual(['polling']);
    expect(parseSocketIoTransports('')).toEqual([]);
  });
});

describe('normalizeNamespace', () => {
  test('空与 / 归一为根命名空间（空串）', () => {
    expect(normalizeNamespace('')).toBe('');
    expect(normalizeNamespace('/')).toBe('');
    expect(normalizeNamespace('  ')).toBe('');
  });
  test('自动补前导斜杠', () => {
    expect(normalizeNamespace('chat')).toBe('/chat');
    expect(normalizeNamespace('/chat')).toBe('/chat');
  });
});

describe('normalizeSocketIoConfig', () => {
  test('完整配置归一：URL 插值、命名空间、查询串、头部裁剪、auth JSON', () => {
    const result = normalizeSocketIoConfig(
      {
        url: 'http://{{host}}:3000',
        namespace: 'chat',
        transports: ['websocket'],
        query: 'tenant={{tenant}}',
        extraHeaders: [{ key: 'X-A', value: '1', enabled: true }, { key: 'X-B', value: '2', enabled: false }],
        auth: '{"token": "{{api_token}}"}',
        reconnection: false,
      },
      { host: 'localhost', tenant: 't1', api_token: 'tk' },
    );
    expect(result.url).toBe('http://localhost:3000');
    expect(result.namespace).toBe('/chat');
    expect(result.transports).toEqual(['websocket']);
    expect(result.query).toBe('tenant=t1');
    expect(result.headers).toEqual([{ key: 'X-A', value: '1' }]);
    expect(result.auth).toEqual({ token: 'tk' });
    expect(result.reconnection).toBe(false);
    expect(result.missing).toEqual([]);
  });

  test('默认值：根命名空间、空传输数组（库默认）、自动重连开启', () => {
    const result = normalizeSocketIoConfig({ url: 'https://io.example.com', namespace: '', transports: [], query: '', extraHeaders: [], auth: '' }, {});
    expect(result.namespace).toBe('');
    expect(result.transports).toEqual([]);
    expect(result.reconnection).toBe(true);
    expect(result.auth).toBeNull();
  });

  test('空地址、非 http(s) 方案、含空格报错', () => {
    expect(() => normalizeSocketIoConfig({ url: '', namespace: '', transports: [], query: '', extraHeaders: [], auth: '', reconnection: true }, {})).toThrow(ToolError);
    expect(() => normalizeSocketIoConfig({ url: 'ws://x', namespace: '', transports: [], query: '', extraHeaders: [], auth: '', reconnection: true }, {})).toThrow(ToolError);
    expect(() => normalizeSocketIoConfig({ url: 'http://a b', namespace: '', transports: [], query: '', extraHeaders: [], auth: '', reconnection: true }, {})).toThrow(ToolError);
  });

  test('auth 非法 JSON 报错而非静默忽略', () => {
    expect(() =>
      normalizeSocketIoConfig({ url: 'http://x', namespace: '', transports: [], query: '', extraHeaders: [], auth: '{oops', reconnection: true }, {}),
    ).toThrow(ToolError);
  });

  test('变量缺失列入 missing', () => {
    const result = normalizeSocketIoConfig({ url: 'http://{{host}}', namespace: '', transports: [], query: '', extraHeaders: [], auth: '', reconnection: true }, {});
    expect(result.missing).toEqual(['host']);
  });
});

describe('validateSocketIoEventName', () => {
  test('合法名原样返回（去首尾空白）', () => {
    expect(validateSocketIoEventName(' chat message ')).toBe('chat message');
  });
  test('空名与含控制字符报错', () => {
    expect(() => validateSocketIoEventName('  ')).toThrow(ToolError);
    expect(() => validateSocketIoEventName('bad\nname')).toThrow(ToolError);
  });
});

describe('countSocketIoEvents / filterSocketIoEvents / socketIoLogText', () => {
  const events: SocketIoLogEvent[] = [
    { time: '12:00:00', direction: 'in', event: 'msg', text: 'hi', at: 1 },
    { time: '12:00:01', direction: 'out', event: 'msg', text: 'hello', at: 2 },
    { time: '12:00:02', direction: 'ack', event: 'msg', text: '{"ok":true}', at: 3 },
    { time: '12:00:03', direction: 'sys', event: '', text: 'connected', at: 4 },
  ];

  test('统计把 in 与 ack 计入流入、out 计入流出', () => {
    const stats = countSocketIoEvents(events);
    expect(stats.events).toBe(4);
    expect(stats.bytesIn).toBe('hi'.length + '{"ok":true}'.length);
    expect(stats.bytesOut).toBe('hello'.length);
    expect(stats.lastEventAt).toBe(3);
  });

  test('方向过滤', () => {
    expect(filterSocketIoEvents(events, 'all')).toHaveLength(4);
    expect(filterSocketIoEvents(events, 'in')).toHaveLength(1);
    expect(filterSocketIoEvents(events, 'ack')).toHaveLength(1);
    expect(filterSocketIoEvents(events, 'sys')).toHaveLength(1);
  });

  test('日志行包含方向标记与事件名', () => {
    const text = socketIoLogText(events);
    expect(text).toContain('IN msg hi');
    expect(text).toContain('OUT msg hello');
    expect(text).toContain('ACK msg {"ok":true}');
    expect(text).toContain('SYS connected');
  });
});

describe('formatSocketIoPayload', () => {
  test('合法 JSON 缩进，非 JSON 或超限原样返回', () => {
    expect(formatSocketIoPayload('{"a":1}')).toEqual({ text: '{\n  "a": 1\n}', isJson: true });
    expect(formatSocketIoPayload('plain')).toEqual({ text: 'plain', isJson: false });
    expect(formatSocketIoPayload('')).toEqual({ text: '', isJson: false });
  });
});
