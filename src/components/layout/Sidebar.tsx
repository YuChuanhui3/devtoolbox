import { NavLink, useLocation } from 'react-router-dom';
import { Clock, LayoutGrid, ShieldCheck, Star } from 'lucide-react';
import { CATEGORIES } from '@/data/categories';
import { getTool, getToolsByCategory, sortToolsForLocale, toolPath, toolName } from '@/data/tools';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { cn } from '@/lib/cn';
import type { CategoryId } from '@/types/tool';

interface SidebarProps {
  onNavigate?: () => void;
  className?: string;
  /** 折叠为纯图标栏（仅桌面端；移动端抽屉恒为展开）。 */
  collapsed?: boolean;
}

const QUICK_LINKS: Array<{ to: string; label: L10n; icon: typeof LayoutGrid }> = [
  { to: '/tools', label: { zh: '全部工具', en: 'All Tools' }, icon: LayoutGrid },
  { to: '/favorites', label: { zh: '我的收藏', en: 'Favorites' }, icon: Star },
  { to: '/recent', label: { zh: '最近使用', en: 'Recent' }, icon: Clock },
];

function resolveCategory(pathname: string): CategoryId | null {
  if (pathname.startsWith('/category/')) {
    return (pathname.split('/')[2] as CategoryId) ?? null;
  }
  if (pathname.startsWith('/tools/')) {
    const toolId = pathname.split('/')[2];
    return getTool(toolId)?.category ?? null;
  }
  return null;
}

export function Sidebar({ onNavigate, className, collapsed = false }: SidebarProps) {
  const { pathname } = useLocation();
  const { t, locale } = useI18n();
  const currentCategory = resolveCategory(pathname);
  const labelClass = cn(
    'min-w-0 flex-1 truncate transition-opacity duration-200',
    collapsed && 'opacity-0',
  );

  return (
    <aside className={cn('flex h-full flex-col overflow-y-auto overflow-x-hidden p-3', className)}>
      <nav
        aria-label={t({ zh: '工具分类', en: 'Tool categories' })}
        className="flex flex-col gap-0.5"
      >
        <p
          className={cn(
            'px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap text-ink-3 transition-opacity duration-200',
            collapsed && 'opacity-0',
          )}
        >
          {t({ zh: '工具分类', en: 'Categories' })}
        </p>

        {CATEGORIES.map((category) => {
          const tools = sortToolsForLocale(getToolsByCategory(category.id), locale);
          const active = currentCategory === category.id && !collapsed;
          const categoryName = t(category.name);

          return (
            <div key={category.id}>
              <NavLink
                to={`/category/${category.id}`}
                onClick={onNavigate}
                title={collapsed ? `${categoryName} · ${tools.length}` : undefined}
                className={cn(
                  'group relative flex items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2 text-sm transition-colors duration-300',
                  currentCategory === category.id
                    ? 'bg-accent-soft font-semibold text-accent-strong'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
              >
                {currentCategory === category.id ? (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                ) : null}
                <ToolIcon name={category.icon} className="h-4 w-4 shrink-0" />
                <span className={labelClass}>{categoryName}</span>
                <span
                  className={cn(
                    'shrink-0 text-[11px] font-normal whitespace-nowrap text-ink-3 transition-opacity duration-200',
                    collapsed && 'opacity-0',
                  )}
                >
                  {tools.length}
                </span>
              </NavLink>

              {active ? (
                <ul className="mb-1 ml-[22px] mt-0.5 space-y-0.5 border-l border-line pl-2">
                  {tools.map((tool) => (
                    <li key={tool.id}>
                      <NavLink
                        to={toolPath(tool.id)}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          cn(
                            'block truncate rounded-lg px-2 py-1.5 text-xs transition-colors duration-300',
                            isActive
                              ? 'bg-surface-2 font-medium text-accent-strong'
                              : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
                          )
                        }
                      >
                        {toolName(tool, locale)}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}

        <div className="my-3 border-t border-line" />

        <p
          className={cn(
            'px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap text-ink-3 transition-opacity duration-200',
            collapsed && 'opacity-0',
          )}
        >
          {t({ zh: '快捷入口', en: 'Shortcuts' })}
        </p>
        {QUICK_LINKS.map((link) => {
          const label = t(link.label);
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2 text-sm whitespace-nowrap transition-colors duration-300',
                  isActive
                    ? 'bg-accent-soft font-semibold text-accent-strong'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className={labelClass}>{label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto pt-4">
        {collapsed ? (
          <p
            title={t({
              zh: '本地处理优先：文本、JSON 与图片默认在浏览器内完成，不会上传服务器。',
              en: 'Local-first: text, JSON and images stay in your browser and are never uploaded.',
            })}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-2xl border border-line bg-surface-2/70 text-ok"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </p>
        ) : (
          <div className="rounded-2xl border border-line bg-surface-2/70 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
              <ShieldCheck className="h-3.5 w-3.5 text-ok" aria-hidden="true" />
              {t({ zh: '本地处理优先', en: 'Local-first processing' })}
            </p>
            <p className="mt-1.5 text-[11px] leading-5 text-ink-3">
              {t({
                zh: '文本、JSON 与图片默认在浏览器内完成，不会上传服务器。',
                en: 'Text, JSON and images stay in your browser and are never uploaded.',
              })}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
