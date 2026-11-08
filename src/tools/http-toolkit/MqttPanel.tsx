import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mqtt, { type MqttClient } from 'mqtt';
import { Activity, Pause, Play, Plus, Save, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { CopyButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { newId } from '@/lib/apiworkbench/id';
import { toToolError } from '@/lib/errors';
import {
  countMqttEvents,
  filterMqttEvents,
  formatMqttPayload,
  generateMqttClientId,
  mqttLogText,
  normalizeMqttConfig,
  parseQos,
  validateMqttTopic,
  type MqttEventDirection,
  type MqttLogEvent,
  type MqttQos,
  type MqttSubscription,
} from '@/lib/apiworkbench/mqtt';
import { useWorkbench } from './WorkbenchContext';
import type { WbSocket } from '@/lib/apiworkbench/types';

/**
 * MQTT 面板：mqtt.js 浏览器构建（WebSocket 传输）。
 * - 订阅表：主题过滤器 + QoS，连接后可增删
 * - 发布：主题 + payload + QoS + retain
 * - 日志按主题过滤器筛选
 */
const TEMPORARY = '__temporary__';
const MAX_RECENT_URLS = 20;
const MAX_RECENT_SENT = 20;
const MAX_LOG_LINES = 500;
const DEFAULT_KEEP_ALIVE = 60;

type Status = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
type LogFilter = 'all' | MqttEventDirection;

const STATUS_LABEL: Record<Status, Localized> = {
  idle: { zh: '未连接', en: 'Not connected' },
  connecting: { zh: '连接中…', en: 'Connecting…' },
  open: { zh: '已连接', en: 'Connected' },
  closed: { zh: '已断开', en: 'Disconnected' },
  error: { zh: '连接失败', en: 'Connection failed' },
};

const DIRECTION_TONE: Record<MqttEventDirection, string> = {
  in: 'text-ok',
  out: 'text-accent-strong',
  sys: 'text-ink-3',
};

function formatClock(at: number, locale: string) {
  return new Date(at).toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', { hour12: false });
}

function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function MqttPanel({ active }: { active: boolean }) {
  const { t, locale } = useI18n();
  const { doc, update, scopeFor, activeEnv } = useWorkbench();
  const scope = useMemo(() => scopeFor(null), [scopeFor]);

  const [socketId, setSocketId] = useState(TEMPORARY);
  const [name, setName] = useState('');
  const [broker, setBroker] = useState('');
  const [clientId, setClientId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [keepAlive, setKeepAlive] = useState(String(DEFAULT_KEEP_ALIVE));
  const [cleanSession, setCleanSession] = useState(true);
  const [willTopic, setWillTopic] = useState('');
  const [willMessage, setWillMessage] = useState('');
  const [willQos, setWillQos] = useState('0');
  const [willRetain, setWillRetain] = useState(false);
  const [subscriptions, setSubscriptions] = useState<MqttSubscription[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [newQos, setNewQos] = useState('0');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<Localized | null>(null);
  const [events, setEvents] = useState<MqttLogEvent[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [topicFilter, setTopicFilter] = useState('');
  const [pubTopic, setPubTopic] = useState('');
  const [pubPayload, setPubPayload] = useState('');
  const [pubQos, setPubQos] = useState('0');
  const [pubRetain, setPubRetain] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [pretty, setPretty] = useState(true);
  const [recentUrls, setRecentUrls] = useState<string[]>([]);
  const [selectedRecent, setSelectedRecent] = useState('');
  const [recentSent, setRecentSent] = useState<Array<{ topic: string; payload: string }>>([]);

  const clientRef = useRef<MqttClient | null>(null);

  const connected = status === 'open';

  const append = useCallback((direction: MqttEventDirection, topic: string, text: string, qos: MqttQos, retain: boolean) => {
    setEvents((current) => [
      ...current.slice(-(MAX_LOG_LINES - 1)),
      { time: formatClock(Date.now(), locale), direction, topic, text, qos, retain, at: Date.now() },
    ]);
  }, [locale]);

  const log = useCallback((direction: MqttEventDirection, text: string) => {
    append(direction, '', text, 0, false);
  }, [append]);

  const loadSaved = (id: string) => {
    setSocketId(id);
    setError(null);
    if (id === TEMPORARY) {
      setName('');
      setBroker('');
      setClientId('');
      setUsername('');
      setPassword('');
      setKeepAlive(String(DEFAULT_KEEP_ALIVE));
      setCleanSession(true);
      setWillTopic('');
      setWillMessage('');
      setWillQos('0');
      setWillRetain(false);
      setSubscriptions([]);
      return;
    }
    const found = doc.sockets.find((item) => item.id === id);
    if (!found) return;
    setName(found.name);
    setBroker(found.url);
    setClientId(found.mqttClientId ?? '');
    setUsername(found.mqttUsername ?? '');
    setPassword(found.mqttPassword ?? '');
    setKeepAlive(String(found.mqttKeepAlive ?? DEFAULT_KEEP_ALIVE));
    setCleanSession(found.mqttCleanSession !== false);
    setWillTopic(found.mqttWillTopic ?? '');
    setWillMessage(found.mqttWillMessage ?? '');
    setWillQos(String(found.mqttWillQos ?? 0));
    setWillRetain(found.mqttWillRetain === true);
    setSubscriptions(found.mqttSubscriptions ?? []);
  };

  const saveConnection = () => {
    if (!broker.trim()) return;
    const id = socketId === TEMPORARY ? newId() : socketId;
    const entry: WbSocket = {
      id,
      name: name.trim() || broker.trim().slice(0, 40) || 'MQTT',
      url: broker.trim(),
      protocols: [],
      kind: 'mqtt',
      mqttClientId: clientId.trim(),
      mqttUsername: username,
      mqttPassword: password,
      mqttKeepAlive: Math.min(Math.max(Number(keepAlive) || DEFAULT_KEEP_ALIVE, 1), 65535),
      mqttCleanSession: cleanSession,
      mqttWillTopic: willTopic.trim(),
      mqttWillMessage: willMessage,
      mqttWillQos: parseQos(willQos),
      mqttWillRetain: willRetain,
      mqttSubscriptions: subscriptions,
    };
    update((d) => ({
      ...d,
      sockets: d.sockets.some((item) => item.id === id)
        ? d.sockets.map((item) => (item.id === id ? entry : item))
        : [...d.sockets, entry],
    }));
    setSocketId(id);
    log('sys', t({ zh: `已保存连接「${entry.name}」`, en: `Saved connection "${entry.name}"` }));
  };

  const deleteConnection = () => {
    update((d) => ({ ...d, sockets: d.sockets.filter((item) => item.id !== socketId) }));
    setSocketId(TEMPORARY);
    setName('');
  };

  const pushRecentUrl = (value: string) => {
    setRecentUrls((current) => [value, ...current.filter((item) => item !== value)].slice(0, MAX_RECENT_URLS));
  };

  const addSubscription = (topic: string, qos: MqttQos) => {
    const trimmed = topic.trim();
    if (!trimmed) return;
    setSubscriptions((current) => {
      if (current.some((item) => item.topic === trimmed)) return current;
      return [...current, { topic: trimmed, qos }];
    });
    const client = clientRef.current;
    if (client?.connected) {
      client.subscribe(trimmed, { qos }, (e) => {
        if (e) log('sys', t({ zh: `订阅失败 ${trimmed}：${e.message}`, en: `Subscribe failed ${trimmed}: ${e.message}` }));
        else log('sys', t({ zh: `已订阅 ${trimmed}`, en: `Subscribed ${trimmed}` }));
      });
    }
  };

  const removeSubscription = (topic: string) => {
    setSubscriptions((current) => current.filter((item) => item.topic !== topic));
    const client = clientRef.current;
    if (client?.connected) {
      client.unsubscribe(topic, () => log('sys', t({ zh: `已取消订阅 ${topic}`, en: `Unsubscribed ${topic}` })));
    }
  };

  const connect = useCallback(() => {
    let config;
    try {
      config = normalizeMqttConfig(
        {
          broker,
          clientId: clientId || generateMqttClientId(),
          username,
          password,
          keepAlive,
          cleanSession,
          willTopic,
          willMessage,
          willQos,
          willRetain,
          subscriptions,
        },
        scope,
      );
    } catch (e) {
      setError(toToolError(e).localized);
      setStatus('error');
      return;
    }
    if (config.missing.length > 0) {
      setError({
        zh: `变量未定义：${config.missing.join('、')}`,
        en: `Undefined variables: ${config.missing.join(', ')}`,
      });
      setStatus('error');
      return;
    }
    pushRecentUrl(config.url);
    setStatus('connecting');
    setError(null);
    log('sys', t({ zh: `正在连接 ${config.url}`, en: `Connecting to ${config.url}` }));

    const client = mqtt.connect(config.url, {
      ...(config.clientId ? { clientId: config.clientId } : {}),
      ...(config.hasCredentials ? { username: config.username, password: config.password } : {}),
      keepalive: config.keepAlive,
      clean: config.cleanSession,
      reconnectPeriod: 5000,
      connectTimeout: 10_000,
      ...(config.will
        ? {
            will: {
              topic: config.will.topic,
              payload: config.will.message,
              qos: config.will.qos,
              retain: config.will.retain,
            },
          }
        : {}),
    });
    clientRef.current = client;

    client.on('connect', () => {
      setStatus('open');
      log('sys', t({ zh: '已连接', en: 'Connected' }));
      for (const sub of config.subscriptions) {
        client.subscribe(sub.topic, { qos: sub.qos }, (e) => {
          if (e) log('sys', t({ zh: `订阅失败 ${sub.topic}：${e.message}`, en: `Subscribe failed ${sub.topic}: ${e.message}` }));
          else log('sys', t({ zh: `已订阅 ${sub.topic}`, en: `Subscribed ${sub.topic}` }));
        });
      }
    });
    client.on('message', (topic, payload, packet) => {
      append('in', topic, payload.toString(), packet.qos as MqttQos, packet.retain === true);
    });
    client.on('error', (e) => {
      setStatus('error');
      setError({ zh: `连接失败：${e.message}`, en: `Connection failed: ${e.message}` });
      log('sys', t({ zh: `连接失败：${e.message}`, en: `Connection failed: ${e.message}` }));
    });
    client.on('close', () => {
      setStatus((current) => (current === 'open' ? 'closed' : current));
      log('sys', t({ zh: '已断开', en: 'Disconnected' }));
    });
    client.on('reconnect', () => {
      setStatus('connecting');
      log('sys', t({ zh: '正在重连…', en: 'Reconnecting…' }));
    });
  }, [broker, clientId, username, password, keepAlive, cleanSession, willTopic, willMessage, willQos, willRetain, subscriptions, scope, append, log, t]);

  const disconnect = useCallback(() => {
    const client = clientRef.current;
    if (client) {
      client.end(true);
      clientRef.current = null;
    }
    setStatus('closed');
    log('sys', t({ zh: '已断开', en: 'Disconnected' }));
  }, [log, t]);

  const publish = useCallback(() => {
    const client = clientRef.current;
    if (!client || !client.connected) {
      setError({ zh: '未连接，不能发布', en: 'Not connected; cannot publish' });
      return;
    }
    let topic: string;
    try {
      topic = validateMqttTopic(pubTopic, { zh: '发布主题', en: 'Publish topic' });
    } catch (e) {
      setError(toToolError(e).localized);
      return;
    }
    const qos = parseQos(pubQos);
    setRecentSent((current) =>
      [{ topic, payload: pubPayload }, ...current.filter((item) => !(item.topic === topic && item.payload === pubPayload))].slice(0, MAX_RECENT_SENT),
    );
    client.publish(topic, pubPayload, { qos, retain: pubRetain }, (e) => {
      if (e) {
        log('sys', t({ zh: `发布失败 ${topic}：${e.message}`, en: `Publish failed ${topic}: ${e.message}` }));
        return;
      }
      append('out', topic, pubPayload, qos, pubRetain);
    });
  }, [pubTopic, pubPayload, pubQos, pubRetain, append, log, t]);

  // 面板卸载时断开。
  useEffect(() => () => {
    const client = clientRef.current;
    if (client) {
      client.end(true);
      clientRef.current = null;
    }
  }, []);

  // 自动滚动。
  const logBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoScroll && logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [events, autoScroll]);

  const shownEvents = useMemo(() => filterMqttEvents(events, topicFilter).filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'sys') return item.direction === 'sys';
    return item.direction === filter;
  }), [events, topicFilter, filter]);
  const counts = useMemo(() => countMqttEvents(events), [events]);
  const allText = useMemo(() => mqttLogText(events), [events]);
  const savedSockets = doc.sockets.filter((item) => (item.kind ?? 'websocket') === 'mqtt');

  if (!active) return null;

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: '连接', en: 'Connection' })}
        subtitle={activeEnv
          ? t({ zh: `地址、主题与消息可引用变量，取自当前环境「${activeEnv.name}」`, en: `The broker address, topics and messages can reference variables from the active environment "${activeEnv.name}"` })
          : t({ zh: '地址、主题与消息可引用变量；未选择环境，仅内置 {{$uuid}} / {{$timestamp}} 可用', en: 'The broker address, topics and messages can reference variables; no environment selected, so only built-ins resolve' })}
        actions={
          <Badge tone={status === 'open' ? 'success' : status === 'error' ? 'danger' : 'neutral'}>
            {t(STATUS_LABEL[status])}
          </Badge>
        }
        bodyClassName="space-y-3"
      >
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            value={broker}
            onChange={(e) => setBroker(e.target.value)}
            placeholder="wss://broker.emqx.io:8083/mqtt"
            disabled={connected}
            mono
            aria-label={t({ zh: 'Broker 地址', en: 'Broker URL' })}
          />
          <Button size="sm" variant={connected ? 'secondary' : 'primary'} onClick={connected ? disconnect : connect}>
            {connected ? <Pause size={14} /> : <Play size={14} />}
            {connected
              ? t({ zh: '断开', en: 'Disconnect' })
              : t({ zh: '连接', en: 'Connect' })}
          </Button>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={t({ zh: '留空随机生成', en: 'Random when empty' })} disabled={connected} aria-label={t({ zh: 'Client ID', en: 'Client ID' })} />
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t({ zh: '用户名（可选）', en: 'Username (optional)' })} disabled={connected} aria-label={t({ zh: '用户名', en: 'Username' })} />
          <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder={t({ zh: '密码（可选）', en: 'Password (optional)' })} disabled={connected} aria-label={t({ zh: '密码', en: 'Password' })} />
          <Input value={keepAlive} onChange={(e) => setKeepAlive(e.target.value)} inputMode="numeric" placeholder="60" disabled={connected} aria-label={t({ zh: 'Keep Alive（秒）', en: 'Keep Alive (seconds)' })} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Switch label={t({ zh: '清洁会话', en: 'Clean session' })} checked={cleanSession} onChange={setCleanSession} disabled={connected} />
          {recentUrls.length > 0 && !connected && (
            <Select
              value={selectedRecent}
              onChange={(e) => {
                setSelectedRecent(e.target.value);
                if (e.target.value) setBroker(e.target.value);
              }}
              aria-label={t({ zh: '最近地址', en: 'Recent brokers' })}
            >
              <option value="">{t({ zh: '最近地址…', en: 'Recent brokers…' })}</option>
              {recentUrls.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          )}
        </div>
        <details>
          <summary>{t({ zh: 'Last Will（可选）', en: 'Last Will (optional)' })}</summary>
          <div className="wb-query-editor">
            <div className="grid gap-2 lg:grid-cols-2">
              <Input value={willTopic} onChange={(e) => setWillTopic(e.target.value)} placeholder="lwt/{{device}}" disabled={connected} aria-label={t({ zh: 'Will 主题', en: 'Will topic' })} />
              <Input value={willMessage} onChange={(e) => setWillMessage(e.target.value)} placeholder="offline" disabled={connected} aria-label={t({ zh: 'Will 消息', en: 'Will message' })} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-2">{t({ zh: 'Will QoS', en: 'Will QoS' })}</span>
              <Select value={willQos} onChange={(e) => setWillQos(e.target.value)} disabled={connected} aria-label={t({ zh: 'Will QoS', en: 'Will QoS' })}>
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
              </Select>
              <Switch label={t({ zh: 'Will 保留', en: 'Will retain' })} checked={willRetain} onChange={setWillRetain} disabled={connected} />
            </div>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={socketId} onChange={(e) => loadSaved(e.target.value)} disabled={connected} aria-label={t({ zh: '已保存的连接', en: 'Saved connections' })}>
            <option value={TEMPORARY}>{t({ zh: '临时连接', en: 'Temporary connection' })}</option>
            {savedSockets.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t({ zh: '连接名称', en: 'Connection name' })} disabled={connected} aria-label={t({ zh: '连接名称', en: 'Connection name' })} />
          <Button size="sm" onClick={saveConnection} disabled={connected || !broker.trim()}>
            <Save size={14} />
            {t({ zh: '保存', en: 'Save' })}
          </Button>
          <ConfirmButton
            size="sm"
            variant="ghost"
            confirmLabel={t({ zh: '删除连接', en: 'Delete connection' })}
            onConfirm={deleteConnection}
            disabled={connected || socketId === TEMPORARY}
          >
            <Trash2 size={14} />
          </ConfirmButton>
        </div>
        {error && <ToolAlert tone="error" title={error} />}
      </Panel>

      <Panel
        title={t({ zh: '订阅', en: 'Subscriptions' })}
        subtitle={t({ zh: '主题过滤器支持 + 与 #；连接后也可以增删', en: 'Topic filters support + and #; you can add or remove them after connecting' })}
        actions={
          <Badge tone="neutral">
            {t({ zh: `${subscriptions.length} 个`, en: `${subscriptions.length}` })}
          </Badge>
        }
        bodyClassName="space-y-3"
      >
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Input
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder={t({ zh: '主题过滤器，如 sensor/+/temperature', en: 'Topic filter, e.g. sensor/+/temperature' })}
            aria-label={t({ zh: '订阅主题过滤器', en: 'Subscription topic filter' })}
          />
          <Select value={newQos} onChange={(e) => setNewQos(e.target.value)} aria-label={t({ zh: '订阅 QoS', en: 'Subscription QoS' })}>
            <option value="0">QoS 0</option>
            <option value="1">QoS 1</option>
            <option value="2">QoS 2</option>
          </Select>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              try {
                const qos = parseQos(newQos);
                const topic = validateMqttTopic(newTopic, { zh: '订阅主题', en: 'Subscription topic' });
                addSubscription(topic, qos);
                setNewTopic('');
              } catch (e) {
                setError(toToolError(e).localized);
              }
            }}
          >
            <Plus size={14} />
            {t({ zh: '订阅', en: 'Subscribe' })}
          </Button>
        </div>
        {subscriptions.length === 0 ? (
          <p className="text-xs text-ink-3">{t({ zh: '暂无订阅。', en: 'No subscriptions yet.' })}</p>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line">
            {subscriptions.map((item) => (
              <div key={item.topic} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={item.topic}>{item.topic}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-3">QoS {item.qos}</span>
                <ConfirmButton
                  size="sm"
                  variant="ghost"
                  confirmLabel={t({ zh: '取消订阅', en: 'Unsubscribe' })}
                  onConfirm={() => removeSubscription(item.topic)}
                >
                  <X size={14} />
                </ConfirmButton>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title={t({ zh: '发布', en: 'Publish' })}
        subtitle={t({ zh: '主题与内容可引用变量；默认 QoS 0，QoS 1/2 时客户端处理确认', en: 'The topic and payload can reference variables; QoS 0 by default, QoS 1/2 adds client-side acknowledgement' })}
        bodyClassName="space-y-3"
      >
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Select value={pubTopic} onChange={(e) => setPubTopic(e.target.value)} disabled={!connected} aria-label={t({ zh: '最近发布主题', en: 'Recent publish topics' })}>
            <option value="">{t({ zh: '最近主题…', en: 'Recent topics…' })}</option>
            {recentSent.map((item, index) => (
              <option key={index} value={item.topic}>{item.topic}</option>
            ))}
          </Select>
          <Input value={pubTopic} onChange={(e) => setPubTopic(e.target.value)} placeholder="cmd/device-1" disabled={!connected} aria-label={t({ zh: '发布主题', en: 'Publish topic' })} />
          <Select value={pubQos} onChange={(e) => setPubQos(e.target.value)} disabled={!connected} aria-label={t({ zh: '发布 QoS', en: 'Publish QoS' })}>
            <option value="0">QoS 0</option>
            <option value="1">QoS 1</option>
            <option value="2">QoS 2</option>
          </Select>
        </div>
        <Textarea
          value={pubPayload}
          onChange={(e) => setPubPayload(e.target.value)}
          placeholder='{"on": true}'
          disabled={!connected}
          rows={3}
          mono
          aria-label={t({ zh: '发布内容（JSON 或纯文本）', en: 'Payload (JSON or plain text)' })}
        />
        <div className="flex items-center gap-2">
          <Switch label={t({ zh: '保留消息', en: 'Retain' })} checked={pubRetain} onChange={setPubRetain} disabled={!connected} />
          <Button size="sm" variant="primary" onClick={publish} disabled={!connected || !pubTopic.trim()}>
            <Activity size={14} />
            {t({ zh: '发布', en: 'Publish' })}
          </Button>
        </div>
      </Panel>

      <Panel
        title={t({ zh: '消息日志', en: 'Message log' })}
        subtitle={t({ zh: 'IN 收到 / OUT 发布 / SYS 状态 · 最多保留 500 条', en: 'IN received / OUT published / SYS status · keeps the latest 500' })}
        actions={
          <Badge tone="neutral">
            {t({ zh: `${counts.events} 消息 · 入 ${formatBytes(counts.bytesIn)} · 出 ${formatBytes(counts.bytesOut)}`, en: `${counts.events} messages · in ${formatBytes(counts.bytesIn)} · out ${formatBytes(counts.bytesOut)}` })}
          </Badge>
        }
        bodyClassName="p-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <Segmented<LogFilter>
            value={filter}
            onChange={setFilter}
            size="sm"
            ariaLabel={t({ zh: '日志过滤', en: 'Log filter' })}
            options={[
              { value: 'all', label: t({ zh: '全部', en: 'All' }) },
              { value: 'in', label: 'IN' },
              { value: 'out', label: 'OUT' },
              { value: 'sys', label: 'SYS' },
            ]}
          />
          <Input
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            placeholder={t({ zh: '主题过滤（支持 + 与 #）', en: 'Topic filter (+ and # supported)' })}
            aria-label={t({ zh: '主题过滤', en: 'Topic filter' })}
            className="w-56"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Switch label={t({ zh: '自动滚动', en: 'Auto scroll' })} checked={autoScroll} onChange={setAutoScroll} />
            <Switch label={t({ zh: '格式化 JSON', en: 'Pretty JSON' })} checked={pretty} onChange={setPretty} />
            <CopyButton text={allText} label={{ zh: '复制日志', en: 'Copy log' }} />
            <Button variant="ghost" size="sm" onClick={() => setEvents([])} disabled={events.length === 0}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t({ zh: '清空', en: 'Clear' })}
            </Button>
          </div>
        </div>
        {events.length === 0 ? (
          <EmptyState
            title={t({ zh: '还没有消息', en: 'No messages yet' })}
            description={t({ zh: '订阅的主题收到消息后会显示在这里。', en: 'Messages on subscribed topics appear here.' })}
            className="m-4"
          />
        ) : (
          <div ref={logBoxRef} className="max-h-[460px] divide-y divide-line overflow-auto">
            {shownEvents.map((item, index) => (
              <div key={`${item.at}-${index}`} className="flex items-start gap-3 px-4 py-2">
                <span className="mt-0.5 shrink-0 font-mono text-[11px] text-ink-3">{item.time}</span>
                <span className={`mt-0.5 w-10 shrink-0 text-center font-mono text-[10px] uppercase ${DIRECTION_TONE[item.direction]}`}>
                  {item.direction === 'in' ? 'IN' : item.direction === 'out' ? 'OUT' : 'SYS'}
                </span>
                <pre className={`min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-5 text-ink ${pretty ? 'rounded-lg bg-code-bg/60 p-2' : ''}`}>
                  {item.topic ? `${item.topic} ` : ''}{pretty ? formatMqttPayload(item.text).text : item.text}
                  {item.direction !== 'sys' && (item.qos > 0 || item.retain) ? `  [${[item.qos > 0 ? `qos${item.qos}` : '', item.retain ? 'retain' : ''].filter(Boolean).join(' ')}]` : ''}
                </pre>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '浏览器 MQTT 走 WebSocket：mqtt:// 与 mqtts:// 会自动改写为 ws:// 与 wss://。订阅、发布与日志不落盘；连接配置保存在集合树的工作区里。',
          en: 'Browser MQTT rides on WebSocket: mqtt:// and mqtts:// are rewritten to ws:// and wss://. Subscriptions, publishes and logs stay in memory; the connection itself is saved into the workspace tree.',
        })}
      </p>
    </div>
  );
}

export default MqttPanel;
