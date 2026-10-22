import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useAppStore } from '@/store/appStore';
import { HTML_LANG, tl, type Locale, type Localized } from './locale';

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** 按当前语言解析文案，如 t({ zh: '复制', en: 'Copy' })。 */
  t: (value: Localized) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useAppStore((state) => state.locale);
  const setLocale = useAppStore((state) => state.setLocale);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale];
  }, [locale]);

  const t = useCallback((value: Localized) => tl(value, locale), [locale]);

  const value = useMemo<I18nValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n 必须在 I18nProvider 内使用');
  return context;
}
