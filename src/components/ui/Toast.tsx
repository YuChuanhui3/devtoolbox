import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION = 2600;
const MAX_TOASTS = 3;

const TONE_STYLE: Record<ToastTone, string> = {
  success: 'border-ok/30 bg-surface text-ink',
  error: 'border-danger/30 bg-surface text-ink',
  info: 'border-accent/30 bg-surface text-ink',
};

const TONE_ICON: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" />,
  error: <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />,
  info: <Info className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      if (!message) return;
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setItems((current) => [...current.slice(-(MAX_TOASTS - 1)), { id, message, tone }]);
      const timer = window.setTimeout(() => dismiss(id), DURATION);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      currentTimers.forEach((timer) => window.clearTimeout(timer));
      currentTimers.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (message: string) => toast(message, 'success'),
      error: (message: string) => toast(message, 'error'),
      info: (message: string) => toast(message, 'info'),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4 no-print">
          {items.map((item) => (
            <div
              key={item.id}
              role={item.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-auto max-w-md animate-toast-in items-center gap-2.5 rounded-full border px-4 py-2.5 text-sm shadow-float',
                TONE_STYLE[item.tone],
              )}
            >
              {TONE_ICON[item.tone]}
              <span className="min-w-0 break-words">{item.message}</span>
              <IconButton
                label={t({ zh: '关闭提示', en: 'Dismiss notification' })}
                size="sm"
                className="-mr-1.5 h-6 w-6"
                onClick={() => dismiss(item.id)}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </IconButton>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast 必须在 ToastProvider 内使用');
  }
  return context;
}
