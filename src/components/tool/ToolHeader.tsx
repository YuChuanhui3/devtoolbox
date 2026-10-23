import { Link } from 'react-router-dom';
import { ChevronRight, Link as LinkIcon, Star } from 'lucide-react';
import { getCategory } from '@/data/categories';
import { toolDescription, toolName } from '@/data/tools';
import { useAppStore } from '@/store/appStore';
import { useI18n } from '@/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { useToast } from '@/components/ui/Toast';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { toolChipTone } from '@/lib/toolTone';
import type { ToolMeta } from '@/types/tool';

export function ToolHeader({ tool }: { tool: ToolMeta }) {
  const isFavorite = useAppStore((state) => state.favorites.includes(tool.id));
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const toast = useToast();
  const { t, locale } = useI18n();
  const category = getCategory(tool.category);
  const name = toolName(tool, locale);

  return (
    <header className="space-y-3">
      <nav
        aria-label={t({ zh: '面包屑', en: 'Breadcrumb' })}
        className="flex flex-wrap items-center gap-1 text-xs text-ink-3"
      >
        <Link to="/" className="inline-flex items-center px-0.5 transition-colors hover:text-accent-strong">
          {t({ zh: '首页', en: 'Home' })}
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <Link
          to={`/category/${tool.category}`}
          className="inline-flex items-center px-0.5 transition-colors hover:text-accent-strong"
        >
          {t(category?.name ?? { zh: '工具', en: 'Tools' })}
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="text-ink-2">{name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
              toolChipTone(tool.sensitive),
            )}
          >
            <ToolIcon name={tool.icon} className="h-5.5 w-5.5" />
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[28px] font-semibold leading-tight tracking-[0.01em] text-ink">{name}</h1>
              {category ? <Badge tone="accent">{t(category.name)}</Badge> : null}
              {tool.priority === 'P0' ? (
                <Badge tone="success">{t({ zh: '常用', en: 'Popular' })}</Badge>
              ) : null}
            </div>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-ink-3">{toolDescription(tool, locale)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tool.tags
                .filter((tag) => locale === 'zh' || !/[\u4e00-\u9fff]/.test(tag))
                .slice(0, 5)
                .map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-line bg-surface-2/60 px-2 py-1 font-mono text-[11px] text-ink-3"
                  >
                    {tag}
                  </span>
                ))}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={isFavorite}
            onClick={() => {
              const added = toggleFavorite(tool.id);
              toast.success(
                added
                  ? t({ zh: `已收藏 ${name}`, en: `Added ${name} to favorites` })
                  : t({ zh: `已取消收藏 ${name}`, en: `Removed ${name} from favorites` }),
              );
            }}
          >
            <Star
              className={cn('h-3.5 w-3.5', isFavorite ? 'fill-amber-500 text-amber-500' : 'text-ink-3')}
              aria-hidden="true"
            />
            {isFavorite ? t({ zh: '已收藏', en: 'Favorited' }) : t({ zh: '收藏', en: 'Favorite' })}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const ok = await copyText(window.location.href);
              toast[ok ? 'success' : 'error'](
                ok
                  ? t({ zh: '工具链接已复制', en: 'Tool link copied' })
                  : t({ zh: '复制链接失败', en: 'Failed to copy link' }),
              );
            }}
          >
            <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '分享', en: 'Share' })}
          </Button>
        </div>
      </div>
    </header>
  );
}
