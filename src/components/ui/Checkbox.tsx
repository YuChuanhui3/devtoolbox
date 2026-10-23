import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({ checked, onChange, label, description, disabled, className }: CheckboxProps) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer select-none items-start gap-2 text-sm text-ink-2 transition-colors hover:text-ink',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded-lg border-line-strong accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="leading-5">{label}</span>
        {description ? <span className="mt-0.5 block text-xs leading-5 text-ink-3">{description}</span> : null}
      </span>
    </label>
  );
}
