import { useCallback, useRef, useState } from 'react';
import { Columns2, MoveHorizontal } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/Segmented';
import { DownloadButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { formatBytes } from '@/lib/number';
import type { ImagePreviewState } from '@/types/image';

interface ImagePreviewModalProps {
  preview: ImagePreviewState | null;
  onClose: () => void;
}

type PreviewView = 'side' | 'slider';

function CompareSlider({ originalUrl, resultUrl, name }: { originalUrl: string; resultUrl: string; name: string }) {
  const { t } = useI18n();
  const [pos, setPos] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0) return;
    setPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  return (
    <div
      ref={frameRef}
      className="relative select-none overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(var(--surface-2)_0%_25%,var(--surface)_0%_50%)] bg-[length:20px_20px] touch-none"
      onPointerDown={(event) => {
        draggingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromClientX(event.clientX);
      }}
      onPointerMove={(event) => {
        if (draggingRef.current) updateFromClientX(event.clientX);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    >
      <img src={originalUrl} alt={name} draggable={false} className="block max-h-[60vh] w-full object-contain" />
      <img
        src={resultUrl}
        alt=""
        draggable={false}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-contain"
        style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label={t({ zh: '对比线位置', en: 'Comparison line position' })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        className="absolute inset-y-0 z-10 w-0.5 cursor-ew-resize bg-accent"
        style={{ left: `${pos}%` }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 2));
          if (event.key === 'ArrowRight') setPos((p) => Math.min(100, p + 2));
        }}
      >
        <span className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow">
          <MoveHorizontal className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <span className="absolute top-2 left-2 rounded-md bg-surface/85 px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
        {t({ zh: '原图', en: 'Original' })}
      </span>
      <span className="absolute top-2 right-2 rounded-md bg-surface/85 px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
        {t({ zh: '处理后', en: 'Processed' })}
      </span>
    </div>
  );
}

export function ImagePreviewModal({ preview, onClose }: ImagePreviewModalProps) {
  const { t } = useI18n();
  const [view, setView] = useState<PreviewView>('side');
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
          <Segmented<PreviewView>
            value={view}
            onChange={setView}
            ariaLabel={t({ zh: '预览方式', en: 'Preview mode' })}
            size="sm"
            options={[
              { value: 'side', label: t({ zh: '并排', en: 'Side by side' }), icon: <Columns2 className="h-3.5 w-3.5" aria-hidden="true" /> },
              { value: 'slider', label: t({ zh: '对比线', en: 'Slider' }), icon: <MoveHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> },
            ]}
          />

          {view === 'slider' ? (
            <CompareSlider
              originalUrl={preview.originalUrl}
              resultUrl={preview.resultUrl}
              name={preview.originalName}
            />
          ) : (
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
          )}

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
