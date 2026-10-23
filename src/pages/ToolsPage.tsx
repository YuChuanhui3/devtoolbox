import { useMemo, useState } from 'react';
import type { Localized } from '@/i18n/locale';
import { Link } from 'react-router-dom';
import { LayoutGrid, Search, SlidersHorizontal, X } from 'lucide-react';
import { CATEGORIES } from '@/data/categories';
import { TOOLS, compareToolNameLocale, searchTools, sortToolsForLocale } from '@/data/tools';
import { useAppStore } from '@/store/appStore';
import { ToolCard } from '@/components/ToolCard';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n/I18nProvider';
import { useSeo } from '@/hooks/useSeo';
import { TOOLS_PAGE_DESCRIPTION, TOOLS_PAGE_TITLE } from '@/lib/seoTemplates';
import { cn } from '@/lib/cn';
import type { CategoryId, ToolMeta } from '@/types/tool';

type FilterValue = 'all' | 'favorites' | CategoryId;
type SortValue = 'default' | 'name' | 'recent' | 'favorites';

export function ToolsPage() {
  const { t, locale } = useI18n();
  useSeo(TOOLS_PAGE_TITLE, TOOLS_PAGE_DESCRIPTION(TOOLS.length), {
    zh: '在线工具,在线格式转换工具,开发者工具大全,JSON 格式化,编码加密,网络工具',
    en: 'online tools, online format converter, developer tools list, JSON formatter, encoding, network tools',
  });

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [sort, setSort] = useState<SortValue>('default');

  const favorites = useAppStore((state) => state.favorites);
  const recent = useAppStore((state) => state.recent);

  const filtered = useMemo<ToolMeta[]>(() => {
    let list = query.trim() ? searchTools(query, locale) : sortToolsForLocale(TOOLS, locale);

    if (filter === 'favorites') {
      list = list.filter((tool) => favorites.includes(tool.id));
    } else if (filter !== 'all') {
      list = list.filter((tool) => tool.category === filter);
    }

    if (sort === 'name') {
      list = [...list].sort(compareToolNameLocale(locale));
    } else if (sort === 'recent') {
      const order = new Map(recent.map((entry, index) => [entry.toolId, index]));
      list = [...list].sort(
        (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
    } else if (sort === 'favorites') {
      list = [...list].sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)));
    }

    return list;
  }, [query, filter, sort, favorites, recent, locale]);

  const filters: Array<{ value: FilterValue; label: Localized; count: number }> = [
    { value: 'all', label: t({ zh: '全部', en: 'All' }), count: TOOLS.length },
    ...CATEGORIES.map((category) => ({
      value: category.id,
      label: category.name,
      count: TOOLS.filter((tool) => tool.category === category.id).length,
    })),
    { value: 'favorites', label: t({ zh: '已收藏', en: 'Favorites' }), count: favorites.length },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[0.01em] text-ink">
              {t({ zh: '全部工具', en: 'All Tools' })}
            </h1>
            <Badge tone="accent">{t({ zh: `${TOOLS.length} 个`, en: `${TOOLS.length} tools` })}</Badge>
          </div>
          <p className="mt-1.5 text-sm text-ink-3">
            {t({
              zh: '按分类筛选、搜索名称或标签，快速定位需要的工具。',
              en: 'Filter by category, search by name or tag, and jump straight to the tool you need.',
            })}
          </p>
        </div>

        <div className="w-full sm:w-72">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t({ zh: '搜索工具…', en: 'Search tools…' })}
              aria-label={t({ zh: '搜索工具', en: 'Search tools' })}
              className="pl-9 pr-9"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t({ zh: '清空搜索', en: 'Clear search' })}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <SlidersHorizontal className="mr-1 hidden h-3.5 w-3.5 text-ink-3 sm:block" aria-hidden="true" />
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={cn(
                'inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all duration-300',
                filter === item.value
                  ? 'bg-accent-strong text-accent-contrast shadow-[0_4px_12px_rgba(33,150,243,0.25)]'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )}
            >
              {t(item.label)}
              <span
                className={cn(
                  'rounded-full px-1.5 font-mono text-[11px] tabular-nums',
                  filter === item.value ? 'bg-white/20' : 'bg-surface-3 text-ink-3',
                )}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <span className="text-[11px] text-ink-3">{t({ zh: '排序', en: 'Sort' })}</span>
          <Select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortValue)}
            aria-label={t({ zh: '排序方式', en: 'Sort order' })}
            className="h-8 text-xs"
            wrapperClassName="w-32"
          >
            <option value="default">{t({ zh: '默认排序', en: 'Default' })}</option>
            <option value="recent">{t({ zh: '最近使用', en: 'Recently used' })}</option>
            <option value="favorites">{t({ zh: '收藏优先', en: 'Favorites first' })}</option>
            <option value="name">{t({ zh: '名称 A-Z', en: 'Name A-Z' })}</option>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-ink-3">
        <span>
          {query.trim()
            ? t({
                zh: `共 ${filtered.length} 个工具 · 关键词 “${query.trim()}”`,
                en: `${filtered.length} tools · “${query.trim()}”`,
              })
            : t({ zh: `共 ${filtered.length} 个工具`, en: `${filtered.length} tools` })}
        </span>
        {filter !== 'all' || query ? (
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setQuery('');
              setSort('default');
            }}
            className="transition-colors hover:text-accent-strong"
          >
            {t({ zh: '重置筛选', en: 'Reset filters' })}
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-6 w-6" aria-hidden="true" />}
          title={t({ zh: '没有找到匹配的工具', en: 'No matching tools found' })}
          description={
            query.trim()
              ? t({
                  zh: `没有找到 “${query.trim()}” 相关工具，可以尝试更简短的关键词或工具别名。`,
                  en: `Nothing matches “${query.trim()}”. Try a shorter keyword or a tool alias.`,
                })
              : t({
                  zh: '当前筛选条件下没有工具，试试切换到其他分类。',
                  en: 'No tools under the current filters. Try another category.',
                })
          }
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setFilter('all');
                setQuery('');
              }}
            >
              {t({ zh: '查看全部工具', en: 'View all tools' })}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((tool) => (
            <ToolCard key={tool.id} tool={tool} showCategory />
          ))}
        </div>
      )}

      <p className="pt-2 text-center text-xs text-ink-3">
        {t({ zh: '找不到需要的工具？', en: 'Missing a tool you need?' })}
        <Link to="/about" className="ml-1 text-accent-strong hover:underline">
          {t({ zh: '告诉我们', en: 'Let us know' })}
        </Link>
      </p>
    </div>
  );
}
