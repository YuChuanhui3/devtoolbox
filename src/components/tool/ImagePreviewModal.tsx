import { Modal } from '@/components/ui/Modal';
import { DownloadButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { formatBytes } from '@/lib/number';
import type { ImagePreviewState } from '@/types/image';

interface ImagePreviewModalProps {
  preview: ImagePreviewState | null;
  onClose: () => void;
}

export function ImagePreviewModal({ preview, onClose }: ImagePreviewModalProps) {
  const { t } = useI18n();
  const savedRatio =
    preview && preview.originalSize > 0 ? 1 - preview.resultSize / preview.originalSize : 0;

  return (
    <Modal
      open={Boolean(preview)}
      onClose={onClose}
      title={t({ zh: '图片预览', en: 'Image Preview' })}
      className="max-w-3xl"
    >
      {preview ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <figure className="overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(var(--surface-2)_0%_25%,var(--surface)_0%_50%)] bg-[length:20px_20px]">
              <img
                src={preview.originalUrl}
                alt={t({ zh: '原图预览', en: 'Original preview' })}
                className="max-h-72 w-full object-contain"
              />
              <figcaption className="border-t border-line bg-surface px-3 py-2 text-[11px] text-ink-3">
                {t({ zh: '原图', en: 'Original' })} · {preview.originalWidth} × {preview.originalHeight} ·{' '}
                {formatBytes(preview.originalSize)}
              </figcaption>
            </figure>

            <figure className="overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(var(--surface-2)_0%_25%,var(--surface)_0%_50%)] bg-[length:20px_20px]">
              <img
                src={preview.resultUrl}
                alt={t({ zh: '处理后预览', en: 'Processed preview' })}
                className="max-h-72 w-full object-contain"
              />
              <figcaption className="border-t border-line bg-surface px-3 py-2 text-[11px] text-ink-3">
                {t({ zh: '处理后', en: 'Processed' })} · {preview.resultWidth} × {preview.resultHeight} ·{' '}
                {formatBytes(preview.resultSize)}
              </figcaption>
            </figure>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-3">
            <span className="max-w-[60%] truncate">{preview.originalName}</span>
            <span>
              {savedRatio >= 0
                ? t({ zh: '节省', en: 'Saved' })
                : t({ zh: '增大', en: 'Grew' })}{' '}
              <span className={savedRatio >= 0 ? 'font-semibold text-ok' : 'font-semibold text-warn'}>
                {Math.abs(Math.round(savedRatio * 100))}%
              </span>
            </span>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <DownloadButton
              filename={preview.originalName}
              blob={preview.originalBlob}
              label={t({ zh: '下载原图', en: 'Download original' })}
            />
            <DownloadButton
              filename={preview.resultName}
              blob={preview.resultBlob}
              variant="primary"
              label={t({ zh: '下载处理后图片', en: 'Download processed image' })}
            />
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
