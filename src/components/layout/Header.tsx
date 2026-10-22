import { Link, NavLink } from 'react-router-dom';
import { Braces, Keyboard, Menu, Search, Settings2 } from 'lucide-react';
import { useSearch } from '@/components/search/SearchProvider';
import { useHotkey } from '@/hooks/useHotkey';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { IconButton } from '@/components/ui/IconButton';
import { Kbd } from '@/components/ui/Kbd';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitch } from './LanguageSwitch';
import { cn } from '@/lib/cn';

interface HeaderProps {
  onOpenMenu: () => void;
  onOpenSettings: () => void;
  onShowShortcuts: () => void;
}

const NAV_LINKS: Array<{ to: string; label: L10n; end: boolean }> = [
  { to: '/', label: { zh: '首页', en: 'Home' }, end: true },
  { to: '/tools', label: { zh: '全部工具', en: 'All Tools' }, end: false },
  { to: '/recent', label: { zh: '最近使用', en: 'Recent' }, end: false },
  { to: '/favorites', label: { zh: '我的收藏', en: 'Favorites' }, end: false },
];

export function Header({ onOpenMenu, onOpenSettings, onShowShortcuts }: HeaderProps) {
  const { openSearch } = useSearch();
  const { t } = useI18n();

  useHotkey({ key: 'k', metaOrCtrl: true }, (event) => {
    event.preventDefault();
    openSearch();
  });

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-xl no-print">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-3 sm:px-5">
        <Link
          to="/"
          className="group flex shrink-0 items-center gap-2.5"
          aria-label={t({ zh: 'DevToolbox 首页', en: 'DevToolbox home' })}
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl [background-image:var(--btn-grad)] text-white shadow-[0_6px_16px_rgba(33,150,243,0.28)] transition-transform duration-500 ease-in-out group-hover:-translate-y-0.5">
            <Braces className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-[15px] font-semibold tracking-[0.02em] text-ink">DevToolbox</span>
            <span className="mt-1 text-[10px] font-medium tracking-[0.08em] text-ink-3">
              {t({ zh: '开发者在线工具箱', en: 'Online Developer Toolbox' })}
            </span>
          </span>
        </Link>

        <nav
          aria-label={t({ zh: '主导航', en: 'Main navigation' })}
          className="ml-2 hidden items-center gap-0.5 md:flex"
        >
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-3 py-1.5 text-sm transition-colors duration-300',
                  isActive
                    ? 'bg-accent-soft font-semibold text-accent-strong'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              {t(link.label)}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={openSearch}
            className="hidden h-9 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-xs text-ink-3 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:text-ink hover:shadow-float sm:flex"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="w-28 text-left lg:w-40">
              {t({ zh: '搜索工具…', en: 'Search tools…' })}
            </span>
            <Kbd className="h-5 min-w-0 px-1.5 text-[10px]">⌘K</Kbd>
          </button>

          <IconButton
            label={t({ zh: '搜索工具', en: 'Search tools' })}
            className="sm:hidden"
            onClick={openSearch}
          >
            <Search className="h-4.5 w-4.5" aria-hidden="true" />
          </IconButton>

          <span className="hidden lg:inline-flex">
            <IconButton
              label={t({ zh: '查看快捷键', en: 'View shortcuts' })}
              onClick={onShowShortcuts}
            >
              <Keyboard className="h-4.5 w-4.5" aria-hidden="true" />
            </IconButton>
          </span>

          <LanguageSwitch />

          <ThemeToggle />

          <IconButton label={t({ zh: '打开设置', en: 'Open settings' })} onClick={onOpenSettings}>
            <Settings2 className="h-4.5 w-4.5" aria-hidden="true" />
          </IconButton>

          <IconButton
            label={t({ zh: '打开导航菜单', en: 'Open navigation menu' })}
            className="md:hidden"
            onClick={onOpenMenu}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
