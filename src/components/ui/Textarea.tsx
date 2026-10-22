import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, mono = false, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full resize-y rounded-xl border border-line bg-surface p-3 text-sm leading-6 text-ink shadow-[inset_0_1px_2px_rgba(16,24,40,0.03)] transition-colors duration-300 placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft',
        mono && 'font-mono text-[13px]',
        className,
      )}
      {...props}
    />
  );
});
