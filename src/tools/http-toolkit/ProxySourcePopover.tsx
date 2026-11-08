import { useEffect, useRef } from 'react';
import { Globe, Monitor, Puzzle, Terminal, X } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { FETCH_MODES, type ProxySource, type SendChannel } from '@/lib/net';

/**
 * 取数通道（代理源）选择气泡。挂在工作台状态栏的 ShieldCheck 图标上：
 * 浏览器=页面直连；扩展=由浏览器扩展在页面侧 hook fetch，前端依旧直连；
 * 网络=公共 CORS 代理三选一；程序=本地代理程序转发，地址可配置。
 * 气泡相对包裹按钮定位，展开在按钮正上方。
 */
const SOURCE_META: { id: ProxySource; Icon: typeof Globe; label: { zh: string; en: string } }[] = [
  { id: 'browser', Icon: Monitor, label: { zh: '浏览器', en: 'Browser' } },
  { id: 'network', Icon: Globe, label: { zh: '网络', en: 'Network' } },
  { id: 'program', Icon: Terminal, label: { zh: '程序', en: 'Program' } },
  { id: 'extension', Icon: Puzzle, label: { zh: '浏览器扩展', en: 'Browser extension' } },
];

const SOURCE_NOTE: Record<ProxySource, { zh: string; en: string }> = {
  browser: { zh: '页面直连目标站点，受浏览器 CORS 策略限制', en: 'Direct to the target site, bounded by browser CORS policy' },
  network: { zh: '经公共 CORS 代理转发，URL 会暴露给代理方，仅调试用', en: 'Routed through a public CORS proxy; the URL is exposed to the proxy operator — debugging only' },
  program: { zh: '转发给本地代理程序，由它带响应头与请求体直连目标', en: 'Forwarded to a local proxy program, which fetches the target with full headers and body' },
  extension: { zh: '已安装的扩展在页面侧接管 fetch，前端依旧直连；未安装时等于浏览器直连', en: 'An installed extension intercepts fetch on the page side; the frontend still fetches directly' },
};

export function ProxySourcePopover({ open, onClose, channel, onChange }: {
  open: boolean;
  onClose: () => void;
  channel: SendChannel;
  onChange: (channel: SendChannel) => void;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);

  // 气泡打开时才挂载监听；点击外部与 Esc 均关闭。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  const pickSource = (source: ProxySource) => {
    // 程序源保留已填地址；切走时 programBase 不再参与解析。
    onChange({ source, mode: source === 'network' ? channel.mode : 'direct', ...(source === 'program' ? { programBase: channel.programBase } : {}) });
  };

  const pickNetworkMode = (mode: SendChannel['mode']) => onChange({ ...channel, mode });
  const setProgramBase = (programBase: string) => onChange({ ...channel, programBase });

  return (
    <div ref={rootRef} className="wb-proxy-popover" role="dialog" aria-label={t({ zh: '取数通道', en: 'Request channel' })}>
      <div className="wb-proxy-popover-head">
        <span>{t({ zh: '取数通道', en: 'Request channel' })}</span>
        <button type="button" className="wb-icon" onClick={onClose} aria-label={t({ zh: '关闭', en: 'Close' })}><X size={14} /></button>
      </div>
      <div className="wb-proxy-sources">
        {SOURCE_META.map(({ id, Icon, label }) => {
          const active = channel.source === id;
          return (
            <button key={id} type="button" className={`wb-proxy-source${active ? ' wb-proxy-source-active' : ''}`} aria-pressed={active} onClick={() => pickSource(id)}>
              <Icon size={15} />
              <span>{t(label)}</span>
            </button>
          );
        })}
      </div>
      <p className="wb-proxy-note">{t(SOURCE_NOTE[channel.source])}</p>

      {channel.source === 'program' ? (
        <label className="wb-proxy-program">
          <span>{t({ zh: '程序地址', en: 'Program URL' })}</span>
          <input
            type="url"
            value={channel.programBase ?? ''}
            placeholder="http://127.0.0.1:8080"
            onChange={(event) => setProgramBase(event.target.value)}
            aria-label={t({ zh: '本地代理程序地址', en: 'Local proxy program URL' })}
          />
        </label>
      ) : null}

      {channel.source === 'network' ? (
        <div className="wb-proxy-network">
          {FETCH_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`wb-proxy-netmode${channel.mode === item.id ? ' wb-proxy-source-active' : ''}`}
              aria-pressed={channel.mode === item.id}
              onClick={() => pickNetworkMode(item.id)}
              title={item.note}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
