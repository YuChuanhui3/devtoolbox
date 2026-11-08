import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Activity, Pause, Play, Save, Trash2 } from 'lucide-react';
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
  countSocketIoEvents,
  filterSocketIoEvents,
  formatSocketIoPayload,
  normalizeSocketIoConfig,
  socketIoLogText,
  validateSocketIoEventName,
  type SocketIoEventDirection,
  type SocketIoLogEvent,
} from '@/lib/apiworkbench/socketio';
import { useWorkbench } from './WorkbenchContext';
import type { WbSocket } from '@/lib/apiworkbench/types';

/**
 * Socket.IO 面板：socket.io-client@4 浏览器构建。
 * - onAny 通配监听所有事件（上游同口径），收发都记日志
 * - 发送带 ack 时，服务端应答作为 ACK 方向入日志
 * - extraHeaders 仅 polling 传输有效（浏览器 WebSocket 升级后无法带头），UI 如实标注
 */
const TEMPORARY = '__temporary__';
const MAX_RECENT_URLS = 20;
const MAX_LOG_LINES = 500;
const MAX_RECENT_SENT = 20;

type Status = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
type LogFilter = 'all' | SocketIoEventDirection;

const STATUS_LABEL: Record<Status, Localized> = {
  idle: { zh: '未连接', en: 'Not connected' },
  connecting: { zh: '连接中…', en: 'Connecting…' },
  open: { zh: '已连接', en: 'Connected' },
  closed: { zh: '已断开', en: 'Disconnected' },
  error: { zh: '连接失败', en: 'Connection failed' },
};

const DIRECTION_TONE: Record<SocketIoEventDirection, string> = {
  in: 'text-ok',
  out: 'text-accent-strong',
  ack: 'text-warn',
  sys: 'text-ink-3',
};

function formatClock(at: number, locale: string) {
  return new Date(at).toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', { hour12: false });
}

function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/** 面板表单里「Key: Value」逐行写法。 */
function parseHeaders(raw: string): Array<{ key: string; value: string; enabled: boolean }> {
  const rows: Array<{ key: string; value: string; enabled: boolean }> = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colon = trimmed.indexOf(':');
    if (colon <= 0) continue;
    rows.push({ key: trimmed.slice(0, colon).trim(), value: trimmed.slice(colon + 1).trim(), enabled: true });
  }
  return rows;
}

export function SocketIoPanel({ active }: { active: boolean }) {
  const { t, locale } = useI18n();
  const { doc, update, scopeFor, activeEnv } = useWorkbench();
  const scope = useMemo(() => scopeFor(null), [scopeFor]);

  const [socketId, setSocketId] = useState(TEMPORARY);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [namespace, setNamespace] = useState('');
  const [query, setQuery] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [authText, setAuthText] = useState('');
  const [reconnection, setReconnection] = useState(true);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<Localized | null>(null);
  const [events, setEvents] = useState<SocketIoLogEvent[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [sendEvent, setSendEvent] = useState('');
  const [sendPayload, setSendPayload] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [pretty, setPretty] = useState(true);
  const [recentUrls, setRecentUrls] = useState<string[]>([]);
  const [selectedRecent, setSelectedRecent] = useState('');
  const [recentSent, setRecentSent] = useState<Array<{ event: string; payload: string }>>([]);

  const socketRef = useRef<Socket | null>(null);

  const connected = status === 'open';

  const append = useCallback((direction: SocketIoEventDirection, event: string, text: string) => {
    setEvents((current) => [
      ...current.slice(-(MAX_LOG_LINES - 1)),
      { time: formatClock(Date.now(), locale), direction, event, text, at: Date.now() },
    ]);
  }, [locale]);

  const log = useCallback((direction: SocketIoEventDirection, text: string) => {
    append(direction, '', text);
  }, [append]);

  const loadSaved = (id: string) => {
    setSocketId(id);
    setError(null);
    if (id === TEMPORARY) {
      setName('');
      setUrl('');
      setNamespace('');
      setQuery('');
      setHeadersText('');
      setAuthText('');
      setReconnection(true);
      return;
    }
    const found = doc.sockets.find((item) => item.id === id);
    if (!found) return;
    setName(found.name);
    setUrl(found.url);
    setNamespace(found.socketIoNamespace ?? '');
    setQuery(found.socketIoQuery ?? '');
    setHeadersText('');
    setAuthText(found.socketIoAuth ?? '');
    setReconnection(true);
  };

  const saveConnection = () => {
    if (!url.trim()) return;
    const id = socketId === TEMPORARY ? newId() : socketId;
    const entry: WbSocket = {
      id,
      name: name.trim() || url.trim().slice(0, 40) || 'Socket.IO',
      url: url.trim(),
      protocols: [],
      kind: 'socketio',
      socketIoNamespace: namespace.trim(),
      socketIoQuery: query.trim(),
      socketIoAuth: authText.trim(),
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

  const disconnect = useCallback((reason: string) => {
    const socket = socketRef.current;
    if (socket) {
      socket.offAny();
      socket.offAnyOutgoing();
      socket.disconnect();
      socketRef.current = null;
    }
    setStatus('closed');
    log('sys', reason);
  }, [log]);

  const connect = useCallback(() => {
    let config;
    try {
      config = normalizeSocketIoConfig(
        {
          url,
          namespace,
          transports: [],
          query,
          extraHeaders: parseHeaders(headersText),
          auth: authText,
          reconnection,
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
    log('sys', t({ zh: `正在连接 ${config.namespace ? config.namespace + ' @ ' : ''}${config.url}`, en: `Connecting to ${config.namespace ? config.namespace + ' @ ' : ''}${config.url}` }));

    const socket = io(config.url, {
      path: '/socket.io',
      ...(config.namespace ? { namespace: config.namespace } : {}),
      ...(config.query ? { query: parseQuery(config.query) } : {}),
      ...(config.headers.length > 0 ? { extraHeaders: Object.fromEntries(config.headers.map((row) => [row.key, row.value])) } : {}),
      ...(config.auth ? { auth: config.auth } : {}),
      reconnection: config.reconnection,
      reconnectionAttempts: 10,
      timeout: 20_000,
    });
    socketRef.current = socket;

    socket.onAny((eventName: string, ...args: unknown[]) => {
      const last = args[args.length - 1];
      const hasAck = typeof last === 'function';
      const payload = hasAck ? args.slice(0, -1) : args;
      append('in', eventName, payload.map(renderPayload).join(' '));
    });
    socket.onAnyOutgoing((eventName: string, ...args: unknown[]) => {
      const last = args[args.length - 1];
      const hasAck = typeof last === 'function';
      const payload = hasAck ? args.slice(0, -1) : args;
      append('out', eventName, payload.map(renderPayload).join(' '));
    });
    socket.on('connect', () => {
      setStatus('open');
      log('sys', t({ zh: '已连接', en: 'Connected' }));
    });
    socket.on('connect_error', (e: Error) => {
      setStatus('error');
      setError({ zh: `连接失败：${e.message}`, en: `Connection failed: ${e.message}` });
      log('sys', t({ zh: `连接失败：${e.message}`, en: `Connection failed: ${e.message}` }));
    });
    socket.on('disconnect', (reason: string) => {
      setStatus('closed');
      log('sys', t({ zh: `已断开（${reason}）`, en: `Disconnected (${reason})` }));
    });
  }, [url, namespace, query, headersText, authText, reconnection, scope, append, log, t]);

  const send = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      setError({ zh: '未连接，不能发送事件', en: 'Not connected; cannot emit' });
      return;
    }
    let eventName: string;
    try {
      eventName = validateSocketIoEventName(sendEvent);
    } catch (e) {
      setError(toToolError(e).localized);
      return;
    }
    let payload: unknown;
    const trimmed = sendPayload.trim();
    if (trimmed) {
      try {
        payload = JSON.parse(trimmed);
      } catch {
        payload = trimmed;
      }
    }
    setRecentSent((current) =>
      [{ event: eventName, payload: sendPayload }, ...current.filter((item) => !(item.event === eventName && item.payload === sendPayload))].slice(0, MAX_RECENT_SENT),
    );
    // 带 ack：服务端回调的响应作为 ACK 方向入日志。
    socket.emit(eventName, payload, (...args: unknown[]) => {
      append('ack', eventName, args.map(renderPayload).join(' '));
    });
  }, [sendEvent, sendPayload, append]);

  // 面板卸载时断开（LazyPanel 常驻，但工具切换时不可留悬挂连接）。
  useEffect(() => () => {
    const socket = socketRef.current;
    if (socket) {
      socket.offAny();
      socket.offAnyOutgoing();
      socket.disconnect();
      socketRef.current = null;
    }
  }, []);

  // 自动滚动。
  const logBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoScroll && logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [events, autoScroll]);

  const shownEvents = useMemo(() => filterSocketIoEvents(events, filter), [events, filter]);
  const counts = useMemo(() => countSocketIoEvents(events), [events]);
  const allText = useMemo(() => socketIoLogText(events), [events]);

  const savedSockets = doc.sockets.filter((item) => (item.kind ?? 'websocket') === 'socketio');


  if (!active) return null;

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: '连接', en: 'Connection' })}
        subtitle={activeEnv
          ? t({ zh: `地址、查询串、请求头与 Auth 可引用变量，取自当前环境「${activeEnv.name}」`, en: `The URL, query, headers and auth can reference variables from the active environment "${activeEnv.name}"` })
          : t({ zh: '地址、查询串、请求头与 Auth 可引用变量；未选择环境，仅内置 {{$uuid}} / {{$timestamp}} 可用', en: 'The URL, query, headers and auth can reference variables; no environment selected, so only built-ins resolve' })}
        actions={
          <Badge tone={status === 'open' ? 'success' : status === 'error' ? 'danger' : 'neutral'}>
            {t(STATUS_LABEL[status])}
          </Badge>
        }
        bodyClassName="space-y-3"
      >
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3000"
            disabled={connected}
            mono
            aria-label={t({ zh: 'Socket.IO 服务地址', en: 'Socket.IO server URL' })}
          />
          <Button size="sm" variant={connected ? 'secondary' : 'primary'} onClick={connected ? () => disconnect(t({ zh: '已断开', en: 'Disconnected' })) : connect}>
            {connected ? <Pause size={14} /> : <Play size={14} />}
            {connected
              ? t({ zh: '断开', en: 'Disconnect' })
              : t({ zh: '连接', en: 'Connect' })}
          </Button>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          <Input
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            placeholder="/"
            disabled={connected}
            aria-label={t({ zh: '命名空间（留空为根）', en: 'Namespace (empty = root)' })}
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="tenant={{tenant}}"
            disabled={connected}
            mono
            aria-label={t({ zh: '查询串', en: 'Query string' })}
          />
        </div>
        <Textarea
          value={headersText}
          onChange={(e) => setHeadersText(e.target.value)}
          placeholder={'Authorization: Bearer {{token}}'}
          disabled={connected}
          rows={2}
          mono
          aria-label={t({ zh: '额外请求头（仅 polling 传输有效，每行 Key: Value）', en: 'Extra headers (polling only; one Key: Value per line)' })}
        />
        <Textarea
          value={authText}
          onChange={(e) => setAuthText(e.target.value)}
          placeholder='{"token": "{{api_token}}"}'
          disabled={connected}
          rows={2}
          mono
          aria-label={t({ zh: '连接 Auth（JSON 对象）', en: 'Connect auth (a JSON object)' })}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Switch label={t({ zh: '自动重连', en: 'Reconnection' })} checked={reconnection} onChange={setReconnection} disabled={connected} />
          {recentUrls.length > 0 && !connected && (
            <Select
              value={selectedRecent}
              onChange={(e) => {
                setSelectedRecent(e.target.value);
                if (e.target.value) setUrl(e.target.value);
              }}
              aria-label={t({ zh: '最近地址', en: 'Recent endpoints' })}
            >
              <option value="">{t({ zh: '最近地址…', en: 'Recent endpoints…' })}</option>
              {recentUrls.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={socketId} onChange={(e) => loadSaved(e.target.value)} disabled={connected} aria-label={t({ zh: '已保存的连接', en: 'Saved connections' })}>
            <option value={TEMPORARY}>{t({ zh: '临时连接', en: 'Temporary connection' })}</option>
            {savedSockets.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t({ zh: '连接名称', en: 'Connection name' })} disabled={connected} aria-label={t({ zh: '连接名称', en: 'Connection name' })} />
          <Button size="sm" onClick={saveConnection} disabled={connected || !url.trim()}>
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
        title={t({ zh: '发送事件', en: 'Emit event' })}
        subtitle={t({ zh: '事件名与内容可引用变量；带 ack，服务端应答记入日志的 ACK 行', en: 'The event name and payload can reference variables; emits carry an ack and the server reply lands in the log as ACK' })}
        bodyClassName="space-y-3"
      >
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Select value={sendEvent} onChange={(e) => setSendEvent(e.target.value)} disabled={!connected} aria-label={t({ zh: '最近事件名', en: 'Recent event names' })}>
            <option value="">{t({ zh: '最近事件…', en: 'Recent events…' })}</option>
            {recentSent.map((item, index) => (
              <option key={index} value={item.event}>{item.event}</option>
            ))}
          </Select>
          <Input
            value={sendEvent}
            onChange={(e) => setSendEvent(e.target.value)}
            placeholder="chat message"
            disabled={!connected}
            aria-label={t({ zh: '事件名', en: 'Event name' })}
          />
        </div>
        <Textarea
          value={sendPayload}
          onChange={(e) => setSendPayload(e.target.value)}
          placeholder='{"text": "hello"}'
          disabled={!connected}
          rows={3}
          mono
          aria-label={t({ zh: '事件内容（JSON 或纯文本）', en: 'Payload (JSON or plain text)' })}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={send} disabled={!connected || !sendEvent.trim()}>
            <Activity size={14} />
            {t({ zh: '发送（带 ack）', en: 'Emit (with ack)' })}
          </Button>
        </div>
      </Panel>

      <Panel
        title={t({ zh: '事件日志', en: 'Event log' })}
        subtitle={t({ zh: 'IN 收到 / OUT 发出 / ACK 服务端应答 / SYS 状态 · 最多保留 500 条', en: 'IN received / OUT sent / ACK server replies / SYS status · keeps the latest 500' })}
        actions={
          <Badge tone="neutral">
            {t({ zh: `${counts.events} 事件 · 入 ${formatBytes(counts.bytesIn)} · 出 ${formatBytes(counts.bytesOut)}`, en: `${counts.events} events · in ${formatBytes(counts.bytesIn)} · out ${formatBytes(counts.bytesOut)}` })}
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
              { value: 'ack', label: 'ACK' },
              { value: 'sys', label: 'SYS' },
            ]}
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
            title={t({ zh: '还没有事件', en: 'No events yet' })}
            description={t({ zh: '点「连接」后，本端与远端的事件都会显示在这里。', en: 'Connect, and local plus remote events land here.' })}
            className="m-4"
          />
        ) : (
          <div ref={logBoxRef} className="max-h-[460px] divide-y divide-line overflow-auto">
            {shownEvents.map((item, index) => (
              <div key={`${item.at}-${index}`} className="flex items-start gap-3 px-4 py-2">
                <span className="mt-0.5 shrink-0 font-mono text-[11px] text-ink-3">{item.time}</span>
                <span className={`mt-0.5 w-10 shrink-0 text-center font-mono text-[10px] uppercase ${DIRECTION_TONE[item.direction]}`}>
                  {item.direction === 'in' ? 'IN' : item.direction === 'out' ? 'OUT' : item.direction === 'ack' ? 'ACK' : 'SYS'}
                </span>
                <pre className={`min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-5 text-ink ${pretty ? 'rounded-lg bg-code-bg/60 p-2' : ''}`}>
                  {item.event ? `${item.event} ` : ''}{pretty ? formatSocketIoPayload(item.text).text : item.text}
                </pre>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '所有事件（含其他客户端广播的）都会显示。请求头仅在 polling 传输时发送（浏览器 WebSocket 升级后无法带头）。事件日志只存在于内存，刷新页面即清空。',
          en: 'All events, including broadcasts from other clients, are shown. Extra headers are only sent over polling (browser WebSocket upgrade cannot carry headers). The log lives in memory only.',
        })}
      </p>
    </div>
  );
}

function renderPayload(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** 查询串解析：a=1&b=2 → 对象（socket.io-client 的 query 选项只接受对象）。 */
function parseQuery(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.replace(/^\?/, '').split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
    const value = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1));
    if (key) out[key] = value;
  }
  return out;
}

export default SocketIoPanel;
