import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plug, PlugZap, Save, Send, SlidersHorizontal, Trash2 } from 'lucide-react';
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
import { interpolate } from '@/lib/apiworkbench/vars';
import {
  appendEvent,
  countEvents,
  describeCloseCode,
  formatPayload,
  normalizeWsUrl,
  parseProtocols,
  reduceSession,
  sessionStats,
  type SessionAction,
  type SocketSessionState,
  type WsEvent,
  type WsEventDirection,
} from '@/lib/apiworkbench/ws';
import { useWorkbench } from './WorkbenchContext';
import type { WbSocket } from '@/lib/apiworkbench/types';

/** 浏览器 WebSocket 的 readyState 常量，不依赖具体实现。 */
const READY_OPEN = 1;

const STATUS_LABEL: Record<SocketSessionState, Localized> = {
  idle: { zh: '未连接', en: 'Not connected' },
  connecting: { zh: '连接中…', en: 'Connecting…' },
  open: { zh: '已连接', en: 'Connected' },
  closing: { zh: '关闭中…', en: 'Closing…' },
  closed: { zh: '已断开', en: 'Disconnected' },
  error: { zh: '连接失败', en: 'Connection failed' },
};

const TEMPORARY = '__temporary__';
const MAX_RECENT_SENT = 20;

type LogFilter = 'all' | WsEventDirection;

const DIRECTION_TONE: Record<WsEventDirection, string> = {
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

function binarySize(data: Blob | ArrayBuffer) {
  return data instanceof Blob ? data.size : data.byteLength;
}

export function WebSocketPanel({ active: _active }: { active: boolean }) {
  const { t, locale } = useI18n();
  const { doc, update, scopeFor, activeEnv } = useWorkbench();
  const scope = useMemo(() => scopeFor(null), [scopeFor]);

  const [socketId, setSocketId] = useState(TEMPORARY);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('wss://echo.websocket.org');
  const [protocolsText, setProtocolsText] = useState('');
  const [message, setMessage] = useState('{"action":"ping","id":"{{$uuid}}"}');
  const [session, setSession] = useState<SocketSessionState>('idle');
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [pretty, setPretty] = useState(true);
  const [error, setError] = useState<Localized | null>(null);
  const [notice, setNotice] = useState<Localized | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [lastCloseCode, setLastCloseCode] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const log = useCallback((direction: WsEventDirection, text: string) => {
    const at = Date.now();
    setEvents((current) => appendEvent(current, { time: formatClock(at, locale), direction, text, at }));
  }, [locale]);

  const transition = useCallback((action: SessionAction) => {
    setSession((current) => reduceSession(current, action));
  }, []);

  // 卸载时必须先摘掉 handler 再 close，否则关闭事件会打到已卸载的 state 上。
  useEffect(() => {
    return () => {
      const socket = socketRef.current;
      if (!socket) return;
      socketRef.current = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    };
  }, []);

  useEffect(() => {
    if (openedAt === null) {
      setElapsed(0);
      return;
    }
    const timer = window.setInterval(() => setElapsed(Date.now() - openedAt), 1000);
    setElapsed(Date.now() - openedAt);
    return () => window.clearInterval(timer);
  }, [openedAt]);

  useEffect(() => {
    if (!autoScroll || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [events, autoScroll, filter]);

  const connected = session === 'open';
  /** 主动断开和异常断开要区分颜色，否则一次正常关闭也标红。 */
  const statusTone: 'success' | 'danger' | 'warning' | 'neutral' = connected
    ? 'success'
    : session === 'error'
      ? 'danger'
      : session === 'closed' && lastCloseCode !== null && lastCloseCode !== 1000 && lastCloseCode !== 1005
        ? 'warning'
        : 'neutral';

  const connect = () => {
    if (socketRef.current) return;
    setError(null);
    setNotice(null);
    setLastCloseCode(null);
    let target: string;
    let missing: string[];
    try {
      const normalized = normalizeWsUrl(url, scope);
      target = normalized.url;
      missing = normalized.missing;
      if (normalized.corrected) {
        setNotice(t({
          zh: `已把 ${normalized.corrected}:// 改写为 ${normalized.corrected === 'http' ? 'ws' : 'wss'}://`,
          en: `Rewrote ${normalized.corrected}:// to ${normalized.corrected === 'http' ? 'ws' : 'wss'}://`,
        }));
      }
    } catch (caught) {
      setError(toToolError(caught).localized);
      return;
    }
    if (missing.length > 0) {
      setError(t({
        zh: `变量未定义：${missing.join('、')}`,
        en: `Undefined variables: ${missing.join(', ')}`,
      }));
      return;
    }
    const protocols = parseProtocols(protocolsText);
    let socket: WebSocket;
    try {
      socket = new WebSocket(target, protocols.length > 0 ? protocols : undefined);
    } catch (caught) {
      setError(toToolError(caught).localized);
      return;
    }
    transition('connect');
    log('sys', t({ zh: `正在连接 ${target}…`, en: `Connecting to ${target}…` }));

    socket.onopen = () => {
      transition('open');
      setOpenedAt(Date.now());
      log('sys', t({
        zh: protocols.length > 0 ? `连接已建立（子协议 ${protocols.join(', ')}）` : '连接已建立',
        en: protocols.length > 0 ? `Connected (subprotocol ${protocols.join(', ')})` : 'Connected',
      }));
    };
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') log('in', event.data);
      else log('in', t({ zh: `[二进制 ${binarySize(event.data)} B]`, en: `[binary ${binarySize(event.data)} B]` }));
    };
    socket.onerror = () => {
      socketRef.current = null;
      setError(t({
        zh: '连接出错：目标不可达、证书无效或服务端拒绝握手',
        en: 'Connection error: unreachable target, invalid certificate, or the server refused the handshake',
      }));
      transition('fail');
    };
    socket.onclose = (event) => {
      socketRef.current = null;
      setOpenedAt(null);
      setLastCloseCode(event.code);
      transition('closed');
      const description = describeCloseCode(event.code);
      log('sys', t({
        zh: `连接关闭（${event.code} ${description.zh}${event.reason ? ` · ${event.reason}` : ''}）`,
        en: `Connection closed (${event.code} ${description.en}${event.reason ? ` · ${event.reason}` : ''})`,
      }));
    };
    socketRef.current = socket;
  };

  const disconnect = () => {
    transition('close-begin');
    socketRef.current?.close();
  };

  const send = () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== READY_OPEN || !message) return;
    const { text, missing } = interpolate(message, scope);
    if (missing.length > 0) {
      setError(t({
        zh: `消息里的变量未定义：${missing.join('、')}`,
        en: `Undefined variables in the message: ${missing.join(', ')}`,
      }));
      return;
    }
    try {
      socket.send(text);
    } catch (caught) {
      setError(toToolError(caught).localized);
      return;
    }
    setError(null);
    log('out', text);
    setRecent((current) => [text, ...current.filter((item) => item !== text)].slice(0, MAX_RECENT_SENT));
  };

  const selected = doc.sockets.find((item) => item.id === socketId) ?? null;

  const loadSaved = (id: string) => {
    setSocketId(id);
    setError(null);
    const found = doc.sockets.find((item) => item.id === id);
    if (!found) return;
    setName(found.name);
    setUrl(found.url);
    setProtocolsText(found.protocols.join(', '));
  };

  const saveConnection = () => {
    const id = socketId === TEMPORARY ? newId() : socketId;
    const entry: WbSocket = {
      id,
      name: name.trim() || url.trim().slice(0, 40) || 'WebSocket',
      url: url.trim(),
      protocols: parseProtocols(protocolsText),
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
  };

  const counts = countEvents(events);
  const stats = sessionStats(events);
  const visible = filter === 'all' ? events : events.filter((event) => event.direction === filter);
  const allText = events.map((event) => `[${event.time}] ${event.direction.toUpperCase()} ${event.text}`).join('\n');

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: '连接', en: 'Connection' })}
        subtitle={activeEnv
          ? t({ zh: `地址与消息可引用变量，取自当前环境「${activeEnv.name}」`, en: `The address and messages can reference variables from the active environment "${activeEnv.name}"` })
          : t({ zh: '地址与消息可引用变量；未选择环境，仅内置 {{$uuid}} / {{$timestamp}} 可用', en: 'Variables come from the active environment; none selected, so only built-in {{$uuid}} / {{$timestamp}} resolve' })}
        actions={
          <Badge tone={statusTone}>
            {t(STATUS_LABEL[session])}
          </Badge>
        }
        bodyClassName="space-y-3"
      >
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="wss://echo.websocket.org"
            mono
            aria-label={t({ zh: 'WebSocket 地址', en: 'WebSocket URL' })}
            disabled={connected || session === 'connecting'}
          />
          <div className="flex items-center gap-2">
            {connected || session === 'connecting' || session === 'closing' ? (
              <Button variant="secondary" onClick={disconnect} disabled={session === 'closing'}>
                <PlugZap className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '断开', en: 'Disconnect' })}
              </Button>
            ) : (
              <Button variant="primary" onClick={connect}>
                <Plug className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '连接', en: 'Connect' })}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)_auto]">
          <Select
            value={socketId}
            onChange={(e) => loadSaved(e.target.value)}
            aria-label={t({ zh: '已保存的连接', en: 'Saved connections' })}
            wrapperClassName="w-full"
          >
            <option value={TEMPORARY}>{t({ zh: '临时连接', en: 'Ad-hoc connection' })}</option>
            {doc.sockets.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t({ zh: '连接名称，如「订单推送」', en: 'Connection name, e.g. "Order feed"' })}
            aria-label={t({ zh: '连接名称', en: 'Connection name' })}
          />
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={saveConnection}>
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {selected ? t({ zh: '更新连接', en: 'Update' }) : t({ zh: '保存连接', en: 'Save connection' })}
            </Button>
            {selected ? (
              <ConfirmButton
                confirmLabel={{ zh: '再次点击删除', en: 'Click again to delete' }}
                onConfirm={deleteConnection}
                aria-label={t({ zh: '删除该连接', en: 'Delete this connection' })}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </ConfirmButton>
            ) : null}
          </div>
        </div>

        <Input
          value={protocolsText}
          onChange={(e) => setProtocolsText(e.target.value)}
          placeholder={t({ zh: '子协议（可选，逗号分隔，如 chat.proto, v2）', en: 'Subprotocols (optional, comma separated, e.g. chat.proto, v2)' })}
          mono
          aria-label={t({ zh: '子协议', en: 'Subprotocols' })}
          disabled={connected || session === 'connecting'}
        />

        {error ? <ToolAlert tone="error" title={error} /> : null}
        {notice ? <ToolAlert tone="info" title={notice} /> : null}
      </Panel>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Panel title={t({ zh: '发送消息', en: 'Send message' })} bodyClassName="space-y-3">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={4}
              mono
              disabled={!connected}
              aria-label={t({ zh: '消息内容', en: 'Message content' })}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value) setMessage(e.target.value);
                }}
                aria-label={t({ zh: '复用上次的消息', en: 'Reuse a recent message' })}
                size="sm"
                wrapperClassName="max-w-[200px]"
                disabled={recent.length === 0}
              >
                <option value="">{t({ zh: '复用上次的消息', en: 'Reuse a recent message' })}</option>
                {recent.map((item, index) => (
                  <option key={index} value={item}>{item.slice(0, 48)}</option>
                ))}
              </Select>
              <Button variant="primary" onClick={send} disabled={!connected}>
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '发送', en: 'Send' })}
              </Button>
            </div>
          </Panel>

          <Panel
            title={t({ zh: '本次会话', en: 'This session' })}
            subtitle={t({ zh: '仅存在于内存，刷新页面即清空', en: 'Held in memory only; a refresh clears it' })}
            bodyClassName="grid grid-cols-2 gap-2 text-xs"
          >
            <div>
              <div className="text-ink-3">{t({ zh: '连接时长', en: 'Connected for' })}</div>
              <div className="mt-0.5 font-mono text-sm text-ink">{Math.floor(elapsed / 1000)}s</div>
            </div>
            <div>
              <div className="text-ink-3">{t({ zh: '事件条数', en: 'Events' })}</div>
              <div className="mt-0.5 font-mono text-sm text-ink">{events.length}</div>
            </div>
            <div>
              <div className="text-ink-3">{t({ zh: `收到 ${counts.in} 条`, en: `Received ${counts.in}` })}</div>
              <div className="mt-0.5 font-mono text-sm text-ink">{formatBytes(stats.bytesIn)}</div>
            </div>
            <div>
              <div className="text-ink-3">{t({ zh: `发出 ${counts.out} 条`, en: `Sent ${counts.out}` })}</div>
              <div className="mt-0.5 font-mono text-sm text-ink">{formatBytes(stats.bytesOut)}</div>
            </div>
          </Panel>
        </div>

        <Panel
          title={t({ zh: '事件日志', en: 'Event log' })}
          subtitle={t({ zh: 'IN 收到 / OUT 发出 / SYS 状态 · 最多保留 500 条', en: 'IN received / OUT sent / SYS status · keeps the latest 500' })}
          actions={
            <div className="flex items-center gap-1.5">
              <CopyButton text={allText} label={{ zh: '复制日志', en: 'Copy log' }} />
              <Button variant="ghost" size="sm" onClick={() => setEvents([])} disabled={events.length === 0}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '清空', en: 'Clear' })}
              </Button>
            </div>
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
                { value: 'in', label: `IN ${counts.in}` },
                { value: 'out', label: `OUT ${counts.out}` },
                { value: 'sys', label: `SYS ${counts.sys}` },
              ]}
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="flex items-center gap-2">
                <Switch label={t({ zh: '自动滚动', en: 'Auto scroll' })} checked={autoScroll} onChange={setAutoScroll} />
                <span className="text-xs text-ink-2">{t({ zh: '自动滚动', en: 'Auto scroll' })}</span>
              </span>
              <span className="flex items-center gap-2">
                <Switch label={t({ zh: '格式化 JSON', en: 'Pretty JSON' })} checked={pretty} onChange={setPretty} />
                <span className="text-xs text-ink-2">{t({ zh: '格式化 JSON', en: 'Pretty JSON' })}</span>
              </span>
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={<SlidersHorizontal className="h-6 w-6" aria-hidden="true" />}
              title={t({ zh: events.length === 0 ? '还没有事件' : '当前筛选没有命中', en: events.length === 0 ? 'No events yet' : 'Nothing matches this filter' })}
              description={events.length === 0
                ? t({ zh: '点「连接」后，收发的消息与关闭码都会显示在这里。', en: 'Connect, and every message plus the close code lands here.' })
                : t({ zh: '换成「全部」可看到完整 500 条上限内的记录。', en: 'Switch back to All to see everything within the 500-entry cap.' })}
              className="m-4"
            />
          ) : (
            <div ref={listRef} className="max-h-[460px] divide-y divide-line overflow-auto">
              {visible.map((event, index) => {
                const shown = pretty ? formatPayload(event.text) : { text: event.text, isJson: false };
                return (
                  <div key={`${event.at}-${index}`} className="flex items-start gap-3 px-4 py-2">
                    <span className="mt-0.5 shrink-0 font-mono text-[11px] text-ink-3">{event.time}</span>
                    <span className={`mt-0.5 w-10 shrink-0 text-center font-mono text-[10px] uppercase ${DIRECTION_TONE[event.direction]}`}>
                      {event.direction}
                    </span>
                    <pre className={`min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-5 text-ink ${shown.isJson ? 'rounded-lg bg-code-bg/60 p-2' : ''}`}>
                      {shown.text}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '浏览器原生 WebSocket 直连目标服务：无 CORS 预检，但也无法携带自定义请求头（只有子协议可设）· wss:// 需目标证书有效 · 消息与日志不上传、不落盘',
          en: 'Native browser WebSocket talks to the target directly: no CORS preflight, but custom request headers are impossible (only subprotocols are settable) · wss:// needs a valid certificate · messages and logs are never uploaded or persisted',
        })}
      </p>
    </div>
  );
}
