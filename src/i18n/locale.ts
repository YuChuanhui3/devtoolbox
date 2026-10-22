export type Locale = 'zh' | 'en';

/** 双语值对象：与代码同处一地，无需字符串 key 注册表。 */
export type L10n = { zh: string; en: string };

/** 局部化类型：文案既可以是固定字符串，也可以是双语对象。 */
export type Localized = L10n | string;

export const isLocale = (value: unknown): value is Locale =>
  value === 'zh' || value === 'en';

export const tl = (value: Localized, locale: Locale): string =>
  typeof value === 'string' ? value : value[locale];

/** 持久化偏好优先，其次按浏览器语言（zh 系 → 中文，其余 → 英文）。 */
export const detectLocale = (
  stored?: unknown,
  navigatorLanguage: string = typeof navigator === 'undefined' ? 'zh' : navigator.language,
): Locale => {
  if (isLocale(stored)) return stored;
  return navigatorLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en';
};

export const HTML_LANG: Record<Locale, string> = { zh: 'zh-CN', en: 'en' };
