/**
 * SSE 连接配置与事件日志的纯函数内核。
 *
 * 传输层在面板组件里用 fetch + ReadableStream 实现（可自定义请求头、
 * 可走代理通道），本模块只负责：配置归一化与校验、事件日志模型、
 * 重连策略计算。解析交给 sse.ts 的 feedSse/flushSse。
 */
import { ToolError } from '../errors';
import { interpolate } from './vars';

export const MAX_SSE_URL_LENGTH = 2_000;
export const MAX_SSE_EVENTS = 500;
export const SSE_MIN_RETRY_MS = 500;
export const SSE_MAX_RETRY_MS = 30_000;

/** 连接配置里可复用的请求头行（与 REST 面板同构）。 */
export interface SseHeaderRow {
  key: string;
  value: string;
  enabled: boolean;
}

/** 一次连接尝试的完整配置（插值后）。 */
export interface SseConnectionConfig {
  url: string;
  headers: Array<{ key: string; value: string }>;
  /** 断线后是否自动重连（面板级开关，EventSource 的自动重连不可控故不用它）。 */
  reconnect: boolean;
  /** 重连间隔随次数指数增长的基数（毫秒）。 */
  retryBaseMs: number;
}

export interface NormalizedSseConfig {
  config: SseConnectionConfig;
  /** 插值缺失的变量名；面板据此拦截发送并列出名字。 */
  missing: string[];
}

/**
 * 归一化 SSE 连接配置：URL 插值与校验、头部键值裁剪、重连参数夹紧。
 * URL 允许 http/https（流由 fetch 消费，与 REST 同源约束一致）。
 */
export function normalizeSseConfig(raw: {
  url?: string;
  headers?: Array<{ key: string; value: string; enabled?: boolean }>;
  reconnect?: boolean;
  retryBaseMs?: number;
}, scope: Record<string, string>): NormalizedSseConfig {
  const { text, missing } = interpolate(raw.url ?? '', scope);
  const url = text.trim().slice(0, MAX_SSE_URL_LENGTH);
  if (!url) {
    throw new ToolError(
      { zh: '请填写 SSE 地址', en: 'Enter an SSE endpoint' },
      { zh: '例如 https://example.com/stream，返回 text/event-stream。', en: 'For example https://example.com/stream serving text/event-stream.' },
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
      { zh: 'SSE 地址需以 http:// 或 https:// 开头。', en: 'An SSE endpoint must start with http:// or https://.' },
    );
  }
  const headers: Array<{ key: string; value: string }> = [];
  const headerMissing: string[] = [];
  for (const row of raw.headers ?? []) {
    if (row.enabled === false) continue;
    const key = row.key.trim();
    if (!key) continue;
    const valueResult = interpolate(row.value ?? '', scope);
    for (const name of valueResult.missing) if (!headerMissing.includes(name)) headerMissing.push(name);
    headers.push({ key, value: valueResult.text });
    if (headers.length >= 50) break;
  }
  const retryBaseMs = Math.min(Math.max(Number(raw.retryBaseMs ?? 1000) || SSE_MIN_RETRY_MS, SSE_MIN_RETRY_MS), SSE_MAX_RETRY_MS);
  return {
    config: {
      url,
      headers,
      reconnect: raw.reconnect !== false,
      retryBaseMs,
    },
    missing: [...new Set([...missing, ...headerMissing])],
  };
}

/** 指数退避：第 n 次重连的等待毫秒数（n 从 1 开始），封顶 SSE_MAX_RETRY_MS。 */
export function sseRetryDelay(attempt: number, baseMs = SSE_MIN_RETRY_MS * 2): number {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(baseMs * 2 ** (n - 1), SSE_MAX_RETRY_MS);
}

/** 与 ws.ts 的方向模型对齐：in = 服务端事件，out = 面板主动动作（如注释心跳），sys = 连接生命周期。 */
export type SseEventDirection = 'in' | 'out' | 'sys';

export interface SseLogEvent {
  time: string;
  direction: SseEventDirection;
  /** event: 字段值；缺省为 message。 */
  event: string;
  /** data 拼接后的原文（多 data: 行以 \n 连接，解析器已保证）。 */
  text: string;
  id?: string;
  at: number;
}

export interface SseSessionStats {
  /** 收到的服务端事件条数（不含连接生命周期日志）。 */
  received: number;
  bytesIn: number;
  /** 最后一次收到事件的时刻；未收到过为 null。 */
  lastEventAt: number | null;
}

export function countSseEvents(events: SseLogEvent[]): SseSessionStats {
  const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;
  let bytesIn = 0;
  let received = 0;
  let lastEventAt: number | null = null;
  for (const event of events) {
    if (event.direction !== 'in') continue;
    received += 1;
    bytesIn += encoder ? encoder.encode(event.text).length : event.text.length;
    lastEventAt = event.at;
  }
  return { received, bytesIn, lastEventAt };
}

/** 事件类型过滤：空集合 = 不过滤；大小写敏感（SSE 的 event 字段是大小写敏感的令牌）。 */
export function matchSseEventFilter(eventType: string, filter: string[]): boolean {
  if (filter.length === 0) return true;
  return filter.includes(eventType);
}

/** 日志行拼法（与 WebSocketPanel 的 allText 口径一致：`[time] DIRECTION text`）。 */
export function sseLogText(events: SseLogEvent[]): string {
  return events
    .map((event) => `[${event.time}] ${event.direction === 'in' ? 'IN' : event.direction === 'out' ? 'OUT' : 'SYS'} ${event.event === 'message' ? '' : `(${event.event}) `}${event.text}`)
    .join('\n');
}
