import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Star, Trash2 } from 'lucide-react';
import { getCategory } from '@/data/categories';
import { getTool, toolDescription, toolName, toolPath } from '@/data/tools';
import { useAppStore } from '@/store/appStore';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { useSeo } from '@/hooks/useSeo';
import { cn } from '@/lib/cn';
import type { RecentEntry, ToolMeta } from '@/types/tool';

function formatRelativeTime(
  timestamp: number,
  t: (value: Localized) => string,
  locale: string,
): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return t({ zh: '刚刚', en: 'just now' });
  const minutes = Math.floor(diff / 60_000);
  if (diff < 3_600_000) return t({ zh: `${minutes} 分钟前`, en: `${minutes} min ago` });
  const hours = Math.floor(diff / 3_600_000);
  if (diff < 86_400_000) return t({ zh: `${hours} 小时前`, en: `${hours} h ago` });
  return new Date(timestamp).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface RecentRow {
  entry: RecentEntry;
  tool: ToolMeta;
}

export function RecentPage() {
  const { t, locale } = useI18n();
  useSeo(
    { zh: '最近使用', en: 'Recent' },
    { zh: '查看最近打开过的工具。', en: 'See the tools you opened recently.' },
  );

  const recent = useAppStore((state) => state.recent);
  const favorites = useAppStore((state) => state.favorites);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const clearRecent = useAppStore((state) => state.clearRecent);
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const rows = useMemo<RecentRow[]>(() => {
    const seen = new Set<string>();
    const list: RecentRow[] = [];
    for (const entry of recent) {
      const tool = getTool(entry.toolId);
      if (!tool || seen.has(tool.id)) continue;
      seen.add(tool.id);
      list.push({ entry, tool });
    }
    return list;
  }, [recent]);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-[0.01em] text-ink">
              {t({ zh: '最近使用', en: 'Recently Used' })}
            </h1>
            <Badge tone="accent">
              {t({ zh: `${rows.length} 条`, en: `${rows.length} entry${rows.length === 1 ? '' : 'ies'}` })}
            </Badge>
          </div>
          <p className="mt-1.5 text-sm text-ink-3">
            {t({
              zh: '最多保留最近 20 条记录，仅保存在本机浏览器。',
              en: 'Keeps up to 20 recent entries, stored in this browser only.',
            })}
          </p>
        </div>

        {rows.length > 0 ? (
          <Button
            variant={confirming ? 'danger' : 'ghost'}
            size="sm"
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              clearRecent();
              setConfirming(false);
              toast.success(t({ zh: '已清空最近使用', en: 'Recent history cleared' }));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {confirming
              ? t({ zh: '确认清空？', en: 'Click again to clear' })
              : t({ zh: '清空记录', en: 'Clear history' })}
          </Button>
        ) : null}
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-6 w-6" aria-hidden="true" />}
          title={t({ zh: '最近还没有使用过工具', en: 'No recent tools yet' })}
          description={t({
            zh: '打开任意工具后，它会自动出现在这里，方便下次快速进入。',
            en: 'Open any tool and it will show up here for quick access next time.',
          })}
          action={
            <Link
              to="/tools"
              className="inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-white shadow-[0_6px_18px_rgba(33,150,243,0.28)] [background-image:var(--btn-grad)] transition-transform duration-300 hover:-translate-y-0.5"
            >
              {t({ zh: '去全部工具看看', en: 'Browse all tools' })}
            </Link>
          }
        />
      ) : (
        <ul className="card-surface divide-y divide-line overflow-hidden">
          {rows.map(({ entry, tool }, index) => {
            const category = getCategory(tool.category);
            const isFavorite = favorites.includes(tool.id);

            return (
              <li key={tool.id} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60">
                <span className="w-5 shrink-0 text-center font-mono text-[11px] text-ink-3">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <Link to={toolPath(tool.id)} className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      category?.tone ?? 'bg-accent-soft text-accent',
                    )}
                  >
                    <ToolIcon name={tool.icon} className="h-4 w-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{toolName(tool, locale)}</span>
                      <span className="text-[11px] text-ink-3">{category ? t(category.name) : null}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-3">{toolDescription(tool, locale)}</span>
                  </span>

                  <span className="hidden shrink-0 text-[11px] text-ink-3 sm:block">
                    {formatRelativeTime(entry.visitedAt, t, locale)}
                  </span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-ink-3 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-accent"
                    aria-hidden="true"
                  />
                </Link>

                <button
                  type="button"
                  aria-label={
                    isFavorite
                      ? t({ zh: `取消收藏 ${toolName(tool, locale)}`, en: `Unfavorite ${toolName(tool, locale)}` })
                      : t({ zh: `收藏 ${toolName(tool, locale)}`, en: `Favorite ${toolName(tool, locale)}` })
                  }
                  aria-pressed={isFavorite}
                  onClick={() => {
                    const added = toggleFavorite(tool.id);
                    toast.success(
                      added
                        ? t({ zh: `已收藏 ${toolName(tool, locale)}`, en: `Added ${toolName(tool, locale)} to favorites` })
                        : t({ zh: `已取消收藏 ${toolName(tool, locale)}`, en: `Removed ${toolName(tool, locale)} from favorites` }),
                    );
                  }}
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                    isFavorite
                      ? 'text-amber-500'
                      : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  <Star className={cn('h-4 w-4', isFavorite && 'fill-current')} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
