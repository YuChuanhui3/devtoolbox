import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/i18n/I18nProvider';
import { useSeo } from '@/hooks/useSeo';

export function NotFoundPage() {
  const { t } = useI18n();
  useSeo({ zh: '页面不存在', en: 'Page not found' });

  return (
    <div className="mx-auto max-w-2xl py-10">
      <EmptyState
        icon={<Compass className="h-6 w-6" aria-hidden="true" />}
        title={t({ zh: '页面不存在', en: 'Page not found' })}
        description={t({
          zh: '你访问的页面可能已被移动或删除。可以返回首页，或浏览全部工具。',
          en: 'The page you visited may have been moved or deleted. Head back home, or browse all tools.',
        })}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              to="/"
              className="inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-white shadow-[0_6px_18px_rgba(33,150,243,0.28)] [background-image:var(--btn-grad)] transition-transform duration-300 hover:-translate-y-0.5"
            >
              {t({ zh: '返回首页', en: 'Back to home' })}
            </Link>
            <Link
              to="/tools"
              className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm text-ink-2 transition-colors hover:text-accent-strong"
            >
              {t({ zh: '浏览全部工具', en: 'Browse all tools' })}
            </Link>
          </div>
        }
      />
    </div>
  );
}
