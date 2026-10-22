import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { FEATURED_TOOLS, getToolsByCategory, sortToolsForLocale, toolDescription, toolName, toolPath } from '@/data/tools';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { useI18n } from '@/i18n/I18nProvider';
import type { ToolMeta } from '@/types/tool';

export function RelatedTools({ tool }: { tool: ToolMeta }) {
  const { t, locale } = useI18n();
  const sameCategory = sortToolsForLocale(getToolsByCategory(tool.category), locale).filter((item) => item.id !== tool.id);
  const extras = FEATURED_TOOLS.filter(
    (item) => item.id !== tool.id && !sameCategory.some((related) => related.id === item.id),
  );
  const related = [...sameCategory, ...extras].slice(0, 4);

  if (related.length === 0) return null;

  return (
    <section className="no-print">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{t({ zh: '相关工具', en: 'Related Tools' })}</h2>
        <Link
          to={`/category/${tool.category}`}
          className="inline-flex items-center gap-1 text-[11px] text-ink-3 transition-colors hover:text-accent-strong"
        >
          {t({ zh: '查看分类', en: 'View category' })} <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {related.map((item) => (
          <Link
            key={item.id}
            to={toolPath(item.id)}
            className="card-surface card-interactive flex min-w-0 items-center gap-2.5 p-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
              <ToolIcon name={item.icon} className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-ink">{toolName(item, locale)}</span>
              <span className="mt-0.5 block truncate text-[11px] text-ink-3">{toolDescription(item, locale)}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
