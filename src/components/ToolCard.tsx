import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { getCategory } from '@/data/categories';
import { toolDescription, toolName, toolPath } from '@/data/tools';
import { useAppStore } from '@/store/appStore';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { toolChipTone } from '@/lib/toolTone';
import type { ToolMeta } from '@/types/tool';

interface ToolCardProps {
  tool: ToolMeta;
  showCategory?: boolean;
  className?: string;
}

export function ToolCard({ tool, showCategory = false, className }: ToolCardProps) {
  const isFavorite = useAppStore((state) => state.favorites.includes(tool.id));
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const toast = useToast();
  const { t, locale } = useI18n();
  const category = getCategory(tool.category);
  const name = toolName(tool, locale);

  return (
    <Link
      to={toolPath(tool.id)}
      className={cn(
        'card-surface card-interactive group relative flex min-w-0 items-start gap-3 p-4',
        className,
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-500 ease-in-out group-hover:scale-105',
          toolChipTone(tool.sensitive),
        )}
      >
        <ToolIcon name={tool.icon} className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 pr-7">
          <span className="truncate text-sm font-semibold text-ink">{name}</span>
          {tool.isNew ? <Badge tone="new">New</Badge> : null}
        </span>
        <span className="mt-1 line-clamp-2 text-sm leading-6 text-ink-3">
          {toolDescription(tool, locale)}
        </span>
        {showCategory && category ? (
          <span className="mt-2 inline-flex text-xs font-medium text-ink-3">{t(category.name)}</span>
        ) : null}
      </span>

      <button
        type="button"
        aria-label={
          isFavorite
            ? t({ zh: `取消收藏 ${name}`, en: `Remove ${name} from favorites` })
            : t({ zh: `收藏 ${name}`, en: `Add ${name} to favorites` })
        }
        aria-pressed={isFavorite}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const added = toggleFavorite(tool.id);
          toast.success(
            added
              ? t({ zh: `已收藏 ${name}`, en: `Added ${name} to favorites` })
              : t({ zh: `已取消收藏 ${name}`, en: `Removed ${name} from favorites` }),
          );
        }}
        className={cn(
          'absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300',
          isFavorite
            ? 'text-amber-500 opacity-100'
            : 'text-ink-3 opacity-0 hover:bg-surface-2 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <Star className={cn('h-4 w-4', isFavorite && 'fill-current')} aria-hidden="true" />
      </button>
    </Link>
  );
}
