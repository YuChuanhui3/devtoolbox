import { useEffect, useRef, useState } from 'react';
import { FolderOpen, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { useI18n } from '@/i18n/I18nProvider';
import { pickDirectory } from '@/lib/fsaccess';
import type { DiffMode } from '@/lib/dirSync';
import type { DropConnection, TimelineBatch } from './useDropConnection';

const MAX_LIST = 40;

function Bucket({
  title,
  tone,
  files,
  selected,
  onToggle,
}: {
  title: string;
  tone: 'add' | 'update' | 'remove';
  files: string[];
  selected: Set<string>;
  onToggle: (key: string, checked: boolean) => void;
}) {
  if (files.length === 0) return null;
  const toneClass =
    tone === 'remove' ? 'text-danger' : tone === 'update' ? 'text-warn' : 'text-ok';
  return (
    <div className="min-w-0">
      <p className={`mb-1 text-[11px] font-medium ${toneClass}`}>
        {title} · {files.length}
      </p>
      <ul className="max-h-36 space-y-0.5 overflow-auto">
        {files.slice(0, MAX_LIST).map((key) => (
          <li key={key}>
            <Checkbox
              checked={selected.has(key)}
              onChange={(checked) => onToggle(key, checked)}
              label={<span className="break-all font-mono text-[11px]">{key}</span>}
              className="w-full text-xs"
            />
          </li>
        ))}
        {files.length > MAX_LIST ? (
          <li className="text-[11px] text-ink-3">… {files.length - MAX_LIST}</li>
        ) : null}
      </ul>
    </div>
  );
}

export function SyncReview({ conn, item }: { conn: DropConnection; item: TimelineBatch }) {
  const { t } = useI18n();
  const sync = item.sync;
  const [mode, setMode] = useState<DiffMode>('quick');
  const dirRef = useRef<FileSystemDirectoryHandle | null>(null);
  const [pull, setPull] = useState<Set<string>>(new Set());
  const [del, setDel] = useState<Set<string>>(new Set());

  const diff = sync?.diff;
  useEffect(() => {
    if (!diff) return;
    setPull(new Set([...diff.add, ...diff.update]));
    setDel(new Set());
  }, [diff]);

  const startDiff = async (nextMode: DiffMode) => {
    const dir = dirRef.current ?? (await pickDirectory());
    if (!dir) return;
    dirRef.current = dir;
    setMode(nextMode);
    await conn.startSyncDiff(item.batchId, dir, nextMode);
  };

  const run = () => {
    conn.runSync(
      item.batchId,
      Array.from(pull),
      Array.from(del),
    );
  };

  if (!sync || sync.phase === 'need-dir') {
    return (
      <div className="mt-2 space-y-2 border-t border-dashed border-line pt-2.5">
        <p className="text-xs text-ink-2">
          {t({
            zh: '选择本机上的同名文件夹，与对方目录比对差异后按需增量拉取或删除。',
            en: 'Pick the matching folder on this device to diff against the peer, then pull or delete only what changed.',
          })}
        </p>
        {conn.fsWritable ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => void startDiff('quick')}>
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              {t({ zh: '选择文件夹并快速比对', en: 'Pick folder & quick diff' })}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void startDiff('exact')}>
              {t({ zh: '精确比对（逐文件哈希）', en: 'Exact diff (per-file hash)' })}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-danger">
            {t({
              zh: '此浏览器不支持目录读写，无法进行文件夹同步。',
              en: 'This browser cannot access directories, so folder sync is unavailable.',
            })}
          </p>
        )}
      </div>
    );
  }

  if (sync.phase === 'diffing') {
    return (
      <p className="mt-2 text-xs text-ink-3">
        {t({ zh: '正在比对目录差异…', en: 'Diffing the directory…' })}
        {sync.progress ? ` ${sync.progress[0]}/${sync.progress[1]}` : ''}
      </p>
    );
  }

  if (sync.phase === 'review' && diff) {
    return (
      <div className="mt-2 space-y-2.5 border-t border-dashed border-line pt-2.5">
        <p className="text-xs text-ink-2">
          {t({ zh: `目标文件夹：${sync.targetName ?? ''}（${sync.mode === 'exact' ? t({ zh: '精确比对', en: 'exact' }) : t({ zh: '快速比对', en: 'quick' })}）`, en: `Target folder: ${sync.targetName ?? ''} (${sync.mode === 'exact' ? 'exact' : 'quick'} diff)` })}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Bucket
            title={t({ zh: '新增', en: 'New' })}
            tone="add"
            files={diff.add}
            selected={pull}
            onToggle={(key, checked) =>
              setPull((prev) => {
                const next = new Set(prev);
                if (checked) next.add(key);
                else next.delete(key);
                return next;
              })
            }
          />
          <Bucket
            title={t({ zh: '有更新', en: 'Changed' })}
            tone="update"
            files={diff.update}
            selected={pull}
            onToggle={(key, checked) =>
              setPull((prev) => {
                const next = new Set(prev);
                if (checked) next.add(key);
                else next.delete(key);
                return next;
              })
            }
          />
          <Bucket
            title={t({ zh: '本机多余', en: 'Extra here' })}
            tone="remove"
            files={diff.remove}
            selected={del}
            onToggle={(key, checked) =>
              setDel((prev) => {
                const next = new Set(prev);
                if (checked) next.add(key);
                else next.delete(key);
                return next;
              })
            }
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" disabled={pull.size === 0 && del.size === 0} onClick={run}>
            {t({ zh: `执行同步（拉 ${pull.size} / 删 ${del.size}）`, en: `Sync (pull ${pull.size} / delete ${del.size})` })}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void startDiff(mode)}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '重新比对', en: 'Re-diff' })}
          </Button>
        </div>
        <p className="text-[11px] text-ink-3">
          {t({
            zh: '「本机多余」默认不勾选；勾选的文件会在同步前从本机文件夹删除。',
            en: '"Extra here" is unchecked by default; ticked files are deleted from the local folder before syncing.',
          })}
        </p>
      </div>
    );
  }

  if (sync.phase === 'running') {
    return (
      <p className="mt-2 text-xs text-ink-3">
        {t({ zh: '同步执行中…', en: 'Syncing…' })}
      </p>
    );
  }

  return (
    <p className="mt-2 text-xs text-ok">
      {t({ zh: '目录同步完成', en: 'Directory sync complete' })}
    </p>
  );
}
