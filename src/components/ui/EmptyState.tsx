import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-surface-2 text-ink-3">
        {icon ?? <Inbox className="h-6 w-6" aria-hidden="true" />}
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-6 text-ink-3">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
