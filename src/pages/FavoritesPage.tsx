import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Trash2 } from 'lucide-react';
import { getToolsByIds } from '@/data/tools';
import { useAppStore } from '@/store/appStore';
import { ToolCard } from '@/components/ToolCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import { useSeo } from '@/hooks/useSeo';

export function FavoritesPage() {
  const { t } = useI18n();
  useSeo(
    { zh: '我的收藏', en: 'Favorites' },
    { zh: '管理你收藏的常用工具。', en: 'Manage the tools you have favorited.' },
  );

  const favorites = useAppStore((state) => state.favorites);
  const clearFavorites = useAppStore((state) => state.clearFavorites);
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const tools = useMemo(() => getToolsByIds(favorites), [favorites]);

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
              {t({ zh: '我的收藏', en: 'My Favorites' })}
            </h1>
            <Badge tone="accent">
              {t({
                zh: `${tools.length} 个`,
                en: `${tools.length} tool${tools.length === 1 ? '' : 's'}`,
              })}
            </Badge>
          </div>
          <p className="mt-1.5 text-sm text-ink-3">
            {t({
              zh: '收藏的常用工具会保存在本机浏览器，清除浏览器数据后会丢失。',
              en: 'Favorited tools are saved in this browser and will be lost if you clear browser data.',
            })}
          </p>
        </div>

        {tools.length > 0 ? (
          <Button
            variant={confirming ? 'danger' : 'ghost'}
            size="sm"
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              clearFavorites();
              setConfirming(false);
              toast.success(t({ zh: '已清空收藏', en: 'Favorites cleared' }));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {confirming
              ? t({ zh: '确认清空？', en: 'Click again to clear' })
              : t({ zh: '清空收藏', en: 'Clear favorites' })}
          </Button>
        ) : null}
      </header>

      {tools.length === 0 ? (
        <EmptyState
          icon={<Star className="h-6 w-6" aria-hidden="true" />}
          title={t({ zh: '还没有收藏任何工具', en: 'No favorited tools yet' })}
          description={t({
            zh: '打开工具页后，点击右上角的 ⭐ 即可收藏常用工具。收藏会保存在本机，刷新后依然存在。',
            en: 'Open any tool and click the ⭐ in the top right to favorite it. Favorites persist across reloads on this device.',
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} showCategory />
          ))}
        </div>
      )}
    </div>
  );
}
