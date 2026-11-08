import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Save, Trash2 } from 'lucide-react';
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
import { createSseState, feedSse, flushSse } from '@/lib/apiworkbench/sse';
import {
  countSseEvents,
  normalizeSseConfig,
  sseLogText,
  sseRetryDelay,
  type SseEventDirection,
  type SseLogEvent,
} from '@/lib/apiworkbench/sseconnect';
import { useWorkbench } from './WorkbenchContext';
import type { WbSocket } from '@/lib/apiworkbench/types';

/**
 * SSE 面板：单向事件流，只有接收与连接管理（与上游一致，没有发送区）。
 * 传输用 fetch + ReadableStream 而非 EventSource：
 * - 可自定义请求头（EventSource 不能）
 * - 可走代理通道与变量插值，与 REST 面板同口径
 * - 重连策略由面板控制（指数退避 + 上限），不依赖浏览器隐式行为
 * 布局与 WebSocketPanel 同构：连接 → 事件流 → 底部说明，单列 space-y-4。
 */
const TEMPORARY = '__temporary__';
const MAX_RECENT_URLS = 20;
const MAX_LOG_LINES = 500;
const MAX_RETRIES = 10;

type Status = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
type LogFilter = 'all' | 'message' | 'named';

const STATUS_LABEL: Record<Status, Localized> = {
  idle: { zh: '未连接', en: 'Not connected' },
  connecting: { zh: '连接中…', en: 'Connecting…' },
  open: { zh: '已连接', en: 'Connected' },
  closed: { zh: '已断开', en: 'Disconnected' },
  error: { zh: '连接失败', en: 'Connection failed' },
};

const DIRECTION_TONE: Record<SseEventDirection, string> = {
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

/** 面板表单里「Key: Value」逐行写法；# 开头是注释。 */
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

function prettyIfJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 64_000) return text;
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return text;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

export function SsePanel({ active }: { active: boolean }) {
  const { t, locale } = useI18n();
  const { doc, update, scopeFor, activeEnv } = useWorkbench();
  const scope = useMemo(() => scopeFor(null), [scopeFor]);

  const [socketId, setSocketId] = useState(TEMPORARY);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [reconnect, setReconnect] = useState(true);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<Localized | null>(null);
  const [events, setEvents] = useState<SseLogEvent[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [pretty, setPretty] = useState(true);
  const [recentUrls, setRecentUrls] = useState<string[]>([]);
  const [selectedRecent, setSelectedRecent] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const connected = status === 'open';

  const append = useCallback((direction: SseEventDirection, event: string, text: string, id?: string) => {
    setEvents((current) => [
      ...current.slice(-(MAX_LOG_LINES - 1)),
      { time: formatClock(Date.now(), locale), direction, event, text, id, at: Date.now() },
    ]);
  }, [locale]);

  const log = useCallback((direction: SseEventDirection, text: string) => {
    append(direction, '', text);
  }, [append]);

  const loadSaved = (id: string) => {
    setSocketId(id);
    setError(null);
    if (id === TEMPORARY) {
      setName('');
      setUrl('');
      setHeadersText('');
      setReconnect(true);
      return;
    }
    const found = doc.sockets.find((item) => item.id === id);
    if (!found) return;
    setName(found.name);
    setUrl(found.url);
    setHeadersText((found.sseHeaders ?? []).map((row) => `${row.key}: ${row.value}`).join('\n'));
    setReconnect(found.sseReconnect !== false);
  };

  const saveConnection = () => {
    if (!url.trim()) return;
    const id = socketId === TEMPORARY ? newId() : socketId;
    const entry: WbSocket = {
      id,
      name: name.trim() || url.trim().slice(0, 40) || 'SSE',
      url: url.trim(),
      protocols: [],
      kind: 'sse',
      sseHeaders: parseHeaders(headersText),
      sseReconnect: reconnect,
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

  const stop = useCallback((reason: string) => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setStatus('closed');
    log('sys', reason);
  }, [log]);

  const connect = useCallback(() => {
    let config;
    try {
      config = normalizeSseConfig(
        { url, headers: parseHeaders(headersText), reconnect, retryBaseMs: 1000 },
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
    pushRecentUrl(config.config.url);
    const controller = new AbortController();
    abortRef.current = controller;
    retryCountRef.current = 0;
    setStatus('connecting');
    setError(null);
    log('sys', t({ zh: `正在连接 ${config.config.url}`, en: `Connecting to ${config.config.url}` }));

    const consume = async (target: string, signal: AbortSignal) => {
      const headers: Record<string, string> = {};
      for (const row of config.config.headers) headers[row.key] = row.value;
      const response = await fetch(target, { headers, signal });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }
      setStatus('open');
      log('sys', t({ zh: '已连接', en: 'Connected' }));
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let state = createSseState();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const result = feedSse(state, chunk);
          state = result.state;
          for (const frame of result.events) {
            append('in', frame.event, frame.data, frame.id);
          }
        }
        const tail = flushSse(state);
        for (const frame of tail.events) append('in', frame.event, frame.data, frame.id);
      } finally {
        reader.releaseLock();
      }
    };

    const run = async () => {
      for (;;) {
        try {
          await consume(config.config.url, controller.signal);
          if (!controller.signal.aborted) {
            log('sys', t({ zh: '流已结束', en: 'Stream ended' }));
            setStatus('closed');
          }
          return;
        } catch (e) {
          if (controller.signal.aborted) return;
          retryCountRef.current += 1;
          if (!config.config.reconnect || retryCountRef.current > MAX_RETRIES) {
            const message = String(e);
            setError({ zh: `连接失败：${message}`, en: `Connection failed: ${message}` });
            setStatus('error');
            log('sys', t({ zh: `连接失败：${message}`, en: `Connection failed: ${message}` }));
            return;
          }
          const wait = sseRetryDelay(retryCountRef.current, config.config.retryBaseMs);
          log('sys', t({
            zh: `连接中断，${Math.round(wait / 100) / 10}s 后重连（第 ${retryCountRef.current} 次）`,
            en: `Stream interrupted, reconnecting in ${Math.round(wait / 100) / 10}s (attempt ${retryCountRef.current})`,
          }));
          await new Promise((resolve) => {
            retryTimerRef.current = setTimeout(resolve, wait);
          });
          if (controller.signal.aborted) return;
        }
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, headersText, reconnect, scope, append, log, t]);

  const disconnect = useCallback(() => {
    stop(t({ zh: '已断开', en: 'Disconnected' }));
  }, [stop, t]);

  // 工具切换或组件卸载时断开，浏览器端不可留悬挂流。
  useEffect(() => () => {
    abortRef.current?.abort();
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  // 自动滚动。
  useEffect(() => {
    if (autoScroll && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [events, autoScroll]);

  const shownEvents = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'message') return events.filter((item) => item.direction === 'in' && item.event === 'message');
    return events.filter((item) => item.direction === 'in' && item.event !== 'message');
  }, [events, filter]);

  const counts = useMemo(() => countSseEvents(events), [events]);
  const allText = useMemo(() => sseLogText(events), [events]);
  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of events) if (item.direction === 'in') map.set(item.event, (map.get(item.event) ?? 0) + 1);
    return [...map.entries()];
  }, [events]);

  const statusTone = status === 'open' ? 'success' : status === 'error' ? 'danger' : 'neutral';
  const savedSockets = doc.sockets.filter((item) => (item.kind ?? 'websocket') === 'sse');

  if (!active) return null;

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: '连接', en: 'Connection' })}
        subtitle={activeEnv
          ? t({ zh: `地址与请求头可引用变量，取自当前环境「${activeEnv.name}」`, en: `The URL and headers can reference variables from the active environment "${activeEnv.name}"` })
          : t({ zh: '地址与请求头可引用变量；未选择环境，仅内置 {{$uuid}} / {{$timestamp}} 可用', en: 'The URL and headers can reference variables; no environment selected, so only built-in {{$uuid}} / {{$timestamp}} resolve' })}
        actions={<Badge tone={statusTone}>{t(STATUS_LABEL[status])}</Badge>}
        bodyClassName="space-y-3"
      >
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/stream"
            disabled={connected}
            mono
            aria-label={t({ zh: 'SSE 地址', en: 'SSE endpoint' })}
          />
          <Button size="sm" variant={connected ? 'secondary' : 'primary'} onClick={connected ? disconnect : connect}>
            {connected ? <Pause size={14} /> : <Play size={14} />}
            {connected
              ? t({ zh: '断开', en: 'Disconnect' })
              : t({ zh: '连接', en: 'Connect' })}
          </Button>
        </div>
        <Textarea
          value={headersText}
          onChange={(e) => setHeadersText(e.target.value)}
          placeholder={'Authorization: Bearer {{token}}'}
          disabled={connected}
          rows={2}
          mono
          aria-label={t({ zh: '请求头（每行 Key: Value，# 开头是注释）', en: 'Headers (one Key: Value per line; # starts a comment)' })}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Switch label={t({ zh: '断线重连', en: 'Reconnect' })} checked={reconnect} onChange={setReconnect} disabled={connected} />
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
        title={t({ zh: '事件流', en: 'Event stream' })}
        subtitle={t({ zh: 'IN 收到 / SYS 状态 · 最多保留 500 条', en: 'IN received / SYS status · keeps the latest 500' })}
        actions={
          <Badge tone="neutral">
            {t({ zh: `${counts.received} 事件 · ${formatBytes(counts.bytesIn)}`, en: `${counts.received} events · ${formatBytes(counts.bytesIn)}` })}
          </Badge>
        }
        bodyClassName="p-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <Segmented<LogFilter>
            value={filter}
            onChange={setFilter}
            size="sm"
            ariaLabel={t({ zh: '事件过滤', en: 'Event filter' })}
            options={[
              { value: 'all', label: t({ zh: '全部', en: 'All' }) },
              { value: 'message', label: t({ zh: 'message', en: 'message' }) },
              { value: 'named', label: t({ zh: '具名事件', en: 'Named' }) },
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
        {typeCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2">
            <span className="text-xs text-ink-3">{t({ zh: '事件类型：', en: 'Event types: ' })}</span>
            {typeCounts.map(([type, count]) => (
              <code key={type} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
                {type} ×{count}
              </code>
            ))}
          </div>
        )}
        {events.length === 0 ? (
          <EmptyState
            title={t({ zh: '还没有事件', en: 'No events yet' })}
            description={t({ zh: '点「连接」后，服务端推送的事件会显示在这里。', en: 'Connect, and server-pushed events land here.' })}
            className="m-4"
          />
        ) : (
          <div ref={listRef} className="max-h-[460px] divide-y divide-line overflow-auto">
            {shownEvents.map((item, index) => (
              <div key={`${item.at}-${index}`} className="flex items-start gap-3 px-4 py-2">
                <span className="mt-0.5 shrink-0 font-mono text-[11px] text-ink-3">{item.time}</span>
                <span className={`mt-0.5 w-10 shrink-0 text-center font-mono text-[10px] uppercase ${DIRECTION_TONE[item.direction]}`}>
                  {item.direction === 'in' ? 'IN' : 'SYS'}
                </span>
                <pre className={`min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-5 text-ink ${pretty ? 'rounded-lg bg-code-bg/60 p-2' : ''}`}>
                  {item.event && item.event !== 'message' ? `(${item.event}) ` : ''}{item.id ? `[id=${item.id}] ` : ''}{pretty ? prettyIfJson(item.text) : item.text}
                </pre>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: 'SSE 是单向流：浏览器只收不发。fetch 流式消费，支持自定义请求头与代理通道；断线按指数退避重连（最多 10 次）。事件日志只存在于内存，刷新页面即清空。',
          en: 'SSE is one-way: the browser only receives. Consumed via fetch streaming, so custom headers and proxy modes work; retries use exponential backoff (up to 10). The log lives in memory only.',
        })}
      </p>
    </div>
  );
}

export default SsePanel;
