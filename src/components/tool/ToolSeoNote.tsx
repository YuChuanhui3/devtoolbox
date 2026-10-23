import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { getToolsByCategory } from '@/data/tools';
import { getCategory } from '@/data/categories';
import { toolSeoIntro, toolSeoTitle } from '@/lib/seoTemplates';
import type { ToolMeta } from '@/types/tool';

export function ToolSeoNote({ tool }: { tool: ToolMeta }) {
  const { t, locale } = useI18n();
  const category = getCategory(tool.category);
  const siblings = getToolsByCategory(tool.category)
    .filter((item) => item.id !== tool.id)
    .slice(0, 6);

  return (
    <section className="rounded-card border border-line bg-surface px-4 py-3.5 sm:px-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Info className="h-4 w-4 text-ink-3" aria-hidden="true" />
        {t({ zh: '关于此工具', en: 'About this tool' })}
      </h2>
      <p className="mt-2 text-[13px] leading-6 text-ink-2">{t(toolSeoIntro(tool))}</p>
      {category && (
        <p className="mt-1.5 text-[13px] leading-6 text-ink-3">
          {t({ zh: '所属分类：', en: 'Category: ' })}
          <Link to={`/category/${category.id}`} className="text-accent-strong hover:underline">
            {t(category.name)}
          </Link>
          {siblings.length > 0 && (
            <>
              {t({ zh: '，同分类常用：', en: ', popular in this category: ' })}
              {siblings.map((item, index) => (
                <span key={item.id}>
                  {index > 0 && t({ zh: '、', en: ', ' })}
                  <Link to={`/tools/${item.id}`} className="text-accent-strong hover:underline">
                    {locale === 'en' ? item.nameEn ?? item.name : item.name}
                  </Link>
                </span>
              ))}
            </>
          )}
        </p>
      )}
      <h3 className="sr-only">{t(toolSeoTitle(tool))}</h3>
    </section>
  );
}
