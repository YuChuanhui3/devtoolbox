import { Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { cn } from '@/lib/cn';

export function Spinner({
  className,
  label = { zh: '加载中', en: 'Loading' },
}: {
  className?: string;
  label?: Localized;
}) {
  const { t } = useI18n();
  const resolved = t(label);
  return (
    <span role="status" aria-label={resolved} className={cn('inline-flex items-center gap-2 text-sm text-ink-3', className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{resolved}</span>
    </span>
  );
}
