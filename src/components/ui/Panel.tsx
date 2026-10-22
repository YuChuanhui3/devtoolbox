import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}

export function Panel({
  title,
  subtitle,
  actions,
  footer,
  children,
  className,
  bodyClassName,
  noPadding = false,
}: PanelProps) {
  return (
    <section className={cn('card-surface flex min-w-0 flex-col overflow-hidden', className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title ? <div className="text-sm font-semibold text-ink">{title}</div> : null}
            {subtitle ? <div className="mt-0.5 text-xs text-ink-3">{subtitle}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn('min-h-0 flex-1', !noPadding && 'p-4', bodyClassName)}>{children}</div>
      {footer ? <footer className="border-t border-line px-4 py-2.5">{footer}</footer> : null}
    </section>
  );
}
