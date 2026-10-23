import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex flex-wrap items-center gap-0.5 rounded-full border border-line bg-surface-2 p-1', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-300 ease-in-out disabled:cursor-not-allowed disabled:opacity-40',
              active
                ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]'
                : 'text-ink-3 hover:text-ink',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
