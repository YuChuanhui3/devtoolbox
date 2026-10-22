import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line-strong bg-surface-2 px-1.5 font-mono text-[11px] font-medium text-ink-2 shadow-[0_1px_0_var(--line-strong)]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
