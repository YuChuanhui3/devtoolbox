import { useCallback, useState } from 'react';
import { ArrowRight, Eye, ImageDown, Images, Loader2, Play, Trash2 } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { ActionBar, DownloadButton } from '@/components/tool/ToolActions';
import { ImageDropzone } from '@/components/tool/ImageDropzone';
import { ImagePreviewModal } from '@/components/tool/ImagePreviewModal';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useImageFiles } from '@/hooks/useImageFiles';
import { useImageBatch } from '@/hooks/useImageBatch';
import { useI18n } from '@/i18n/I18nProvider';
import { formatBytes } from '@/lib/number';
import { formatLabelForMime, replaceExtension } from '@/lib/image';
import type { ImagePreviewState } from '@/types/image';

type OutputMime = 'image/webp' | 'image/jpeg' | 'image/png';

function inputFormatLabel(file: File): string {
  const extension = file.name.split('.').pop()?.toUpperCase();
  if (extension) return extension === 'JPEG' ? 'JPG' : extension;
  return formatLabelForMime(file.type);
}

export default function ImageConvertTool() {
  const { t } = useI18n();
  const files = useImageFiles();

  const [target, setTarget] = useState<OutputMime>('image/webp');
  const [quality, setQuality] = useState(85);
  const [background, setBackground] = useState('#ffffff');
  const [preview, setPreview] = useState<ImagePreviewState | null>(null);

  const resultFilename = useCallback(
    (sourceName: string, result: { extension: string }) => replaceExtension(sourceName, result.extension),
    [],
  );

  const batch = useImageBatch({
    items: files.items,
    setError: files.setError,
    removeSource: files.removeItem,
    clearSources: files.clearItems,
    resultFilename,
  });

  const { results, isProcessing, progress, totalOriginal, totalResult } = batch;

  const convertAll = () =>
    batch.processAll(
      () => ({ mime: target, quality: quality / 100, maxWidth: 0, background }),
      { success: t({ zh: '格式转换完成', en: 'Format converted' }) },
    );

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: '上传图片', en: 'Upload images' })}
        subtitle={t({ zh: '文件仅在浏览器本地处理，不会上传服务器', en: 'Files are processed locally in the browser and never uploaded' })}
      >
        <ImageDropzone
          onFiles={files.addFiles}
          multiple
          hint={t({ zh: '支持 JPG / PNG / WebP / GIF / BMP，最多 20 张，单张不超过 20MB', en: 'JPG / PNG / WebP / GIF / BMP supported, up to 20 images, 20MB each' })}
        />
      </Panel>

      {files.error ? (
        <ToolAlert
          tone="error"
          title={files.error.localized}
          hint={files.error.hint}
        />
      ) : null}

      <Panel title={t({ zh: '转换参数', en: 'Conversion settings' })} bodyClassName="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="convert-target" className="text-xs text-ink-3">
              {t({ zh: '目标格式', en: 'Target format' })}
            </label>
            <Select
              id="convert-target"
              value={target}
              onChange={(event) => setTarget(event.target.value as OutputMime)}
              className="h-9"
              wrapperClassName="mt-1.5 w-full"
            >
              <option value="image/webp">WebP</option>
              <option value="image/jpeg">JPG</option>
              <option value="image/png">PNG</option>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="convert-quality" className="text-ink-3">
                {t({ zh: '图片质量', en: 'Image quality' })}
              </label>
              <span className="font-mono font-semibold text-accent-strong">{quality}</span>
            </div>
            <input
              id="convert-quality"
              type="range"
              min={10}
              max={100}
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
              className="mt-2 w-full accent-[var(--accent)]"
              disabled={target === 'image/png'}
            />
            {target === 'image/png' ? (
              <p className="mt-1 text-[10px] text-ink-3">{t({ zh: 'PNG 为无损格式，质量参数不生效', en: 'PNG is lossless; the quality setting has no effect' })}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="convert-bg" className="text-xs text-ink-3">
              {t({ zh: 'JPG 背景填充', en: 'JPG background fill' })}
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="convert-bg"
                type="color"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
                className="h-9 w-10 cursor-pointer rounded-lg border border-line bg-surface p-1"
              />
              <span className="text-[11px] text-ink-3">{t({ zh: '透明区域填充色', en: 'Color used for transparent areas' })}</span>
            </div>
          </div>
        </div>

        <ActionBar className="shadow-none">
          <Button variant="primary" onClick={() => void convertAll()} disabled={files.items.length === 0 || isProcessing}>
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            {isProcessing ? t({ zh: `转换中 ${progress}%`, en: `Converting ${progress}%` }) : t({ zh: '开始转换', en: 'Start converting' })}
          </Button>
          <Button variant="secondary" onClick={() => void batch.downloadAllResults()} disabled={Object.keys(results).length === 0}>
            <Images className="h-4 w-4" aria-hidden="true" />
            {t({ zh: '全部下载', en: 'Download all' })}
          </Button>
          <Button variant="ghost" onClick={batch.clearAll} disabled={files.items.length === 0 || isProcessing}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t({ zh: '清空列表', en: 'Clear list' })}
          </Button>
          <span className="ml-auto text-[11px] text-ink-3">
            {t({ zh: `${files.items.length} 张图片 · ${formatBytes(totalOriginal)}`, en: `${files.items.length} images · ${formatBytes(totalOriginal)}` })}
          </span>
        </ActionBar>

        {isProcessing ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </Panel>

      {files.items.length > 0 ? (
        <Panel
          title={t({ zh: '文件列表', en: 'File list' })}
          subtitle={
            totalResult > 0
              ? t({ zh: `处理后总计 ${formatBytes(totalResult)}`, en: `Total after conversion ${formatBytes(totalResult)}` })
              : t({ zh: '上传后点击开始转换', en: 'Upload images, then start converting' })
          }
          actions={<Badge tone="accent">{formatLabelForMime(target)}</Badge>}
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-line">
            {files.items.map((item) => {
              const result = results[item.id];

              return (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <img
                    src={item.url}
                    alt={item.file.name}
                    className="h-11 w-11 shrink-0 rounded-lg border border-line object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{item.file.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
                      <span>{formatBytes(item.file.size)}</span>
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      <span className="rounded-lg bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">{inputFormatLabel(item.file)}</span>
                      <span>→</span>
                      <span className="rounded-lg bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] text-accent-strong">
                        {formatLabelForMime(target)}
                      </span>
                      {result ? (
                        <span className="font-medium text-ink-2">{formatBytes(result.size)}</span>
                      ) : (
                        <span>{isProcessing ? t({ zh: '等待处理', en: 'Queued' }) : t({ zh: '待转换', en: 'Ready to convert' })}</span>
                      )}
                    </p>
                  </div>

                  {result ? (
                    <div className="flex items-center gap-0.5">
                      <IconButton
                        label={t({ zh: '预览对比', en: 'Preview comparison' })}
                        size="sm"
                        onClick={() => setPreview(batch.buildPreview(item, result))}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                      <DownloadButton
                        filename={resultFilename(item.file.name, result)}
                        blob={result.blob}
                        label={t({ zh: '下载', en: 'Download' })}
                        variant="ghost"
                      />
                    </div>
                  ) : null}

                  <IconButton
                    label={t({ zh: `移除 ${item.file.name}`, en: `Remove ${item.file.name}` })}
                    size="sm"
                    tone="danger"
                    disabled={isProcessing}
                    onClick={() => batch.removeItem(item.id)}
                    className={result ? '' : 'ml-auto'}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      <div className="flex items-center justify-center gap-2 text-[11px] text-ink-3">
        <ImageDown className="h-3.5 w-3.5" aria-hidden="true" />
        {t({
          zh: '输出格式支持 JPG / PNG / WebP；GIF 会转换为静态图片，BMP 会被浏览器解码后重新编码。',
          en: 'Output supports JPG / PNG / WebP; GIF becomes a still image and BMP is decoded by the browser and re-encoded.',
        })}
      </div>

      <ImagePreviewModal preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
