import { useI18n } from '@/i18n/I18nProvider';
import type { Locale } from '@/i18n/locale';

const OPTIONS: Array<{ value: Locale; label: string }> = [
  { value: 'zh', label: '中' },
  { value: 'en', label: 'EN' },
];

export function LanguageSwitch() {
  const { locale, setLocale } = useI18n();

  return (
    <div
      role="group"
      aria-label="语言 / Language"
      className="inline-flex h-9 items-center rounded-full border border-line bg-surface p-0.5 shadow-card"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLocale(option.value)}
          aria-pressed={locale === option.value}
          className={
            locale === option.value
              ? 'h-full min-w-8 rounded-full bg-accent px-2 text-xs font-semibold text-white transition-colors duration-200'
              : 'h-full min-w-8 rounded-full px-2 text-xs font-semibold text-ink-3 transition-colors duration-200 hover:bg-surface-2 hover:text-ink'
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
