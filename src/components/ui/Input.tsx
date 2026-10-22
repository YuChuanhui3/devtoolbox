import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, mono = false, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink shadow-[inset_0_1px_2px_rgba(16,24,40,0.03)] transition-colors duration-300 placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft',
        mono && 'font-mono text-[13px]',
        className,
      )}
      {...props}
    />
  );
});
