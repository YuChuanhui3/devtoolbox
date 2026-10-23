import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { CATEGORIES, getCategory } from '@/data/categories';
import { getToolsByCategory, sortToolsForLocale } from '@/data/tools';
import { ToolCard } from '@/components/ToolCard';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/i18n/I18nProvider';
import { useSeo } from '@/hooks/useSeo';
import { categorySeoDescription, categorySeoTitle } from '@/lib/seoTemplates';
import { DEFAULT_CHIP } from '@/lib/toolTone';

export function CategoryPage() {
  const { t, locale } = useI18n();
  const { categoryId = '' } = useParams();
  const category = getCategory(categoryId);
  const tools = category ? sortToolsForLocale(getToolsByCategory(category.id), locale) : [];

  useSeo(
    category ? categorySeoTitle(category, getToolsByCategory(category.id).length) : undefined,
    category ? categorySeoDescription(category, getToolsByCategory(category.id).length) : undefined,
  );

  if (!category) {
    return (
      <EmptyState
        title={t({ zh: '分类不存在', en: 'Category not found' })}
        description={t({
          zh: '该分类可能已调整或链接有误。',
          en: 'This category may have changed or the link is incorrect.',
        })}
        action={
          <Link
            to="/tools"
            className="inline-flex h-10 items-center rounded-full border border-line-strong bg-surface px-4 text-sm text-ink shadow-card transition-colors hover:text-accent-strong"
          >
            {t({ zh: '查看全部工具', en: 'View all tools' })}
          </Link>
        }
      />
    );
  }

  const related = CATEGORIES.filter((item) => item.id !== category.id).slice(0, 4);

  return (
    <div className="space-y-6">
      <Link
        to="/tools"
        className="inline-flex items-center gap-1 text-xs text-ink-3 transition-colors hover:text-accent-strong"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {t({ zh: '全部工具', en: 'All Tools' })}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex items-start gap-3.5">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${DEFAULT_CHIP}`}>
            <ToolIcon name={category.icon} className="h-6 w-6" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[28px] font-semibold leading-tight tracking-[0.01em] text-ink">{t(category.name)}</h1>
              <Badge tone="accent">
                {t({ zh: `${tools.length} 个工具`, en: `${tools.length} tools` })}
              </Badge>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-3">{t(category.description)}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>

      <section className="rounded-card border border-line bg-surface-2/50 p-4">
        <p className="mb-3 text-xs font-semibold text-ink-2">{t({ zh: '相关分类', en: 'Related categories' })}</p>
        <div className="flex flex-wrap gap-2">
          {related.map((item) => (
            <Link
              key={item.id}
              to={`/category/${item.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent-strong"
            >
              <ToolIcon name={item.icon} className="h-3.5 w-3.5" />
              {t(item.name)}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
