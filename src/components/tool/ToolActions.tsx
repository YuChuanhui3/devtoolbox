import { useEffect, useState } from 'react';
import { Check, Copy, Download, Eraser, Sparkles } from 'lucide-react';
import { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { copyText } from '@/lib/clipboard';
import { downloadBlob, downloadText, safeFilename } from '@/lib/download';
import { cn } from '@/lib/cn';

interface CopyButtonProps {
  text: string;
  label?: Localized;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
}

export function CopyButton({
  text,
  label = { zh: '复制', en: 'Copy' },
  size = 'sm',
  variant = 'secondary',
  className,
  disabled,
}: CopyButtonProps) {
  const toast = useToast();
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || !text}
      onClick={async () => {
        const ok = await copyText(text);
        if (!ok) {
          toast.error(
            t({ zh: '复制失败，请手动选择内容复制', en: 'Copy failed. Please select and copy manually.' }),
          );
          return;
        }
        setCopied(true);
        toast.success(t({ zh: '已复制', en: 'Copied' }));
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? t({ zh: '已复制', en: 'Copied' }) : t(label)}
    </Button>
  );
}

export function CopyIconButton({
  text,
  label = { zh: '复制', en: 'Copy' },
  className,
  disabled,
}: {
  text: string;
  label?: Localized;
  className?: string;
  disabled?: boolean;
}) {
  const toast = useToast();
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <IconButton
      label={t(label)}
      size="sm"
      className={cn('h-7 w-7', className)}
      disabled={disabled || !text}
      onClick={async () => {
        const ok = await copyText(text);
        if (!ok) {
          toast.error(
            t({ zh: '复制失败，请手动选择内容复制', en: 'Copy failed. Please select and copy manually.' }),
          );
          return;
        }
        setCopied(true);
        toast.success(t({ zh: '已复制', en: 'Copied' }));
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
    </IconButton>
  );
}

interface DownloadButtonProps {
  filename: string;
  content?: string;
  blob?: Blob;
  mime?: string;
  label?: Localized;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
}

export function DownloadButton({
  filename,
  content = '',
  blob,
  mime = 'text/plain;charset=utf-8',
  label = { zh: '下载', en: 'Download' },
  size = 'sm',
  variant = 'secondary',
  className,
  disabled,
}: DownloadButtonProps) {
  const toast = useToast();
  const { t } = useI18n();
  const canDownload = Boolean(blob) || Boolean(content);
  const safeName = safeFilename(filename, 'result.txt');

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || !canDownload}
      onClick={() => {
        if (blob) {
          downloadBlob(safeName, blob);
        } else {
          downloadText(safeName, content, mime);
        }
        toast.success(t({ zh: '已开始下载', en: 'Download started' }));
      }}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      {t(label)}
    </Button>
  );
}

export function SampleButton({
  onClick,
  label = { zh: '示例', en: 'Sample' },
  size = 'sm',
  variant = 'ghost',
  className,
  disabled,
}: {
  onClick: () => void;
  label?: Localized;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Button variant={variant} size={size} className={className} onClick={onClick} disabled={disabled}>
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      {t(label)}
    </Button>
  );
}

export function ClearButton({
  onClick,
  label = { zh: '清空', en: 'Clear' },
  size = 'sm',
  variant = 'ghost',
  className,
  disabled,
}: {
  onClick: () => void;
  label?: Localized;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Button variant={variant} size={size} className={className} onClick={onClick} disabled={disabled}>
      <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
      {t(label)}
    </Button>
  );
}

interface ActionBarProps {
  children: React.ReactNode;
  className?: string;
}

export function ActionBar({ children, className }: ActionBarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-2.5 shadow-card', className)}>
      {children}
    </div>
  );
}

export type { ButtonProps };
