import { useEffect, useRef } from 'react';
import { FileText, Image as ImageIcon, PackageOpen, ScanLine, Video as VideoIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { formatBytes } from '@/lib/number';
import { downloadBlob, safeFilename } from '@/lib/download';
import type { TimelineFile, TimelineItem } from './useDropConnection';

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
  if (mime.startsWith('video/')) return <VideoIcon className="h-4 w-4" aria-hidden="true" />;
  return <FileText className="h-4 w-4" aria-hidden="true" />;
}

const STATUS_TEXT: Record<TimelineFile['status'], L10n> = {
  incoming: { zh: '待接收', en: 'Incoming' },
  waiting: { zh: '等待对方接收', en: 'Waiting for peer' },
  active: { zh: '传输中', en: 'Transferring' },
  done: { zh: '已完成', en: 'Done' },
  rejected: { zh: '被拒绝', en: 'Rejected' },
  canceled: { zh: '已取消', en: 'Canceled' },
  failed: { zh: '失败', en: 'Failed' },
};

function FileCard({
  item,
  onAccept,
  onReject,
}: {
  item: TimelineFile;
  onAccept: (item: TimelineFile) => void;
  onReject: (item: TimelineFile) => void;
}) {
  const { t } = useI18n();
  const percent = item.size ? Math.min(100, Math.round((item.received / item.size) * 100)) : 0;
  return (
    <div
      className={`max-w-[86%] rounded-card border border-line bg-surface p-3 shadow-card ${item.mine ? 'ml-auto' : ''}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 text-ink-3">{fileIcon(item.mime)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink" title={item.name}>
            {item.name}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-3">
            {formatBytes(item.size)} · {t(STATUS_TEXT[item.status])}
            {item.status === 'active' ? ` ${percent}%` : ''}
          </p>
        </div>
      </div>
      {item.status === 'active' ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      {item.status === 'incoming' ? (
        <div className="mt-2.5 flex gap-2">
          <Button variant="primary" size="sm" onClick={() => onAccept(item)}>
            <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '接收', en: 'Accept' })}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onReject(item)}>
            {t({ zh: '拒绝', en: 'Reject' })}
          </Button>
        </div>
      ) : null}
      {item.status === 'done' && item.blob ? (
        <div className="mt-2.5 space-y-2">
          {item.mime.startsWith('image/') && item.url ? (
            <img src={item.url} alt={item.name} className="max-h-56 rounded-lg border border-line object-contain" />
          ) : null}
          {item.mime.startsWith('video/') && item.url ? (
            <video src={item.url} controls className="max-h-56 w-full rounded-lg border border-line" />
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadBlob(safeFilename(item.name, 'received.bin'), item.blob as Blob)}
          >
            {t({ zh: '保存文件', en: 'Save file' })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function Timeline({ items, onAccept, onReject }: { items: TimelineItem[]; onAccept: (i: TimelineFile) => void; onReject: (i: TimelineFile) => void }) {
  const { t } = useI18n();
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [items.length]);
  return (
    <div className="flex max-h-[420px] min-h-[240px] flex-col gap-3 overflow-auto px-1 py-2">
      {items.map((item) => {
        if (item.kind === 'sys') {
          return (
            <p key={item.id} className="text-center text-[11px] text-ink-3">
              {t(item.text)}
            </p>
          );
        }
        if (item.kind === 'text') {
          return (
            <div
              key={item.id}
              className={`max-w-[86%] whitespace-pre-wrap break-words rounded-card px-3.5 py-2.5 text-sm leading-6 shadow-card ${
                item.mine ? 'ml-auto bg-accent-strong text-accent-contrast' : 'border border-line bg-surface text-ink'
              }`}
            >
              {item.body}
            </div>
          );
        }
        if (item.kind === 'scan') {
          return (
            <div
              key={item.id}
              className={`max-w-[86%] rounded-card px-3.5 py-2.5 shadow-card ${
                item.mine ? 'ml-auto border border-accent/40 bg-surface text-ink' : 'border border-line bg-surface-2 text-ink'
              }`}
            >
              <p className="mb-1 flex items-center gap-1.5 text-[11px] text-ink-3">
                <ScanLine className="h-3 w-3" aria-hidden="true" />
                {item.mine
                  ? t({ zh: '本机扫码回传', en: 'Sent from this scanner' })
                  : t({ zh: '对方手机扫码结果', en: 'Scanned by the peer\'s phone' })}
              </p>
              <p className="break-all font-mono text-xs leading-5">{item.body}</p>
            </div>
          );
        }
        return <FileCard key={item.id} item={item} onAccept={onAccept} onReject={onReject} />;
      })}
      <div ref={bottomRef} />
    </div>
  );
}
