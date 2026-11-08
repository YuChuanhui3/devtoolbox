/**
 * Socket.IO 连接配置与事件日志的纯函数内核。
 *
 * 传输由 socket.io-client 在面板组件里承担（polling + websocket 升级、
 * 命名空间、ack 回调都是库内建行为）；本模块只负责配置归一化与校验、
 * 事件日志模型、URL 拆解。
 */
import { ToolError } from '../errors';
import { interpolate } from './vars';

export const MAX_SIO_URL_LENGTH = 2_000;
export const MAX_SIO_EVENTS = 500;
export const MAX_SIO_NAMESPACE_LENGTH = 200;
export const MAX_SIO_EVENT_NAME_LENGTH = 200;

export type SocketIoTransport = 'polling' | 'websocket';

/** 连接配置（面板表单的原始形状，插值前）。 */
export interface SocketIoConnectionInput {
  url: string;
  /** 命名空间，默认空串 = 根命名空间。 */
  namespace: string;
  /** 允许的传输，空数组 = 库默认（polling 优先再升级）。 */
  transports: SocketIoTransport[];
  /** 随连接发送的查询参数。 */
  query: string;
  /** 仅 polling 传输有效（浏览器 WebSocket 升级后无法带头），面板会如实标注。 */
  extraHeaders: Array<{ key: string; value: string; enabled?: boolean }>;
  /** connect() 时的 auth 载荷（JSON 对象文本）。 */
  auth: string;
  /** 是否自动重连（库默认 true）。 */
  reconnection?: boolean;
}

export interface NormalizedSocketIoConfig {
  url: string;
  namespace: string;
  transports: SocketIoTransport[];
  query: string;
  headers: Array<{ key: string; value: string }>;
  auth: Record<string, unknown> | null;
  reconnection: boolean;
  missing: string[];
}

const TRANSPORT_LABEL: Record<SocketIoTransport, string> = { polling: 'polling', websocket: 'websocket' };

/** 逗号或空白分隔的传输列表，只认 polling/websocket，去重保序。 */
export function parseSocketIoTransports(raw: string): SocketIoTransport[] {
  const found: SocketIoTransport[] = [];
  for (const token of raw.split(/[,\s]+/)) {
    const value = token.trim().toLowerCase() as SocketIoTransport;
    if ((value === 'polling' || value === 'websocket') && !found.includes(value)) found.push(value);
  }
  return found;
}

/** 命名空间合法性：以 / 开头、无空格与控制字符；空串或 '/' 归一为根。 */
export function normalizeNamespace(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '/') return '';
  if (!trimmed.startsWith('/')) return `/${trimmed}`;
  return trimmed;
}

/**
 * 归一化 Socket.IO 连接配置：URL 插值校验、命名空间、查询串、
 * 头部裁剪、auth 的 JSON 解析（非法 JSON 报错而非静默忽略）。
 */
export function normalizeSocketIoConfig(input: SocketIoConnectionInput, scope: Record<string, string>): NormalizedSocketIoConfig {
  const { text, missing } = interpolate(input.url ?? '', scope);
  const url = text.trim().slice(0, MAX_SIO_URL_LENGTH);
  if (!url) {
    throw new ToolError(
      { zh: '请填写 Socket.IO 服务地址', en: 'Enter a Socket.IO server address' },
      { zh: '例如 http://localhost:3000 或 https://example.com。', en: 'For example http://localhost:3000 or https://example.com.' },
    );
  }
  if (/\s/.test(url)) {
    throw new ToolError(
      { zh: '地址含空格，无法连接', en: 'The address contains a space and cannot be connected to' },
      { zh: '去掉多余空格，或把带空格的部分做成变量。', en: 'Remove the stray space, or move that segment into a variable.' },
    );
  }
  const scheme = url.match(/^([a-zA-Z][a-zA-Z\d+\-.]*):\/\//)?.[1]?.toLowerCase() ?? null;
  if (scheme !== 'http' && scheme !== 'https') {
    throw new ToolError(
      { zh: `不支持的协议 ${scheme ?? '（缺失）'}://`, en: `Unsupported scheme ${scheme ?? '(missing)'}://` },
      { zh: 'Socket.IO 地址需以 http:// 或 https:// 开头，库会自行处理 WebSocket 升级。', en: 'A Socket.IO address must start with http:// or https://; the client handles the WebSocket upgrade.' },
    );
  }
  const namespace = normalizeNamespace(input.namespace ?? '');
  if (namespace.length > MAX_SIO_NAMESPACE_LENGTH) {
    throw new ToolError(
      { zh: '命名空间过长', en: 'Namespace too long' },
      { zh: `上限 ${MAX_SIO_NAMESPACE_LENGTH} 字符。`, en: `Limit is ${MAX_SIO_NAMESPACE_LENGTH} characters.` },
    );
  }
  // 查询串整体插值：上游面板支持 {{var}}，这里保持同一能力。
  const queryRaw = (input.query ?? '').trim();
  const queryMissing = interpolate(queryRaw, scope).missing;
  const query = interpolate(queryRaw, scope).text.trim();
  const headers = (input.extraHeaders ?? [])
    .filter((row) => row.enabled !== false)
    .map((row) => ({ key: row.key.trim(), value: row.value }))
    .filter((row) => row.key.length > 0)
    .slice(0, 50);
  let auth: Record<string, unknown> | null = null;
  const authText = (input.auth ?? '').trim();
  if (authText) {
    try {
      const parsed = JSON.parse(authText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('auth must be an object');
      }
      // auth 的值同样支持 {{var}} 插值（上游 Bearer Token 即如此）。
      const interpolated: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        interpolated[key] = typeof value === 'string' ? interpolate(value, scope).text : value;
      }
      auth = interpolated;
    } catch {
      throw new ToolError(
        { zh: 'Auth 不是合法的 JSON 对象', en: 'Auth is not a valid JSON object' },
        { zh: '例如 {"token": "{{api_token}}"}。', en: 'For example {"token": "{{api_token}}"}.' },
      );
    }
  }
  return {
    url,
    namespace,
    transports: (input.transports ?? []).filter((item) => item === 'polling' || item === 'websocket'),
    query,
    headers,
    auth,
    reconnection: input.reconnection !== false,
    missing: [...new Set([...missing, ...queryMissing])],
  };
}

/** 传输标签的双语展示（面板 Select 用）。 */
export function socketIoTransportLabel(transport: SocketIoTransport): string {
  return TRANSPORT_LABEL[transport];
}

/** 事件名校验：非空、无控制字符、不超长（库对事件名无强约束，这里只防误用）。 */
export function validateSocketIoEventName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ToolError(
      { zh: '请填写事件名', en: 'Enter an event name' },
      { zh: '例如 chat message。', en: 'For example: chat message' },
    );
  }
  if (/[\r\n\t]/.test(trimmed)) {
    throw new ToolError(
      { zh: '事件名含控制字符', en: 'The event name contains control characters' },
      { zh: '事件名应为单行令牌。', en: 'An event name is a single-line token.' },
    );
  }
  if (trimmed.length > MAX_SIO_EVENT_NAME_LENGTH) {
    throw new ToolError(
      { zh: '事件名过长', en: 'Event name too long' },
      { zh: `上限 ${MAX_SIO_EVENT_NAME_LENGTH} 字符。`, en: `Limit is ${MAX_SIO_EVENT_NAME_LENGTH} characters.` },
    );
  }
  return trimmed;
}

export type SocketIoEventDirection = 'in' | 'out' | 'sys' | 'ack';

export interface SocketIoLogEvent {
  time: string;
  direction: SocketIoEventDirection;
  /** 事件名；连接生命周期类日志为空串。 */
  event: string;
  text: string;
  at: number;
}

export interface SocketIoSessionStats {
  events: number;
  bytesIn: number;
  bytesOut: number;
  lastEventAt: number | null;
}

export function countSocketIoEvents(events: SocketIoLogEvent[]): SocketIoSessionStats {
  const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;
  let bytesIn = 0;
  let bytesOut = 0;
  let lastEventAt: number | null = null;
  for (const event of events) {
    const size = encoder ? encoder.encode(event.text).length : event.text.length;
    if (event.direction === 'in' || event.direction === 'ack') {
      bytesIn += size;
      lastEventAt = event.at;
    } else if (event.direction === 'out') {
      bytesOut += size;
    }
  }
  return { events: events.length, bytesIn, bytesOut, lastEventAt };
}

/** 方向过滤：all/in/out/ack/sys。 */
export function filterSocketIoEvents(events: SocketIoLogEvent[], filter: 'all' | SocketIoEventDirection): SocketIoLogEvent[] {
  if (filter === 'all') return events;
  return events.filter((event) => event.direction === filter);
}

/** 日志行拼法（与 WebSocketPanel 的 allText 口径一致）。 */
export function socketIoLogText(events: SocketIoLogEvent[]): string {
  const label = (event: SocketIoLogEvent) =>
    event.direction === 'in' ? 'IN' : event.direction === 'out' ? 'OUT' : event.direction === 'ack' ? 'ACK' : 'SYS';
  return events
    .map((event) => `[${event.time}] ${label(event)} ${event.event ? event.event + ' ' : ''}${event.text}`)
    .join('\n');
}

/** 面板 payload 展示：能缩进的 JSON 就缩进，超限或非 JSON 原样返回（与 ws.ts formatPayload 同口径）。 */
export function formatSocketIoPayload(text: string): { text: string; isJson: boolean } {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 64_000) return { text, isJson: false };
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return { text, isJson: false };
  try {
    return { text: JSON.stringify(JSON.parse(trimmed), null, 2), isJson: true };
  } catch {
    return { text, isJson: false };
  }
}
