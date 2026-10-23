import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const BASE_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-all duration-300 ease-in-out disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    'btn-shine text-accent-contrast shadow-[0_6px_18px_rgba(33,150,243,0.28)] [background-image:var(--btn-grad)] hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(33,150,243,0.32)] active:translate-y-0',
  secondary:
    'border border-line-strong bg-surface text-ink shadow-card hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-2 hover:shadow-float active:translate-y-0',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-white',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BASE_CLASS, VARIANT_CLASS[variant], SIZE_CLASS[size], className)}
      {...props}
    />
  );
});
