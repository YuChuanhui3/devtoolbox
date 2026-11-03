import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CircleSlash,
  FileText,
  FolderInput,
  FolderSync,
  Image as ImageIcon,
  PackageOpen,
  ScanLine,
  ShieldAlert,
  Video as VideoIcon,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { formatBytes } from '@/lib/number';
import { downloadBlob, safeFilename } from '@/lib/download';
import { DQX_PREFIX, parseFrame } from '@/lib/qr-transfer';
import { pickDirectory } from '@/lib/fsaccess';
import { SyncReview } from './SyncReview';
import type {
  BatchEntryState,
  DropConnection,
  EntryStatus,
  TimelineBatch,
  TimelineItem,
} from './useDropConnection';

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
  if (mime.startsWith('video/')) return <VideoIcon className="h-4 w-4" aria-hidden="true" />;
  return <FileText className="h-4 w-4" aria-hidden="true" />;
}

const BATCH_STATUS: Record<TimelineBatch['status'], L10n> = {
  review: { zh: '待接收', en: 'Incoming' },
  active: { zh: '传输中', en: 'Transferring' },
  done: { zh: '已完成', en: 'Done' },
  failed: { zh: '失败', en: 'Failed' },
  canceled: { zh: '已取消', en: 'Canceled' },
};

const ENTRY_STATUS: Record<EntryStatus, L10n> = {
  pending: { zh: '等待中', en: 'Queued' },
  active: { zh: '传输中', en: 'Transferring' },
  done: { zh: '完成', en: 'Done' },
  failed: { zh: '失败', en: 'Failed' },
  canceled: { zh: '已取消', en: 'Canceled' },
  mismatch: { zh: '校验不一致', en: 'Checksum mismatch' },
  skipped: { zh: '已跳过', en: 'Skipped' },
};

const STATUS_COLOR: Record<EntryStatus, string> = {
  pending: 'text-ink-3',
  active: 'text-accent',
  done: 'text-ok',
  failed: 'text-danger',
  canceled: 'text-ink-3',
  mismatch: 'text-danger',
  skipped: 'text-ink-3',
};

function entryIcon(status: EntryStatus) {
  if (status === 'done') return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === 'mismatch') return <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === 'failed' || status === 'canceled') return <XCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === 'skipped') return <CircleSlash className="h-3.5 w-3.5" aria-hidden="true" />;
  return null;
}

function formatEta(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m${String(sec % 60).padStart(2, '0')}s`;
}

/** 目录批次里显示相对路径；单文件批次显示文件名。 */
function relPath(entry: BatchEntryState, root: string): string {
  if (root && entry.path.length > 1 && entry.path[0] === root) return entry.path.slice(1).join('/');
  return entry.path.join('/');
}

const COLLAPSE_AFTER = 25;

function EntryRow({
  entry,
  root,
  selectable,
  selected,
  onToggle,
}: {
  entry: BatchEntryState;
  root: string;
  selectable: boolean;
  selected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const { t } = useI18n();
  const percent = entry.size ? Math.min(100, Math.round((entry.received / entry.size) * 100)) : 0;
  const label = (
    <span className="flex min-w-0 items-center gap-2 text-xs">
      <span className="shrink-0 text-ink-3">{fileIcon(entry.mime)}</span>
      <span className="min-w-0 flex-1 truncate text-ink" title={relPath(entry, root)}>
        {relPath(entry, root)}
      </span>
      <span className="shrink-0 text-[11px] text-ink-3">
        {entry.status === 'active' && entry.size > 0 ? `${percent}% · ` : ''}
        {formatBytes(entry.size)}
      </span>
      <span className={`flex shrink-0 items-center gap-1 text-[11px] ${STATUS_COLOR[entry.status]}`}>
        {entryIcon(entry.status)}
        {t(ENTRY_STATUS[entry.status])}
      </span>
    </span>
  );
  if (selectable) {
    return (
      <li>
        <Checkbox checked={selected} onChange={onToggle} label={label} className="w-full" />
      </li>
    );
  }
  return <li>{label}</li>;
}

function ReceivedPreview({ entry }: { entry: BatchEntryState }) {
  const { t } = useI18n();
  if (!entry.blob || !entry.url) return null;
  return (
    <div className="mt-2 space-y-2">
      {entry.mime.startsWith('image/') ? (
        <img src={entry.url} alt={entry.name} className="max-h-56 rounded-lg border border-line object-contain" />
      ) : null}
      {entry.mime.startsWith('video/') ? (
        <video src={entry.url} controls className="max-h-56 w-full rounded-lg border border-line" />
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => downloadBlob(safeFilename(entry.name, 'received.bin'), entry.blob as Blob)}
      >
        <FolderInput className="h-3.5 w-3.5" aria-hidden="true" />
        {t({ zh: '保存文件', en: 'Save file' })}
      </Button>
    </div>
  );
}

function BatchCard({ conn, item }: { conn: DropConnection; item: TimelineBatch }) {
  const { t } = useI18n();
  const reviewable = !item.mine && item.status === 'review' && item.batchKind !== 'syncDir';
  const [selected, setSelected] = useState<Set<string>>(() => new Set(item.entries.map((e) => e.key)));
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (item.status === 'review') setSelected(new Set(item.entries.map((e) => e.key)));
  }, [item.status, item.entries]);

  const visible = expanded ? item.entries : item.entries.slice(0, COLLAPSE_AFTER);
  const hiddenCount = item.entries.length - COLLAPSE_AFTER;
  const percent = item.totalSize ? Math.min(100, Math.round((item.totalReceived / item.totalSize) * 100)) : 0;
  const eta = formatEta(item.etaMs);
  const keys = useMemo(
    () => item.entries.filter((e) => selected.has(e.key)).map((e) => e.key),
    [item.entries, selected],
  );
  const toggle = (key: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });

  const acceptMemory = () => conn.acceptBatch(item.batchId, keys, null);
  const acceptToFolder = async () => {
    const dir = await pickDirectory();
    if (dir) conn.acceptBatch(item.batchId, keys, dir);
  };

  const title =
    item.batchKind === 'files'
      ? item.entries.length === 1
        ? item.entries[0].name
        : t({ zh: `${item.entries.length} 个文件`, en: `${item.entries.length} files` })
      : item.batchKind === 'syncDir'
        ? t({ zh: `同步目录：${item.root}`, en: `Sync folder: ${item.root}` })
        : t({ zh: `文件夹：${item.root}`, en: `Folder: ${item.root}` });

  const transferDone = item.entries.filter((e) => e.status === 'done');
  const previews = item.mine ? [] : transferDone.filter((e) => e.blob);

  return (
    <div className={`max-w-[92%] rounded-card border border-line bg-surface p-3 shadow-card ${item.mine ? 'ml-auto' : ''}`}>
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 text-ink-3">
          {item.batchKind === 'files' ? fileIcon(item.entries[0]?.mime ?? '') : <FolderSync className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink" title={title}>
            {title}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-3">
            {formatBytes(item.totalReceived)} / {formatBytes(item.totalSize)} · {t(BATCH_STATUS[item.status])}
            {item.status === 'active' ? ` ${percent}%` : ''}
            {item.status === 'active' && item.speed > 0
              ? ` · ${formatBytes(item.speed, 1)}/s${eta ? ` · ${t({ zh: '剩余', en: 'left' })} ${eta}` : ''}`
              : ''}
            {item.batchKind === 'syncDir' || item.entries.length > 1 ? ` · ${item.entries.length} ${t({ zh: '项', en: 'items' })}` : ''}
          </p>
        </div>
        {item.status === 'active' ? (
          <Button variant="ghost" size="sm" onClick={() => conn.cancelBatch(item.batchId)}>
            {t({ zh: '取消', en: 'Cancel' })}
          </Button>
        ) : null}
      </div>

      {item.status === 'active' ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${percent}%` }} />
        </div>
      ) : null}

      {item.batchKind === 'syncDir' && !item.mine ? <SyncReview conn={conn} item={item} /> : null}

      {reviewable ? (
        <div className="mt-2.5 flex gap-2">
          {keys.length > 0 ? (
            item.batchKind === 'dir' && conn.fsWritable ? (
              <Button variant="primary" size="sm" onClick={() => void acceptToFolder()}>
                <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '存入文件夹', en: 'Save to folder' })}
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={acceptMemory}>
                <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '接收', en: 'Accept' })}
              </Button>
            )
          ) : null}
          {item.batchKind === 'dir' && conn.fsWritable ? (
            <Button variant="secondary" size="sm" onClick={acceptMemory}>
              {t({ zh: '浏览器内接收', en: 'Receive in browser' })}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => conn.rejectBatch(item.batchId)}>
            {t({ zh: '拒绝', en: 'Reject' })}
          </Button>
        </div>
      ) : null}

      {item.entries.length > 1 || item.batchKind !== 'files' ? (
        <ul className="mt-2 space-y-1">
          {visible.map((entry) => (
            <EntryRow
              key={entry.key}
              entry={entry}
              root={item.root}
              selectable={reviewable}
              selected={selected.has(entry.key)}
              onToggle={(checked) => toggle(entry.key, checked)}
            />
          ))}
          {hiddenCount > 0 && !expanded ? (
            <li>
              <button
                type="button"
                className="text-[11px] text-accent hover:underline"
                onClick={() => setExpanded(true)}
              >
                {t({ zh: `展开其余 ${hiddenCount} 项`, en: `Show ${hiddenCount} more` })}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {previews.length > 0 ? (
        <div className="mt-2 space-y-3 border-t border-dashed border-line pt-2">
          {previews.map((entry) => (
            <div key={entry.key}>
              <p className="text-[11px] text-ink-3">{relPath(entry, item.root)}</p>
              <ReceivedPreview entry={entry} />
            </div>
          ))}
        </div>
      ) : null}
      {previews.length === 0 && transferDone.length > 0 && !item.mine && item.batchKind !== 'files' ? (
        <p className="mt-2 text-[11px] text-ok">
          {t({ zh: '已按原目录结构写入所选文件夹', en: 'Written into the chosen folder with the original structure' })}
        </p>
      ) : null}
    </div>
  );
}

export function Timeline({ items, conn }: { items: TimelineItem[]; conn: DropConnection }) {
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
          const frame = item.body.trim().startsWith(DQX_PREFIX) ? parseFrame(item.body) : null;
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
                  : t({ zh: '对方扫码结果', en: 'Scanned by the peer' })}
              </p>
              {frame ? (
                <p className="font-mono text-xs leading-5">
                  {t({ zh: `DQX 帧 ${frame.index + 1}/${frame.total}`, en: `DQX frame ${frame.index + 1}/${frame.total}` })}
                  {!item.mine ? (
                    <span className="ml-1.5 text-ink-3">{t({ zh: '已并入上方二维码接收会话', en: 'merged into the QR session above' })}</span>
                  ) : null}
                </p>
              ) : (
                <p className="break-all font-mono text-xs leading-5">{item.body}</p>
              )}
            </div>
          );
        }
        return <BatchCard key={item.id} conn={conn} item={item} />;
      })}
      <div ref={bottomRef} />
    </div>
  );
}
