import { useEffect, useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useAppStore, type ThemeMode } from '@/store/appStore';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { cn } from '@/lib/cn';
import { IconButton } from '@/components/ui/IconButton';

const OPTIONS: Array<{ value: ThemeMode; label: L10n; icon: typeof Sun }> = [
  { value: 'light', label: { zh: '浅色模式', en: 'Light' }, icon: Sun },
  { value: 'dark', label: { zh: '深色模式', en: 'Dark' }, icon: Moon },
  { value: 'system', label: { zh: '跟随系统', en: 'System' }, icon: Monitor },
];

export function ThemeToggle() {
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const current = OPTIONS.find((option) => option.value === themeMode) ?? OPTIONS[2];
  const CurrentIcon = current.icon;

  return (
    <div ref={wrapperRef} className="relative">
      <IconButton
        label={t({
          zh: `主题：${t(current.label)}`,
          en: `Theme: ${t(current.label)}`,
        })}

        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn('h-9 w-9', open && 'bg-surface-2 text-ink')}
      >
        <CurrentIcon className="h-4.5 w-4.5" aria-hidden="true" />
      </IconButton>

      {open ? (
        <div
          role="menu"
          aria-label={t({ zh: '主题设置', en: 'Theme settings' })}
          className="absolute right-0 top-full z-50 mt-2 w-40 animate-fade-in rounded-2xl border border-line bg-surface p-1.5 shadow-float"
        >
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = option.value === themeMode;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setThemeMode(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors duration-200',
                  selected ? 'text-accent-strong' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="flex-1">{t(option.label)}</span>
                {selected ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
