import { useMemo, useRef, useState } from 'react';
import { FileStack, Files, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { CopyIconButton, DownloadButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { toToolError, type ToolError } from '@/lib/errors';
import { convertFormat, detectFormat, FORMATS, sniffFormat, type ConvertOptions, type FormatId } from '@/lib/formats';
import { downloadAll, safeFilename } from '@/lib/download';
import { formatBytes } from '@/lib/number';

interface BatchSource {
  id: string;
  name: string;
  size: number;
  from: FormatId;
  text: string;
}

interface BatchRow extends BatchSource {
  output?: string;
  error?: ToolError;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;

let batchSeq = 0;

/** 输出文件名：去掉原扩展名，换成目标格式的扩展名。 */
const targetName = (name: string, to: FormatId) => {
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return safeFilename(`${base || 'data'}.${FORMATS[to].extension}`, `data.${FORMATS[to].extension}`);
};

export function BatchFiles({ to, options }: { to: FormatId; options: ConvertOptions }) {
  const { t } = useI18n();
  const [sources, setSources] = useState<BatchSource[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo<BatchRow[]>(
    () =>
      sources.map((source) => {
        try {
          return { ...source, output: convertFormat(source.text, source.from, to, options) };
        } catch (caught) {
          return { ...source, error: toToolError(caught) };
        }
      }),
    [sources, to, options],
  );

  const addFiles = async (files: File[]) => {
    const next: BatchSource[] = [];
    const skipped: string[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        skipped.push(file.name);
        continue;
      }
      try {
        const text = await file.text();
        const detected = detectFormat(file.name);
        next.push({
          id: `f${(batchSeq += 1)}`,
          name: file.name,
          size: file.size,
          from: detected === 'text' ? sniffFormat(text) : detected,
          text,
        });
      } catch {
        skipped.push(file.name);
      }
    }
    setRejected(skipped);
    if (next.length) setSources((prev) => [...prev, ...next]);
  };

  const done = rows.filter((row) => row.output !== undefined);
  const failed = rows.filter((row) => row.error);

  return (
    <Panel
      title={t({ zh: '文件批量转换', en: 'Batch file conversion' })}
      subtitle={t({
        zh: '拖入文件即按当前目标格式转换，全部在浏览器本地完成',
        en: 'Drop files to convert them with the current target format, entirely in the browser',
      })}
      actions={
        rows.length ? (
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              disabled={!done.length}
              onClick={() =>
                void downloadAll(
                  done.map((row) => ({
                    filename: targetName(row.name, to),
                    blob: new Blob([row.output as string], { type: FORMATS[to].mime }),
                  })),
                )
              }
            >
              <FileStack className="h-3.5 w-3.5" aria-hidden="true" />
              {t({ zh: `下载全部（${done.length}）`, en: `Download all (${done.length})` })}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSources([])}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t({ zh: '清空列表', en: 'Clear list' })}
            </Button>
          </div>
        ) : null
      }
      bodyClassName="space-y-3"
    >
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void addFiles(Array.from(event.dataTransfer.files));
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-card border border-dashed px-4 py-6 text-center transition-colors duration-200 ${
          dragging ? 'border-accent bg-accent-soft/40' : 'border-line bg-surface-2/40'
        }`}
      >
        <Files className="h-5 w-5 text-ink-3" aria-hidden="true" />
        <p className="text-sm text-ink-2">
          {t({
            zh: '把 .json / .csv / .tsv / .yaml / .xml / .ndjson / .md / .properties / .txt 文件拖到这里',
            en: 'Drop .json / .csv / .tsv / .yaml / .xml / .ndjson / .md / .properties / .txt files here',
          })}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".json,.jsonl,.ndjson,.csv,.tsv,.yaml,.yml,.xml,.md,.markdown,.properties,.env,.ini,.txt,.log"
          className="hidden"
          onChange={(event) => {
            if (event.target.files) void addFiles(Array.from(event.target.files));
            event.target.value = '';
          }}
        />
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
          {t({ zh: '选择文件', en: 'Choose files' })}
        </Button>
      </div>

      {rejected.length ? (
        <ToolAlert
          tone="warning"
          title={t({ zh: '部分文件已跳过', en: 'Some files were skipped' })}
          hint={{
            zh: `超过 8 MB 或无法读取：${rejected.join('、')}`,
            en: `Over 8 MB or unreadable: ${rejected.join(', ')}`,
          }}
        />
      ) : null}

      {rows.length ? (
        <ul className="divide-y divide-line rounded-card border border-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink" title={row.name}>
                  {row.name}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
                  <span>{formatBytes(row.size)}</span>
                  <Badge tone="neutral">{FORMATS[row.from].label}</Badge>
                  <span aria-hidden="true">→</span>
                  <Badge tone={row.error ? 'danger' : 'accent'}>{FORMATS[to].label}</Badge>
                  {row.error ? <span className="truncate">{t(row.error.localized)}</span> : null}
                  {row.output !== undefined ? <span>{formatBytes(new Blob([row.output]).size)}</span> : null}
                </p>
              </div>
              {row.output !== undefined ? (
                <div className="flex items-center gap-1.5">
                  <CopyIconButton text={row.output} label={t({ zh: '复制结果', en: 'Copy result' })} />
                  <DownloadButton
                    filename={targetName(row.name, to)}
                    content={row.output}
                    mime={FORMATS[to].mime}
                  />
                </div>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSources((prev) => prev.filter((item) => item.id !== row.id))}
                aria-label={t({ zh: `移除 ${row.name}`, en: `Remove ${row.name}` })}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {failed.length ? (
        <p className="text-[11px] text-ink-3">
          {t({
            zh: `${failed.length} 个文件无法按目标格式生成——多数因为内容不是数组，或源格式与目标结构不匹配。`,
            en: `${failed.length} file(s) could not produce the target format — usually because the content is not an array, or the source structure does not fit the target.`,
          })}
        </p>
      ) : null}
    </Panel>
  );
}
