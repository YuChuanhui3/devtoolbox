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
        'w-full resize-y rounded-md border border-line bg-surface p-3 text-sm leading-6 text-ink transition-colors duration-150 placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft',
        mono && 'font-mono text-[13px]',
        className,
      )}
      {...props}
    />
  );
});
