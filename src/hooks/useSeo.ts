import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';

const SITE_TITLE: Localized = {
  zh: 'DevToolbox · 开发者在线工具箱',
  en: 'DevToolbox · Online Developer Toolbox',
};

function upsertMeta(selector: string, attrs: Record<string, string>, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function useSeo(title?: Localized, description?: Localized, keywords?: Localized): void {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const resolvedTitle = title ? `${t(title)} · DevToolbox` : t(SITE_TITLE);
  const resolvedDescription = description === undefined ? undefined : t(description);
  const resolvedKeywords = keywords === undefined ? undefined : t(keywords);
  // 与构建期静态壳（目录 index）保持一致：非根路径 canonical 统一带尾斜杠。
  const canonical = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}${
    pathname === '/' ? '/' : `${pathname.replace(/\/+$/, '')}/`
  }`;

  useEffect(() => {
    document.title = resolvedTitle;
    upsertMeta('meta[property="og:title"]', { property: 'og:title' }, resolvedTitle);
    upsertMeta('meta[property="og:url"]', { property: 'og:url' }, canonical);
    if (resolvedKeywords) {
      upsertMeta('meta[name="keywords"]', { name: 'keywords' }, resolvedKeywords);
    }
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = canonical;
    if (resolvedDescription) {
      upsertMeta('meta[name="description"]', { name: 'description' }, resolvedDescription);
      upsertMeta('meta[property="og:description"]', { property: 'og:description' }, resolvedDescription);
    }
  }, [resolvedTitle, resolvedDescription, canonical]);
}
