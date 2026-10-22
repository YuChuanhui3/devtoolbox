import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'new';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'border-line bg-surface-2 text-ink-2',
  accent: 'border-accent/25 bg-accent-soft text-accent-strong',
  success: 'border-ok/25 bg-ok-soft text-ok',
  warning: 'border-warn/25 bg-warn-soft text-warn',
  danger: 'border-danger/25 bg-danger-soft text-danger',
  new: 'border-transparent bg-accent text-white',
};

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5',
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
