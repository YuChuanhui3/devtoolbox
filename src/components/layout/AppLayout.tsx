import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Braces, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { Header } from './Header';
import { Footer } from './Footer';
import { Sidebar } from './Sidebar';
import { ShortcutsDialog } from './ShortcutsDialog';
import { SettingsDialog } from './SettingsDialog';
import { IconButton } from '@/components/ui/IconButton';
import { useAppStore } from '@/store/appStore';
import { useApplyTheme } from '@/hooks/useTheme';
import { useI18n } from '@/i18n/I18nProvider';
import { cn } from '@/lib/cn';

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { pathname } = useLocation();
  const { t } = useI18n();
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);

  useApplyTheme();

  useEffect(() => {
    window.scrollTo(0, 0);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <a
        href="#main-content"
        className="sr-only z-[110] rounded-full bg-accent px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t({ zh: '跳到主要内容', en: 'Skip to main content' })}
      </a>

      <Header
        onOpenMenu={() => setMenuOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />

      <div className="mx-auto flex w-full max-w-[1440px] flex-1 items-stretch">
        <div
          className={cn(
            'sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 border-r border-line transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:block',
            sidebarCollapsed ? 'w-16' : 'w-60',
          )}
        >
          <Sidebar collapsed={sidebarCollapsed} />
          <button
            type="button"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? t({ zh: '展开侧边栏', en: 'Expand sidebar' }) : t({ zh: '折叠侧边栏', en: 'Collapse sidebar' })}
            aria-label={sidebarCollapsed ? t({ zh: '展开侧边栏', en: 'Expand sidebar' }) : t({ zh: '折叠侧边栏', en: 'Collapse sidebar' })}
            aria-pressed={sidebarCollapsed}
            className="absolute -right-3 top-7 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-ink-3 shadow-card transition-[transform,color,border-color] duration-300 ease-out hover:scale-110 hover:border-accent/40 hover:text-accent active:scale-95"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        <main id="main-content" className="min-w-0 flex-1 px-3 py-5 sm:px-5 lg:px-7 lg:py-7">
          <Outlet />
        </main>
      </div>

      <Footer onShowShortcuts={() => setShortcutsOpen(true)} />

      {menuOpen ? (
        <div className="fixed inset-0 z-[80] md:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-[rgba(8,12,20,0.45)] backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-[82vw] max-w-72 animate-fade-in-up flex-col bg-bg shadow-[0_25px_60px_rgba(8,12,20,0.35)]">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg [background-image:var(--btn-grad)] text-white">
                  <Braces className="h-4 w-4" aria-hidden="true" />
                </span>
                DevToolbox
              </span>
              <IconButton
                label={t({ zh: '关闭导航菜单', en: 'Close navigation menu' })}
                size="sm"
                onClick={() => setMenuOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Sidebar onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
    </div>
  );
}
