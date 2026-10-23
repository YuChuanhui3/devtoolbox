import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { CopyIconButton } from '@/components/tool/ToolActions';
import { EmptyState } from '@/components/ui/EmptyState';
import { HTTP_STATUS_CODES, STATUS_CATEGORIES, getStatusCategory, type StatusCategory } from '@/data/httpStatus';
import { useI18n } from '@/i18n/I18nProvider';
import { cn } from '@/lib/cn';

type Filter = 'all' | StatusCategory['id'];

const CATEGORY_TONE: Record<StatusCategory['id'], 'accent' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  '1xx': 'accent',
  '2xx': 'success',
  '3xx': 'accent',
  '4xx': 'warning',
  '5xx': 'danger',
};

const CODE_TONE: Record<StatusCategory['id'], string> = {
  '1xx': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  '2xx': 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  '3xx': 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  '4xx': 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  '5xx': 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

export default function HttpStatusTool() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return HTTP_STATUS_CODES.filter((item) => {
      const category = getStatusCategory(item.code);
      if (filter !== 'all' && category.id !== filter) return false;
      if (!keyword) return true;
      return (
        String(item.code).includes(keyword) ||
        t(item.name).toLowerCase().includes(keyword) ||
        t(item.description).toLowerCase().includes(keyword) ||
        t(item.usage).toLowerCase().includes(keyword)
      );
    });
  }, [query, filter, t]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t({ zh: '搜索状态码、名称或说明…', en: 'Search status codes, names, or descriptions…' })}
            aria-label={t({ zh: '搜索 HTTP 状态码', en: 'Search HTTP status codes' })}
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
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs transition-colors duration-300',
              filter === 'all' ? 'bg-accent-strong text-accent-contrast' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )}
          >
            {t({ zh: '全部', en: 'All' })} {HTTP_STATUS_CODES.length}
          </button>
          {STATUS_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              title={t(category.description)}
              onClick={() => setFilter(category.id)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs transition-colors duration-300',
                filter === category.id
                  ? 'bg-accent-strong text-accent-contrast'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )}
            >
              {category.id}
            </button>
          ))}
        </div>
      </div>

      <p className="px-1 text-xs text-ink-3">
        {t({ zh: '共', en: '' })}{' '}
        <span className="font-semibold text-ink-2">{filtered.length}</span>{' '}
        {t({ zh: '条状态码', en: 'status codes' })}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title={t({ zh: '没有找到匹配的状态码', en: 'No matching status codes' })}
          description={t({ zh: '试试搜索 404、401、500 等数字，或切换到其他分类。', en: 'Try searching numbers like 404, 401, 500, or switch category.' })}
        />
      ) : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {filtered.map((item) => {
              const category = getStatusCategory(item.code);
              return (
                <li key={item.code} className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/40">
                  <span
                    className={cn(
                      'mt-0.5 inline-flex h-9 min-w-12 shrink-0 items-center justify-center rounded-lg px-2 font-mono text-sm font-semibold',
                      CODE_TONE[category.id],
                    )}
                  >
                    {item.code}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{t(item.name)}</span>
                      <span className="text-xs text-ink-2">{t(item.description)}</span>
                      <Badge tone={CATEGORY_TONE[category.id]}>{category.id}</Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-ink-3">{t(item.usage)}</p>
                  </div>

                  <CopyIconButton
                    text={`${item.code} ${t(item.name)} - ${t(item.description)}`}
                    label={t({ zh: `复制 ${item.code}`, en: `Copy ${item.code}` })}
                  />
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
