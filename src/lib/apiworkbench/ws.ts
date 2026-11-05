import { ToolError } from '../errors';
import { interpolate } from './vars';

export const MAX_WS_EVENTS = 500;
export const MAX_SOCKETS = 100;
export const MAX_WS_URL_LENGTH = 2_000;

export type SocketSessionState = 'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'error';

export type SessionAction = 'connect' | 'open' | 'close-begin' | 'closed' | 'fail' | 'reset';

const TRANSITIONS: Record<SocketSessionState, Partial<Record<SessionAction, SocketSessionState>>> = {
  idle: { connect: 'connecting' },
  connecting: { open: 'open', closed: 'closed', fail: 'error' },
  open: { 'close-begin': 'closing', closed: 'closed', fail: 'error' },
  closing: { closed: 'closed', fail: 'error' },
  closed: { connect: 'connecting', reset: 'idle' },
  error: { connect: 'connecting', reset: 'idle' },
};

/** 纯状态机：非法转换原样返回，UI 只需渲染结果，不需要自己判断能否连接。 */
export function reduceSession(state: SocketSessionState, action: SessionAction): SocketSessionState {
  return TRANSITIONS[state][action] ?? state;
}

export type WsEventDirection = 'in' | 'out' | 'sys';

export interface WsEvent {
  /** 本地时间串，由调用方按 locale 生成。 */
  time: string;
  direction: WsEventDirection;
  text: string;
  /** 事件发生时刻，供时长统计用。 */
  at: number;
}

/** 环形裁剪：保留最近 cap 条，与旧工具 slice(-499)+push 的上限语义一致。 */
export function appendEvent(events: WsEvent[], event: WsEvent, cap = MAX_WS_EVENTS): WsEvent[] {
  if (cap <= 0) return [];
  return [...events.slice(Math.max(0, events.length - cap + 1)), event];
}

export function countEvents(events: WsEvent[]): Record<WsEventDirection, number> {
  const counts: Record<WsEventDirection, number> = { in: 0, out: 0, sys: 0 };
  for (const event of events) counts[event.direction] += 1;
  return counts;
}

/** 收发条数与字节；字节按 UTF-8 编码宽度估算。 */
export function sessionStats(events: WsEvent[]): { in: number; out: number; bytesIn: number; bytesOut: number } {
  const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;
  const size = (text: string) => (encoder ? encoder.encode(text).length : text.length);
  let bytesIn = 0;
  let bytesOut = 0;
  let inCount = 0;
  let outCount = 0;
  for (const event of events) {
    if (event.direction === 'in') {
      inCount += 1;
      bytesIn += size(event.text);
    } else if (event.direction === 'out') {
      outCount += 1;
      bytesOut += size(event.text);
    }
  }
  return { in: inCount, out: outCount, bytesIn, bytesOut };
}

const CLOSE_CODES: Record<number, { zh: string; en: string }> = {
  1000: { zh: '正常关闭', en: 'Normal closure' },
  1001: { zh: '端点离开（页面关闭或服务下线）', en: 'Endpoint going away' },
  1002: { zh: '协议错误', en: 'Protocol error' },
  1003: { zh: '收到无法理解的数据类型', en: 'Unsupported data type' },
  1005: { zh: '未携带关闭码', en: 'No status received' },
  1006: { zh: '未正常关闭（网络断开或服务端拒绝）', en: 'Abnormal closure (network drop or rejected)' },
  1007: { zh: '数据格式不符（如非 UTF-8）', en: 'Invalid payload data' },
  1008: { zh: '违反策略被中止', en: 'Policy violation' },
  1009: { zh: '消息过大', en: 'Message too big' },
  1010: { zh: '扩展协商失败', en: 'Missing extension' },
  1011: { zh: '服务端内部错误', en: 'Internal server error' },
  1012: { zh: '服务端重启', en: 'Service restart' },
  1013: { zh: '稍后重试', en: 'Try again later' },
  1015: { zh: 'TLS 握手失败', en: 'TLS handshake failure' },
};

/** 关闭码 → 一句话解释（双语），未知码与 4000-4999 应用自定义段分别给出说明。 */
export function describeCloseCode(code: number): { zh: string; en: string } {
  const known = CLOSE_CODES[code];
  if (known) return known;
  if (code >= 3000 && code <= 3999) return { zh: '网关/代理自定义码', en: 'Gateway/proxy custom code' };
  if (code >= 4000 && code <= 4999) return { zh: '应用自定义关闭码', en: 'Application-defined close code' };
  return { zh: '未知关闭码', en: 'Unknown close code' };
}

export interface NormalizedWsUrl {
  url: string;
  /** 由 http(s) 自动改写为 ws(s) 时记录原始协议，供 UI 提示；未改写为 null。 */
  corrected: string | null;
  missing: string[];
}

/**
 * 插值 + 校验 WebSocket 地址。`http/https` 自动纠正为 `ws/wss`，
 * 其它协议或非空裸地址报错，避免把 "连接失败" 归因到目标服务。
 */
export function normalizeWsUrl(raw: string, scope: Record<string, string>): NormalizedWsUrl {
  const { text, missing } = interpolate(raw, scope);
  const trimmed = text.trim().slice(0, MAX_WS_URL_LENGTH);
  if (!trimmed) {
    throw new ToolError(
      { zh: '请填写 WebSocket 地址', en: 'Enter a WebSocket address' },
      { zh: '例如 wss://example.com/echo。', en: 'For example: wss://example.com/echo.' },
    );
  }
  if (/\s/.test(trimmed)) {
    throw new ToolError(
      { zh: '地址含空格，无法连接', en: 'The address contains a space and cannot be connected to' },
      { zh: '去掉多余空格，或把带空格的部分做成变量。', en: 'Remove the stray space, or move that segment into a variable.' },
    );
  }
  const scheme = trimmed.match(/^([a-zA-Z][a-zA-Z\d+\-.]*):\/\//)?.[1]?.toLowerCase() ?? null;
  if (scheme === 'ws' || scheme === 'wss') return { url: trimmed, corrected: null, missing };
  if (scheme === 'http' || scheme === 'https') {
    const target = `${scheme === 'http' ? 'ws' : 'wss'}://${trimmed.slice(scheme.length + 3)}`;
    return { url: target, corrected: scheme, missing };
  }
  if (!scheme) {
    throw new ToolError(
      { zh: '地址缺少协议头，需以 ws:// 或 wss:// 开头', en: 'Missing scheme: the address must start with ws:// or wss://' },
      {
        zh: `可先试 ${trimmed ? `wss://${trimmed}` : 'wss://echo.websocket.org'}。`,
        en: `Try ${trimmed ? `wss://${trimmed}` : 'wss://echo.websocket.org'} first.`,
      },
    );
  }
  throw new ToolError(
    { zh: `不支持的协议 ${scheme}://`, en: `Unsupported scheme ${scheme}://` },
    { zh: '浏览器 WebSocket 只接受 ws:// 与 wss://。', en: 'Browser WebSockets accept only ws:// and wss://.' },
  );
}

/** 逗号或空白分隔的子协议列表（浏览器会原样写进 Sec-WebSocket-Protocol）。 */
export function parseProtocols(raw: string): string[] {
  return [...new Set(raw.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean))];
}

const JSON_PRETTY_LIMIT = 64_000;

/** 能解析成 JSON 才缩进展示，超限或非 JSON 原样返回。 */
export function formatPayload(text: string): { text: string; isJson: boolean } {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > JSON_PRETTY_LIMIT) return { text, isJson: false };
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return { text, isJson: false };
  try {
    return { text: JSON.stringify(JSON.parse(trimmed), null, 2), isJson: true };
  } catch {
    return { text, isJson: false };
  }
}
