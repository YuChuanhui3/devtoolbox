import { useMemo } from 'react';
import { ScanLine } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Panel } from '@/components/ui/Panel';
import { CopyButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { DQX_PREFIX, parseFrame } from '@/lib/qr-transfer';
import type { TimelineItem, TimelineScan } from './useDropConnection';

function clock(ts: number, locale: string): string {
  return new Date(ts).toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function ScanInbox({ items }: { items: TimelineItem[] }) {
  const { t, locale } = useI18n();
  // 只看对端回传的扫码结果；本机扫码已经在 Timeline 里标成「本机扫码回传」。
  const scans = useMemo(
    () => items.filter((item): item is TimelineScan => item.kind === 'scan' && !item.mine),
    [items],
  );
  if (scans.length === 0) return null;

  const latest = scans[scans.length - 1];
  const history = scans.slice(0, -1).reverse();
  const latestFrame = latest.body.trim().startsWith(DQX_PREFIX) ? parseFrame(latest.body) : null;

  return (
    <Panel
      title={t({ zh: '扫码回传', en: 'Scanned results' })}
      subtitle={t({
        zh: '对方扫码得到的内容会实时显示在这里，可直接复制。',
        en: 'QR content scanned by the peer appears here live and can be copied directly.',
      })}
      actions={
        <Badge tone="accent">
          <ScanLine className="h-3 w-3" aria-hidden="true" />
          {scans.length} {t({ zh: '条', en: scans.length === 1 ? 'item' : 'items' })}
        </Badge>
      }
      bodyClassName="p-4"
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-accent/25 bg-accent-soft/30 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
              <ScanLine className="h-3 w-3" aria-hidden="true" />
              {t({ zh: '最新回传', en: 'Latest' })} · {clock(latest.ts, locale)}
            </p>
            {!latestFrame ? (
              <CopyButton text={latest.body} label={{ zh: '复制内容', en: 'Copy content' }} />
            ) : null}
          </div>
          {latestFrame ? (
            <p className="mt-2 font-mono text-xs leading-5 text-ink">
              {t({
                zh: `DQX 帧 ${latestFrame.index + 1}/${latestFrame.total}`,
                en: `DQX frame ${latestFrame.index + 1}/${latestFrame.total}`,
              })}
              <span className="ml-1.5 text-ink-3">
                {t({ zh: '已并入二维码接收会话', en: 'merged into the QR receive session' })}
              </span>
            </p>
          ) : (
            <pre
              aria-live="polite"
              className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-sm leading-6 text-ink"
            >
              {latest.body}
            </pre>
          )}
        </div>

        {history.length > 0 ? (
          <details className="rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5">
            <summary className="cursor-pointer select-none text-xs font-medium text-ink-2">
              {t({ zh: `历史回传（${history.length}）`, en: `Earlier results (${history.length})` })}
            </summary>
            <ul className="mt-2.5 space-y-2">
              {history.map((item) => {
                const frame = item.body.trim().startsWith(DQX_PREFIX) ? parseFrame(item.body) : null;
                return (
                  <li key={item.id} className="flex items-start justify-between gap-2 border-t border-dashed border-line pt-2 first:border-0 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-ink-3">{clock(item.ts, locale)}</p>
                      {frame ? (
                        <p className="mt-0.5 font-mono text-xs text-ink-2">
                          {t({
                            zh: `DQX 帧 ${frame.index + 1}/${frame.total} · 已并入接收会话`,
                            en: `DQX frame ${frame.index + 1}/${frame.total} · merged into the receive session`,
                          })}
                        </p>
                      ) : (
                        <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-ink-2">
                          {item.body}
                        </p>
                      )}
                    </div>
                    {!frame ? <CopyButton text={item.body} label={{ zh: '复制', en: 'Copy' }} /> : null}
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </div>
    </Panel>
  );
}
