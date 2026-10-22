import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { CopyIconButton } from '@/components/tool/ToolActions';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/i18n/I18nProvider';
import type { ReferenceDataset } from '@/types/reference';
import { cn } from '@/lib/cn';

export function ReferenceListTool({ dataset }: { dataset: ReferenceDataset }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const { t } = useI18n();

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return dataset.items.filter((item) => {
      if (filter !== 'all' && item.category !== filter) return false;
      if (!keyword) return true;
      const haystack = [
        item.key,
        t(item.title),
        t(item.description),
        item.example ?? '',
        ...(item.tags ?? []),
        ...(item.params ?? []).map(([flag, meaning]) => `${flag} ${t(meaning)}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.items, query, filter, t]);

  const categoryLabel = (id: string) =>
    dataset.filters.find((option) => option.id === id)?.label ?? { zh: id, en: id };

  return (
    <div className="space-y-4">
      {dataset.intro ? (
        <p className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-xs leading-5 text-ink-3">
          {t(dataset.intro)}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(dataset.searchPlaceholder)}
            aria-label={t({ zh: '搜索', en: 'Search' })}
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

        <div className="flex flex-wrap gap-1.5">
          {dataset.filters.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs transition-colors duration-300',
                filter === option.id
                  ? 'bg-accent text-white'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
      </div>

      <p className="px-1 text-xs text-ink-3">
        {t({ zh: '共', en: '' })}{' '}
        <span className="font-semibold text-ink-2">{filtered.length}</span>{' '}
        {t({ zh: '条', en: 'matching entries' })}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title={t(dataset.emptyText)}
          description={t({
            zh: '尝试更简短的关键词或切换分类。',
            en: 'Try a shorter keyword or switch category.',
          })}
        />
      ) : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {filtered.map((item) => (
              <li
                key={item.key}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40"
              >
                <span className="mt-0.5 inline-flex min-w-16 shrink-0 items-center justify-center rounded-lg bg-surface-2 px-2 py-1 font-mono text-[11px] font-semibold text-ink-2">
                  {item.key}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-mono text-[12px] font-medium text-ink">{t(item.title)}</span>
                    {item.category ? <Badge tone="neutral">{t(categoryLabel(item.category))}</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-ink-3">{t(item.description)}</p>
                  {item.params ? (
                    <dl className="mt-1.5 grid gap-x-6 gap-y-1 text-[11px] leading-4 sm:grid-cols-2">
                      {item.params.map(([flag, meaning]) => (
                        <div key={flag} className="flex gap-2">
                          <dt className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-ink-2">{flag}</dt>
                          <dd className="min-w-0 text-ink-3">{t(meaning)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {item.example ? (
                    <code className="mt-1.5 block break-all rounded-md bg-code-bg px-2 py-1 font-mono text-[11px] text-ink-2">
                      {item.example}
                    </code>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center">
                  <CopyIconButton
                    text={item.key}
                    label={t({ zh: `复制${t(dataset.keyLabel)}`, en: `Copy ${t(dataset.keyLabel)}` })}
                  />
                  {item.example ? (
                    <CopyIconButton
                      text={item.example}
                      label={t({ zh: '复制示例', en: 'Copy example' })}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
