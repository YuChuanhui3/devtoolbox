import { useCallback, useState } from 'react';
import { ArrowRight, Eye, Images, Loader2, Play, Trash2 } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
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
import { replaceExtension } from '@/lib/image';
import type { ImagePreviewState } from '@/types/image';
import { cn } from '@/lib/cn';

type OutputFormat = 'auto' | 'image/webp' | 'image/jpeg' | 'image/png';

function resolveOutputMime(format: OutputFormat, inputType: string): string {
  if (format !== 'auto') return format;
  if (inputType === 'image/jpeg' || inputType === 'image/png' || inputType === 'image/webp') {
    return inputType;
  }
  return 'image/webp';
}

/** 与原命名规则一致：在扩展名前插入 -compressed。 */
function compressedName(sourceName: string, extension: string): string {
  return replaceExtension(sourceName, extension).replace(/\.(\w+)$/, '-compressed.$1');
}

export default function ImageCompressTool() {
  const { t } = useI18n();
  const files = useImageFiles();

  const [quality, setQuality] = useState(80);
  const [maxWidth, setMaxWidth] = useState('1920');
  const [format, setFormat] = useState<OutputFormat>('auto');
  const [background, setBackground] = useState('#ffffff');
  const [preview, setPreview] = useState<ImagePreviewState | null>(null);

  const resultFilename = useCallback(
    (sourceName: string, result: { extension: string }) => compressedName(sourceName, result.extension),
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
  const savedRatio = totalOriginal > 0 && totalResult > 0 ? 1 - totalResult / totalOriginal : 0;

  const compressAll = () =>
    batch.processAll(
      (file) => ({
        mime: resolveOutputMime(format, file.type),
        quality: quality / 100,
        maxWidth: Number(maxWidth) > 0 ? Number(maxWidth) : 0,
        background,
      }),
      { success: t({ zh: '图片处理完成', en: 'Images processed' }) },
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

      <Panel title={t({ zh: '压缩参数', en: 'Compression settings' })} bodyClassName="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="compress-quality" className="text-ink-3">
                {t({ zh: '质量', en: 'Quality' })}
              </label>
              <span className="font-mono font-semibold text-accent-strong">{quality}</span>
            </div>
            <input
              id="compress-quality"
              type="range"
              min={10}
              max={100}
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
              className="mt-2 w-full accent-[var(--accent)]"
            />
          </div>

          <div>
            <label htmlFor="compress-width" className="text-xs text-ink-3">
              {t({ zh: '最大宽度（px）', en: 'Max width (px)' })}
            </label>
            <Input
              id="compress-width"
              value={maxWidth}
              onChange={(event) => setMaxWidth(event.target.value)}
              placeholder={t({ zh: '0 表示原始尺寸', en: '0 keeps the original size' })}
              inputMode="numeric"
              className="mt-1.5 h-9"
            />
          </div>

          <div>
            <label htmlFor="compress-format" className="text-xs text-ink-3">
              {t({ zh: '输出格式', en: 'Output format' })}
            </label>
            <Select
              id="compress-format"
              value={format}
              onChange={(event) => setFormat(event.target.value as OutputFormat)}
              className="mt-1.5 h-9"
              wrapperClassName="mt-1.5 w-full"
            >
              <option value="auto">{t({ zh: '自动（保持原格式）', en: 'Auto (keep original format)' })}</option>
              <option value="image/webp">WebP</option>
              <option value="image/jpeg">JPG</option>
              <option value="image/png">PNG</option>
            </Select>
          </div>

          <div>
            <label htmlFor="compress-bg" className="text-xs text-ink-3">
              {t({ zh: 'JPG 背景色', en: 'JPG background' })}
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="compress-bg"
                type="color"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
                className="h-9 w-10 cursor-pointer rounded-lg border border-line bg-surface p-1"
              />
              <span className="font-mono text-[11px] text-ink-3">{t({ zh: '透明区域填充', en: 'Fills transparent areas' })}</span>
            </div>
          </div>
        </div>

        <ActionBar className="shadow-none">
          <Button variant="primary" onClick={() => void compressAll()} disabled={files.items.length === 0 || isProcessing}>
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            {isProcessing ? t({ zh: `压缩中 ${progress}%`, en: `Compressing ${progress}%` }) : t({ zh: '开始压缩', en: 'Start compressing' })}
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
              ? t({
                  zh: `原始 ${formatBytes(totalOriginal)} → 处理后 ${formatBytes(totalResult)}`,
                  en: `Before ${formatBytes(totalOriginal)} → After ${formatBytes(totalResult)}`,
                })
              : t({ zh: '上传后点击开始压缩', en: 'Upload images, then start compressing' })
          }
          actions={
            totalResult > 0 ? (
              <Badge tone={savedRatio >= 0 ? 'success' : 'warning'}>
                {savedRatio >= 0
                  ? t({ zh: `节省 ${Math.round(savedRatio * 100)}%`, en: `Saved ${Math.round(savedRatio * 100)}%` })
                  : t({ zh: `增大 ${Math.round(-savedRatio * 100)}%`, en: `Grew ${Math.round(-savedRatio * 100)}%` })}
              </Badge>
            ) : null
          }
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-line">
            {files.items.map((item) => {
              const result = results[item.id];
              const ratio = result ? 1 - result.size / item.file.size : 0;

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
                      {result ? (
                        <>
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                          <span className="font-medium text-ink-2">{formatBytes(result.size)}</span>
                          <span className={ratio >= 0 ? 'text-ok' : 'text-warn'}>
                            {ratio >= 0
                              ? t({ zh: `节省 ${Math.abs(Math.round(ratio * 100))}%`, en: `Saved ${Math.abs(Math.round(ratio * 100))}%` })
                              : t({ zh: `增大 ${Math.abs(Math.round(ratio * 100))}%`, en: `Grew ${Math.abs(Math.round(ratio * 100))}%` })}
                          </span>
                          <span>
                            {result.width} × {result.height}
                          </span>
                        </>
                      ) : (
                        <span>{isProcessing ? t({ zh: '等待处理', en: 'Queued' }) : t({ zh: '待压缩', en: 'Ready to compress' })}</span>
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
                        filename={compressedName(item.file.name, result.extension)}
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
                    className={cn(result ? '' : 'ml-auto')}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '压缩使用 Canvas 在本地完成，图片不会离开浏览器。PNG 格式会忽略质量参数，WebP 通常能获得更高压缩率。',
          en: 'Compression runs locally with Canvas; images never leave the browser. PNG ignores the quality setting; WebP usually achieves a better ratio.',
        })}
      </p>

      <ImagePreviewModal preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
