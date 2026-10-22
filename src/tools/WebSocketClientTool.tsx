import { useCallback, useEffect, useRef, useState } from 'react';
import { Plug, PlugZap, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { ToolError, errorHint } from '@/lib/errors';

interface WsEvent {
  time: string;
  direction: 'in' | 'out' | 'sys';
  text: string;
}

type SocketStatus = 'idle' | 'connecting' | 'open' | 'closed';

const STATUS_LABEL: Record<SocketStatus, L10n> = {
  idle: { zh: '未连接', en: 'Not connected' },
  connecting: { zh: '连接中…', en: 'Connecting…' },
  open: { zh: '已连接', en: 'Connected' },
  closed: { zh: '已断开', en: 'Disconnected' },
};

export default function WebSocketClientTool() {
  const { t, locale } = useI18n();
  const [url, setUrl] = useState('wss://echo.websocket.org');
  const [status, setStatus] = useState<SocketStatus>('idle');
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [message, setMessage] = useState('Hello WebSocket');
  const [error, setError] = useState<ToolError | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

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

  const log = useCallback((direction: WsEvent['direction'], text: string) => {
    setEvents((current) => [
      ...current.slice(-499),
      { time: new Date().toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', { hour12: false }), direction, text },
    ]);
  }, [locale]);

  const connect = () => {
    if (socketRef.current) return;
    setError(null);
    let socket: WebSocket;
    try {
      socket = new WebSocket(url.trim());
    } catch (caught) {
      setError(
        new ToolError(
          { zh: 'URL 不合法，需以 ws:// 或 wss:// 开头', en: 'Invalid URL: must start with ws:// or wss://' },
          errorHint(caught, {
            zh: '常见原因是缺少协议头、含有空格或端口写法不正确。',
            en: 'Common causes: a missing scheme, a stray space, or a malformed port.',
          }),
        ),
      );
      return;
    }
    setStatus('connecting');
    log('sys', t({ zh: `正在连接 ${url.trim()} …`, en: `Connecting to ${url.trim()}…` }));

    socket.onopen = () => {
      setStatus('open');
      log('sys', t({ zh: '连接已建立', en: 'Connection established' }));
    };
    socket.onmessage = (event) => log('in', typeof event.data === 'string' ? event.data : t({ zh: `[二进制 ${event.data.byteLength} B]`, en: `[binary ${event.data.byteLength} B]` }));
    socket.onerror = () =>
      setError(
        new ToolError(
          { zh: '连接出错：目标不可达或证书/跨域策略拒绝', en: 'Connection error: target unreachable, or rejected by certificate / cross-origin policy' },
          {
            zh: '可先连接公共回显服务 wss://echo.websocket.org 验证用法。',
            en: 'Try the public echo service first: wss://echo.websocket.org',
          },
        ),
      );
    socket.onclose = (event) => {
      socketRef.current = null;
      setStatus('closed');
      log('sys', t({ zh: `连接关闭（code ${event.code}${event.reason ? `, ${event.reason}` : ''}）`, en: `Connection closed (code ${event.code}${event.reason ? `, ${event.reason}` : ''})` }));
    };
    socketRef.current = socket;
  };

  const disconnect = () => {
    socketRef.current?.close();
    socketRef.current = null;
  };

  const send = () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !message) return;
    socket.send(message);
    log('out', message);
  };

  const allText = events.map((e) => `[${e.time}] ${e.direction.toUpperCase().padEnd(3)} ${e.text}`).join('\n');

  return (
    <div className="space-y-4">
      <Panel title={t({ zh: '连接', en: 'Connection' })} bodyClassName="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="wss://echo.websocket.org"
            mono
            className="h-9 min-w-64 flex-1 text-xs"
            aria-label={t({ zh: 'WebSocket 地址', en: 'WebSocket URL' })}
            disabled={status === 'open' || status === 'connecting'}
          />
          <Badge tone={status === 'open' ? 'success' : status === 'closed' ? 'danger' : 'neutral'}>
            {t(STATUS_LABEL[status])}
          </Badge>
          {status === 'open' || status === 'connecting' ? (
            <Button variant="secondary" onClick={disconnect}>
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
      </Panel>

      {error ? <ToolAlert tone="error" title={error.localized} hint={error.hint} /> : null}

      <Panel title={t({ zh: '发送消息', en: 'Send message' })}>
        <div className="flex items-center gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            className="h-9 flex-1 text-xs"
            mono
            disabled={status !== 'open'}
            aria-label={t({ zh: '消息内容', en: 'Message content' })}
          />
          <Button variant="primary" onClick={send} disabled={status !== 'open'}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '发送', en: 'Send' })}
          </Button>
        </div>
      </Panel>

      <Panel
        title={t({ zh: '消息日志', en: 'Message log' })}
        subtitle={t({ zh: `${events.length} 条 · IN 接收 / OUT 发送 / SYS 状态`, en: `${events.length} entries · IN received / OUT sent / SYS status` })}
        actions={
          <div className="flex items-center gap-1.5">
            <CopyButton text={allText} label={{ zh: '复制日志', en: 'Copy log' }} />
            <Button variant="ghost" size="sm" onClick={() => setEvents([])}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t({ zh: '清空', en: 'Clear' })}
            </Button>
          </div>
        }
        bodyClassName="p-0"
      >
        {events.length === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center text-xs text-ink-3">{t({ zh: '连接后收发消息将在此显示', en: 'Messages sent and received after connecting appear here' })}</div>
        ) : (
          <ul className="max-h-[360px] divide-y divide-line overflow-auto">
            {events.map((event, index) => (
              <li key={index} className="flex items-start gap-2.5 px-4 py-2">
                <span className="shrink-0 font-mono text-[11px] text-ink-3">{event.time}</span>
                <span
                  className={`w-10 shrink-0 text-center font-mono text-[10px] uppercase ${
                    event.direction === 'in' ? 'text-ok' : event.direction === 'out' ? 'text-accent-strong' : 'text-ink-3'
                  }`}
                >
                  {event.direction}
                </span>
                <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-5 text-ink">{event.text}</code>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '使用浏览器原生 WebSocket，无 CORS 限制；wss:// 需目标服务证书有效。', en: 'Uses the native browser WebSocket; no CORS limits. wss:// requires a valid certificate on the target.' })}
      </p>
    </div>
  );
}
