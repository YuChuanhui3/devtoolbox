import { useRef, useState } from 'react';
import { ImagePlus, Upload } from 'lucide-react';
import { IMAGE_ACCEPT } from '@/lib/image';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { cn } from '@/lib/cn';

interface ImageDropzoneProps {
  onFiles: (files: FileList | File[]) => void;
  title?: Localized;
  hint?: Localized;
  multiple?: boolean;
}

export function ImageDropzone({
  onFiles,
  title = { zh: '拖拽图片到此处上传', en: 'Drop an image here to upload' },
  hint = {
    zh: '或点击选择文件 · 支持 JPG / PNG / WebP / GIF / BMP，单张不超过 20MB',
    en: 'Or click to choose files · JPG / PNG / WebP / GIF / BMP supported, up to 20MB each',
  },
  multiple = true,
}: ImageDropzoneProps) {
  const { t } = useI18n();
  const resolvedTitle = t(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={resolvedTitle}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files);
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all duration-300',
        dragging
          ? 'border-accent bg-accent-soft'
          : 'border-line-strong bg-surface-2/30 hover:border-accent/50 hover:bg-accent-soft/30',
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-accent shadow-card">
        {dragging ? <Upload className="h-5 w-5" aria-hidden="true" /> : <ImagePlus className="h-5 w-5" aria-hidden="true" />}
      </span>
      <p className="mt-3 text-sm font-medium text-ink">{resolvedTitle}</p>
      <p className="mt-1 text-[11px] text-ink-3">{t(hint)}</p>

      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) {
            onFiles(event.target.files);
          }
          event.target.value = '';
        }}
      />
    </div>
  );
}
