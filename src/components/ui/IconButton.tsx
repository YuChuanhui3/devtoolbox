import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'accent' | 'danger';
}

const TONE_CLASS = {
  default: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  accent: 'text-accent hover:bg-accent-soft',
  danger: 'text-danger hover:bg-danger-soft',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, label, size = 'md', tone = 'default', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-300 ease-in-out disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    />
  );
});
