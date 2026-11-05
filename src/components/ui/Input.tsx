import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  mono?: boolean;
  /**
   * 两档高度与 Button 对齐（sm h-8 / md h-10）。`cn` 不做 tailwind 合并，
   * 尺寸不能靠 className 覆盖基础类（.h-10 排在 .h-8 之后），只能由组件选档。
   */
  size?: 'sm' | 'md';
}

const SIZES = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-10 px-3 text-sm',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, mono = false, size = 'md', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-md border border-line bg-surface text-ink transition-colors duration-150 placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft',
        SIZES[size],
        mono && 'font-mono text-[13px]',
        className,
      )}
      {...props}
    />
  );
});
