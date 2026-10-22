import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  align?: 'center' | 'top';
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  bodyClassName,
  align = 'center',
}: ModalProps) {
  const { t } = useI18n();
  const closeLabel = t({ zh: '关闭', en: 'Close' });
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(
        'input, textarea, select, button:not([data-modal-close]), [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? panel).focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[90] flex justify-center overflow-y-auto bg-[rgba(8,12,20,0.45)] p-4 backdrop-blur-sm',
        align === 'top' ? 'items-start pt-[10vh]' : 'items-center py-10',
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full max-w-xl animate-fade-in-up rounded-card border border-line bg-surface shadow-[0_25px_80px_rgba(8,12,20,0.35)] outline-none',
          className,
        )}
      >
        {title ? (
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">{title}</h2>
              {description ? <p className="mt-1 text-sm text-ink-3">{description}</p> : null}
            </div>
            <IconButton label={closeLabel} size="sm" onClick={onClose} data-modal-close>
              <X className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          </header>
        ) : (
          <IconButton
            label={closeLabel}
            size="sm"
            className="absolute right-3 top-3 z-10"
            onClick={onClose}
            data-modal-close
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        )}
        <div className={cn('px-5 py-4', bodyClassName)}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
