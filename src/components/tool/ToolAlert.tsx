import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Lightbulb, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { cn } from '@/lib/cn';

export type FeedbackTone = 'success' | 'error' | 'info' | 'warning';

const TONE_STYLE: Record<FeedbackTone, string> = {
  success: 'border-ok/25 bg-ok-soft text-ok',
  error: 'border-danger/25 bg-danger-soft text-danger',
  info: 'border-accent/25 bg-accent-soft text-accent-strong',
  warning: 'border-warn/25 bg-warn-soft text-warn',
};

const TONE_ICON: Record<FeedbackTone, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
  error: <XCircle className="h-4 w-4" aria-hidden="true" />,
  info: <Info className="h-4 w-4" aria-hidden="true" />,
  warning: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
};

interface ToolAlertProps {
  tone: FeedbackTone;
  title: Localized;
  hint?: Localized;
  children?: ReactNode;
  className?: string;
}

export function ToolAlert({ tone, title, hint, children, className }: ToolAlertProps) {
  const { t } = useI18n();
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm', TONE_STYLE[tone], className)}
    >
      <span className="mt-0.5 shrink-0">{TONE_ICON[tone]}</span>
      <div className="min-w-0">
        <p className="font-medium leading-5">{t(title)}</p>
        {hint ? (
          <p className="mt-1 flex items-start gap-1 text-xs leading-5 opacity-90">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t(hint)}</span>
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
