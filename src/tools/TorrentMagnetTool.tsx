import { useRef, useState } from 'react';
import { FileUp, Link2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { ActionBar, CopyButton, CopyIconButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { toToolError, type ToolError } from '@/lib/errors';
import { formatBytes } from '@/lib/number';
import { torrentBytesToMagnet, type TorrentInfo } from '@/lib/torrent';

interface PickedFile {
  name: string;
  size: number;
}

export default function TorrentMagnetTool() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [info, setInfo] = useState<TorrentInfo | null>(null);
  const [error, setError] = useState<ToolError | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const clear = () => {
    setPicked(null);
    setInfo(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    clear();
    setPicked({ name: file.name, size: file.size });
    setIsRunning(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setInfo(await torrentBytesToMagnet(bytes));
    } catch (cause) {
      setError(toToolError(cause));
    } finally {
      setIsRunning(false);
    }
  };

  const rows = info
    ? [
        { label: t({ zh: '名称', en: 'Name' }), value: info.name },
        { label: 'Info Hash (BTIH, Base32)', value: info.infoHash, mono: true },
        { label: t({ zh: '文件数量', en: 'File count' }), value: String(info.fileCount) },
        { label: t({ zh: '总大小', en: 'Total size' }), value: formatBytes(info.totalSize) },
        { label: 'Tracker', value: String((info.magnet.match(/&tr=/g) ?? []).length) },
        {
          label: t({ zh: '私有种子', en: 'Private torrent' }),
          value: info.isPrivate ? t({ zh: '是（仅限指定 Tracker）', en: 'Yes (specified trackers only)' }) : t({ zh: '否', en: 'No' }),
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <ActionBar>
        <Button variant="primary" onClick={() => fileInputRef.current?.click()} disabled={isRunning}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          {isRunning ? t({ zh: '解析中…', en: 'Parsing…' }) : t({ zh: '选择 .torrent 文件', en: 'Choose .torrent file' })}
        </Button>
        <span className="px-1 text-xs text-ink-3">
          {t({ zh: 'BTIH = SHA-1(info)，磁力链自动携带 Tracker', en: 'BTIH = SHA-1(info); magnet links carry trackers automatically' })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {info ? <CopyButton text={info.magnet} label={{ zh: '复制磁力链', en: 'Copy magnet link' }} /> : null}
          {info ? (
            <Button variant="secondary" onClick={clear}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t({ zh: '清除', en: 'Clear' })}
            </Button>
          ) : null}
        </div>
      </ActionBar>

      <input
        ref={fileInputRef}
        type="file"
        accept=".torrent,application/x-bittorrent"
        className="sr-only"
        aria-label={t({ zh: '选择种子文件', en: 'Choose torrent file' })}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {error ? <ToolAlert tone="error" title={error.localized} hint={error.hint} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={t({ zh: '种子文件', en: 'Torrent file' })}
          subtitle={picked ? t({ zh: `${picked.name}（${formatBytes(picked.size)}）`, en: `${picked.name} (${formatBytes(picked.size)})` }) : undefined}
          bodyClassName="p-0"
        >
          <div
            className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 px-4 text-center"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
            }}
          >
            <FileUp className="h-8 w-8 text-ink-3" aria-hidden="true" />
            <p className="text-sm text-ink-2">{picked ? picked.name : t({ zh: '点击或拖拽 .torrent 文件到这里', en: 'Click or drop a .torrent file here' })}</p>
            <p className="text-xs text-ink-3">{t({ zh: '文件仅在本地浏览器解析，不会上传到任何服务器。', en: 'Files are parsed locally in your browser and never uploaded to any server.' })}</p>
          </div>
        </Panel>

        <Panel
          title={t({ zh: '磁力链接', en: 'Magnet link' })}
          subtitle={info ? 'magnet:?xt=urn:btih:…' : t({ zh: '解析后生成', en: 'Generated after parsing' })}
          actions={info ? <CopyIconButton text={info.magnet} label={{ zh: '复制磁力链', en: 'Copy magnet link' }} /> : undefined}
          bodyClassName="p-0"
        >
          {info ? (
            <div className="flex h-full min-h-[180px] flex-col gap-3 p-4">
              <div className="flex items-start gap-2 rounded-lg border border-accent/25 bg-accent-soft px-3 py-2.5">
                <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
                <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-accent-strong">
                  {info.magnet}
                </code>
              </div>
              <dl className="mt-auto grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                {rows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
                    <dt className="shrink-0 text-ink-3">{row.label}</dt>
                    <dd className={`min-w-0 truncate text-right text-ink ${row.mono ? 'font-mono' : ''}`} title={row.value}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <div className="flex min-h-[180px] items-center justify-center px-4 text-xs text-ink-3">
              {t({ zh: '选择种子文件后在此显示磁力链接与信息摘要', en: 'Pick a torrent file to show the magnet link and info summary here' })}
            </div>
          )}
        </Panel>
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: 'Info Hash 由浏览器对种子的 info 段做规范化 Bencode 重编码后计算 SHA-1 得到（Base32 无填充）。若下载器报哈希不匹配，可能是原文件的 info 段编码不规范。',
          en: 'The Info Hash is SHA-1 of the torrent’s info dict re-encoded canonically as Bencode in your browser (unpadded Base32). If your downloader reports a mismatch, the original file’s info dict may be non-canonically encoded.',
        })}
      </p>
    </div>
  );
}
