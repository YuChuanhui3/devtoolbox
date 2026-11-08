/**
 * MQTT 连接配置与消息日志的纯函数内核。
 *
 * 浏览器里 MQTT 只能走 WebSocket 传输（mqtt.js 的浏览器构建已内置），
 * 本模块负责：broker URL 校验与方案纠正、clientId 生成、主题与 QoS 校验、
 * Will 结构、消息日志模型。连接与收发由面板组件里的 mqtt.js 客户端承担。
 */
import { ToolError } from '../errors';
import { interpolate } from './vars';
import type { MqttQos, MqttSubscription } from './types';

export const MAX_MQTT_URL_LENGTH = 2_000;
export const MAX_MQTT_EVENTS = 500;
export const MAX_MQTT_TOPIC_LENGTH = 65535;
export const MAX_MQTT_CLIENT_ID_LENGTH = 23;
/** 订阅表行数上限：与集合限额同量级，防误粘贴整页主题。 */
export const MAX_MQTT_SUBSCRIPTIONS = 100;

export type { MqttQos, MqttSubscription };

/** 连接配置（面板表单原始形状，插值前）。 */
export interface MqttConnectionInput {
  broker: string;
  clientId: string;
  username: string;
  password: string;
  /** 秒。 */
  keepAlive: string;
  cleanSession: boolean;
  /** Last Will，可全空。 */
  willTopic: string;
  willMessage: string;
  willQos: string;
  willRetain: boolean;
  /** 订阅表：主题过滤器 + QoS（数字）。 */
  subscriptions: Array<{ topic: string; qos: number }>;
}

export interface NormalizedMqttConfig {
  /** ws:// 或 wss://（mqtt/mqtts 已纠正并记录）。 */
  url: string;
  corrected: string | null;
  clientId: string;
  hasCredentials: boolean;
  username: string;
  password: string;
  keepAlive: number;
  cleanSession: boolean;
  will: { topic: string; message: string; qos: MqttQos; retain: boolean } | null;
  subscriptions: MqttSubscription[];
  missing: string[];
}

/**
 * 归一化 MQTT 连接配置。
 * broker 允许 mqtt:// 与 mqtts://（纠正为 ws/wss 并记录），
 * 空 clientId 由库自动生成；订阅主题逐行校验。
 */
export function normalizeMqttConfig(input: MqttConnectionInput, scope: Record<string, string>): NormalizedMqttConfig {
  const { text, missing } = interpolate(input.broker ?? '', scope);
  const raw = text.trim().slice(0, MAX_MQTT_URL_LENGTH);
  if (!raw) {
    throw new ToolError(
      { zh: '请填写 MQTT Broker 地址', en: 'Enter an MQTT broker address' },
      { zh: '浏览器只能走 WebSocket，例如 ws://broker.emqx.io:8083/mqtt。', en: 'Browser clients connect over WebSocket, e.g. ws://broker.emqx.io:8083/mqtt.' },
    );
  }
  if (/\s/.test(raw)) {
    throw new ToolError(
      { zh: 'Broker 地址含空格，无法连接', en: 'The broker address contains a space and cannot be connected to' },
      { zh: '去掉多余空格，或把带空格的部分做成变量。', en: 'Remove the stray space, or move that segment into a variable.' },
    );
  }
  const scheme = raw.match(/^([a-zA-Z][a-zA-Z\d+\-.]*):\/\//)?.[1]?.toLowerCase() ?? null;
  let url = raw;
  let corrected: string | null = null;
  if (scheme === 'ws' || scheme === 'wss') {
    // 已是浏览器可传输方案。
  } else if (scheme === 'mqtt') {
    url = `ws://${raw.slice('mqtt://'.length)}`;
    corrected = scheme;
  } else if (scheme === 'mqtts') {
    url = `wss://${raw.slice('mqtts://'.length)}`;
    corrected = scheme;
  } else if (scheme === 'http' || scheme === 'https') {
    url = `${scheme === 'http' ? 'ws' : 'wss'}://${raw.slice(scheme.length + 3)}`;
    corrected = scheme;
  } else if (!scheme) {
    throw new ToolError(
      { zh: 'Broker 地址缺少协议头，需以 ws:// 或 wss:// 开头', en: 'Missing scheme: the broker address must start with ws:// or wss://' },
      { zh: '浏览器 MQTT 走 WebSocket；mqtt:// 与 mqtts:// 会自动改写。', en: 'Browser MQTT rides on WebSocket; mqtt:// and mqtts:// are rewritten automatically.' },
    );
  } else {
    throw new ToolError(
      { zh: `不支持的协议 ${scheme}://`, en: `Unsupported scheme ${scheme}://` },
      { zh: '浏览器里 MQTT 只接受 ws://、wss://（或自动改写的 mqtt://、mqtts://）。', en: 'Browser MQTT accepts ws:// and wss:// (or mqtt://, mqtts:// which are rewritten).' },
    );
  }

  const clientId = input.clientId.trim();
  if (clientId.length > MAX_MQTT_CLIENT_ID_LENGTH) {
    throw new ToolError(
      { zh: 'Client ID 过长', en: 'Client ID too long' },
      { zh: `MQTT 3.1.1 建议不超过 ${MAX_MQTT_CLIENT_ID_LENGTH} 字符；留空则由客户端随机生成。`, en: `MQTT 3.1.1 recommends at most ${MAX_MQTT_CLIENT_ID_LENGTH} characters; leave empty for a random id.` },
    );
  }
  const username = input.username ?? '';
  const password = input.password ?? '';
  const hasCredentials = username.length > 0 || password.length > 0;

  const keepAliveRaw = Number(input.keepAlive);
  const keepAlive = Number.isFinite(keepAliveRaw) && keepAliveRaw >= 1 ? Math.min(Math.floor(keepAliveRaw), 65535) : 60;

  let will: NormalizedMqttConfig['will'] = null;
  const willTopic = input.willTopic.trim();
  const willMessage = input.willMessage;
  if (willTopic || willMessage) {
    if (!willTopic || !willMessage) {
      throw new ToolError(
        { zh: 'Last Will 需同时填写主题与消息', en: 'Last Will needs both a topic and a message' },
        { zh: '两者都留空表示不设置 Will。', en: 'Leave both empty to publish no Will.' },
      );
    }
    validateMqttTopic(willTopic, { zh: 'Will 主题', en: 'Will topic' });
    const willQos = parseQos(input.willQos);
    will = { topic: willTopic, message: willMessage, qos: willQos, retain: input.willRetain === true };
  }

  const subscriptions: MqttSubscription[] = [];
  const seen = new Set<string>();
  for (const row of input.subscriptions ?? []) {
    const topic = row.topic.trim();
    if (!topic) continue;
    validateMqttTopic(topic, { zh: '订阅主题', en: 'Subscription topic' });
    if (seen.has(topic)) continue;
    seen.add(topic);
    const qos = row.qos === 1 || row.qos === 2 ? row.qos : 0;
    subscriptions.push({ topic, qos });
    if (subscriptions.length >= MAX_MQTT_SUBSCRIPTIONS) break;
  }

  return {
    url,
    corrected,
    clientId,
    hasCredentials,
    username,
    password,
    keepAlive,
    cleanSession: input.cleanSession !== false,
    will,
    subscriptions,
    missing,
  };
}

/** MQTT 主题过滤器校验：非空、无空格与通配符误用（+/# 只允许独占一级）。 */
export function validateMqttTopic(topic: string, label: { zh: string; en: string }): string {
  const trimmed = topic.trim();
  if (!trimmed) {
    throw new ToolError(
      { zh: `${label.zh}不能为空`, en: `${label.en} is required` },
      { zh: '例如 sensor/+/temperature。', en: 'For example: sensor/+/temperature.' },
    );
  }
  if (/\s/.test(trimmed)) {
    throw new ToolError(
      { zh: `${label.zh}含空格`, en: `${label.en} contains a space` },
      { zh: '主题层级由 / 分隔，不能含空格。', en: 'Topics are /-separated levels; spaces are not allowed.' },
    );
  }
  for (const level of trimmed.split('/')) {
    if (level.includes('+') && level !== '+') {
      throw new ToolError(
        { zh: `${label.zh}的通配符 + 必须独占一级`, en: `A + wildcard in ${label.en} must occupy a whole level` },
        { zh: '写成 sensor/+/temperature，而不是 sensor/te+st。', en: 'Write sensor/+/temperature, not sensor/te+st.' },
      );
    }
    if (level.includes('#') && (level !== '#' || trimmed.split('/').indexOf(level) !== trimmed.split('/').length - 1)) {
      throw new ToolError(
        { zh: `${label.zh}的通配符 # 只能出现在最后一级且独占该级`, en: `A # wildcard in ${label.en} must be the last level on its own` },
        { zh: '写成 sensor/#。', en: 'Write sensor/#.' },
      );
    }
  }
  return trimmed;
}

/** QoS 文本解析：只接受 0/1/2，非法回落到 0（与库的默认一致），但显式填写时如实报错。 */
export function parseQos(raw: string, strict = true): MqttQos {
  const value = Number(String(raw).trim());
  if (value === 0 || value === 1 || value === 2) return value;
  if (strict && String(raw).trim() !== '') {
    throw new ToolError(
      { zh: 'QoS 只能是 0、1 或 2', en: 'QoS must be 0, 1 or 2' },
      { zh: '0=至多一次，1=至少一次，2=恰好一次。', en: '0=at most once, 1=at least once, 2=exactly once.' },
    );
  }
  return 0;
}

/** 生成随机 clientId（mqtt.js 也这么做；前缀标识本工具箱）。 */
export function generateMqttClientId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : null;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(8);
    cryptoObj.getRandomValues(bytes);
    suffix = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
  } else {
    for (let i = 0; i < 8; i += 1) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `devtoolbox-${suffix}`;
}

export type MqttEventDirection = 'in' | 'out' | 'sys';

export interface MqttLogEvent {
  time: string;
  direction: MqttEventDirection;
  /** 订阅主题（in）或发布主题（out）；生命周期日志为空串。 */
  topic: string;
  text: string;
  qos: MqttQos;
  retain: boolean;
  at: number;
}

export interface MqttSessionStats {
  events: number;
  bytesIn: number;
  bytesOut: number;
  lastEventAt: number | null;
}

export function countMqttEvents(events: MqttLogEvent[]): MqttSessionStats {
  const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;
  let bytesIn = 0;
  let bytesOut = 0;
  let lastEventAt: number | null = null;
  for (const event of events) {
    const size = encoder ? encoder.encode(event.text).length : event.text.length;
    if (event.direction === 'in') {
      bytesIn += size;
    } else if (event.direction === 'out') {
      bytesOut += size;
    } else {
      continue;
    }
    if (lastEventAt === null || event.at > lastEventAt) lastEventAt = event.at;
  }
  return { events: events.length, bytesIn, bytesOut, lastEventAt };
}

/** 主题匹配：订阅过滤器（含 + 与 #）对具体主题是否命中。用于「按主题过滤日志」。 */
export function mqttTopicMatches(filter: string, topic: string): boolean {
  const f = filter.trim();
  if (!f) return true;
  if (f === '#') return true;
  const fLevels = f.split('/');
  const tLevels = topic.split('/');
  for (let i = 0; i < fLevels.length; i += 1) {
    const level = fLevels[i]!;
    if (level === '#') return true;
    if (level !== '+' && level !== tLevels[i]) return false;
    if (level === '+' && tLevels[i] === undefined) return false;
  }
  return fLevels.length === tLevels.length || fLevels[fLevels.length - 1] === '#';
}

/** 按主题过滤器筛日志（空串 = 不过滤）。 */
export function filterMqttEvents(events: MqttLogEvent[], filter: string): MqttLogEvent[] {
  const trimmed = filter.trim();
  if (!trimmed) return events;
  return events.filter((event) => event.topic === '' || mqttTopicMatches(trimmed, event.topic));
}

/** 日志行拼法（与 WebSocketPanel 的 allText 口径一致）。 */
export function mqttLogText(events: MqttLogEvent[]): string {
  return events
    .map((event) => {
      const direction = event.direction === 'in' ? 'IN' : event.direction === 'out' ? 'OUT' : 'SYS';
      const head = event.topic ? `${event.topic} ` : '';
      const flags = [event.qos > 0 ? `qos${event.qos}` : '', event.retain ? 'retain' : ''].filter(Boolean).join(' ');
      return `[${event.time}] ${direction} ${head}${event.text}${flags ? ` [${flags}]` : ''}`;
    })
    .join('\n');
}

/** 发布 payload 展示：能缩进的 JSON 就缩进（与 ws.ts formatPayload 同口径）。 */
export function formatMqttPayload(text: string): { text: string; isJson: boolean } {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 64_000) return { text, isJson: false };
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return { text, isJson: false };
  try {
    return { text: JSON.stringify(JSON.parse(trimmed), null, 2), isJson: true };
  } catch {
    return { text, isJson: false };
  }
}
