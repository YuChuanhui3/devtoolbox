import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Search, ShieldCheck, Sparkles, Star, Zap } from 'lucide-react';
import { CATEGORIES } from '@/data/categories';
import { FEATURED_TOOLS, TOOLS, getToolsByCategory, getToolsByIds, sortToolsForLocale, toolName, toolPath } from '@/data/tools';
import { useAppStore } from '@/store/appStore';
import { useSearch } from '@/components/search/SearchProvider';
import { ToolCard } from '@/components/ToolCard';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { Kbd } from '@/components/ui/Kbd';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { useSeo } from '@/hooks/useSeo';

const QUICK_TAGS: Array<{ label: L10n; toolId: string }> = [
  { label: { zh: 'JSON', en: 'JSON' }, toolId: 'json-formatter' },
  { label: { zh: 'Base64', en: 'Base64' }, toolId: 'base64' },
  { label: { zh: '时间戳', en: 'Timestamp' }, toolId: 'timestamp' },
  { label: { zh: 'UUID', en: 'UUID' }, toolId: 'uuid' },
  { label: { zh: '正则', en: 'Regex' }, toolId: 'regex-tester' },
  { label: { zh: 'Markdown', en: 'Markdown' }, toolId: 'markdown-editor' },
  { label: { zh: '图片压缩', en: 'Compress' }, toolId: 'image-compress' },
];

function SectionHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-[0.01em] text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function HomePage() {
  const { t, locale } = useI18n();
  useSeo(undefined, {
    zh: `开发者在线工具箱：免费在线格式转换工具合集——JSON 格式化、图片转换、编码加密、时间戳、正则测试、Markdown 实时渲染、图片压缩等 ${TOOLS.length} 个工具，纯浏览器本地处理。`,
    en: `Online toolbox for developers: free online format converters plus JSON formatting, encoding & encryption, timestamps, regex testing, live Markdown and image compression — ${TOOLS.length} tools, fully local.`,
  }, {
    zh: '在线工具,在线格式转换工具,开发者工具箱,JSON 格式化工具,免费工具箱',
    en: 'online tools, online format converter, developer toolbox, json formatter, free tools',
  });

  const { openSearch } = useSearch();
  const recent = useAppStore((state) => state.recent);
  const favorites = useAppStore((state) => state.favorites);

  const recentTools = getToolsByIds(
    recent.map((entry) => entry.toolId),
    8,
  );
  const favoriteTools = getToolsByIds(favorites, 8);

  return (
    <div className="space-y-10">
      <section className="hero-glow relative overflow-hidden rounded-[28px] border border-line bg-surface px-5 py-10 shadow-card sm:px-8 sm:py-14">
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-[11px] font-medium text-accent-strong">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {t({ zh: '本地优先处理 · 数据不上传', en: 'Local-first processing · no uploads' })}
          </span>

          <h1 className="mt-5 text-balance text-3xl font-semibold leading-tight tracking-[0.01em] text-ink sm:text-[42px]">
            {t({ zh: '开发者在线工具箱', en: 'The Online Toolbox for Developers' })}
            <span className="mt-2 block text-lg font-medium text-ink-2 sm:text-xl">
              {t({
                zh: `${TOOLS.length} 个高频工具，打开即用`,
                en: `${TOOLS.length} everyday tools, ready to use`,
              })}
            </span>
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-6 text-ink-3">
            {t({
              zh: 'JSON 格式化、格式转换、编码加密、时间戳、正则测试、Markdown 实时渲染与图片压缩，统一交互、无需登录、默认在浏览器本地完成。',
              en: 'JSON formatting, format conversion, encoding and encryption, timestamps, regex testing, live Markdown and image compression — consistent UI, no sign-in, everything runs locally in your browser.',
            })}
          </p>

          <button
            type="button"
            onClick={openSearch}
            className="group mt-7 flex w-full max-w-2xl items-center gap-3 rounded-full border border-line bg-surface px-5 py-3.5 text-left shadow-float transition-all duration-500 ease-in-out hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-hover"
          >
            <Search className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink-3">
              {t({
                zh: '搜索工具，例如 JSON、Base64、Markdown、图片压缩',
                en: 'Search tools, e.g. JSON, Base64, Markdown, image compression',
              })}
            </span>
            <span className="hidden shrink-0 items-center gap-1 sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[11px] text-ink-3">
              {t({ zh: '常用：', en: 'Popular:' })}
            </span>
            {QUICK_TAGS.map((tag) => (
              <Link
                key={tag.toolId}
                to={toolPath(tag.toolId)}
                className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] text-ink-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent-strong"
              >
                {t(tag.label)}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {recentTools.length > 0 ? (
        <section>
          <SectionHeader
            icon={<Clock className="h-4 w-4" aria-hidden="true" />}
            title={t({ zh: '最近使用', en: 'Recently Used' })}
            subtitle={t({ zh: '继续上次的工作', en: 'Pick up where you left off' })}
            action={
              <Link
                to="/recent"
                className="inline-flex items-center gap-1 text-xs text-ink-3 transition-colors hover:text-accent-strong"
              >
                {t({ zh: '查看全部', en: 'View all' })} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {recentTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} showCategory />
            ))}
          </div>
        </section>
      ) : null}

      {favoriteTools.length > 0 ? (
        <section>
          <SectionHeader
            icon={<Star className="h-4 w-4" aria-hidden="true" />}
            title={t({ zh: '我的收藏', en: 'My Favorites' })}
            subtitle={t({ zh: '你最常用的工具', en: 'The tools you use most' })}
            action={
              <Link
                to="/favorites"
                className="inline-flex items-center gap-1 text-xs text-ink-3 transition-colors hover:text-accent-strong"
              >
                {t({ zh: '管理收藏', en: 'Manage' })} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {favoriteTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} showCategory />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader
          icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
          title={t({ zh: '推荐工具', en: 'Featured Tools' })}
          subtitle={t({ zh: '开箱即用的高频能力', en: 'Everyday capabilities, ready to use' })}
          action={
            <Link
              to="/tools"
              className="inline-flex items-center gap-1 text-xs text-ink-3 transition-colors hover:text-accent-strong"
            >
              {t({ zh: '全部工具', en: 'All Tools' })} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sortToolsForLocale(FEATURED_TOOLS, locale).map((tool) => (
            <ToolCard key={tool.id} tool={tool} showCategory />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          icon={<Zap className="h-4 w-4" aria-hidden="true" />}
          title={t({ zh: '全部工具分类', en: 'Tool Categories' })}
          subtitle={t({ zh: '按场景快速定位', en: 'Find tools by scenario' })}
          action={
            <Link
              to="/tools"
              className="inline-flex items-center gap-1 text-xs text-ink-3 transition-colors hover:text-accent-strong"
            >
              {t({ zh: '浏览全部', en: 'Browse all' })} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          }
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CATEGORIES.map((category) => {
            const tools = sortToolsForLocale(getToolsByCategory(category.id), locale);
            return (
              <div key={category.id} className="card-surface flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${category.tone}`}
                  >
                    <ToolIcon name={category.icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/category/${category.id}`}
                      className="text-sm font-semibold text-ink transition-colors hover:text-accent-strong"
                    >
                      {t(category.name)}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-3">
                      {t(category.description)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-3">
                    {tools.length}
                  </span>
                </div>

                <ul className="mt-3 flex flex-1 flex-col gap-0.5">
                  {tools.slice(0, 4).map((tool) => (
                    <li key={tool.id}>
                      <Link
                        to={toolPath(tool.id)}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-2 transition-colors duration-300 hover:bg-surface-2 hover:text-ink"
                      >
                        <ToolIcon name={tool.icon} className="h-3.5 w-3.5 text-ink-3" />
                        <span className="truncate">{toolName(tool, locale)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>

                <Link
                  to={`/category/${category.id}`}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent-strong transition-colors hover:text-accent"
                >
                  {t({
                    zh: `查看全部 ${tools.length} 个工具`,
                    en: `View all ${tools.length} tools`,
                  })}
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col items-start gap-4 rounded-card border border-line bg-surface-2/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ok-soft text-ok">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">
              {t({ zh: '隐私友好，本地优先', en: 'Privacy-friendly, local-first' })}
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-3">
              {t({
                zh: '文本、JSON、YAML 与图片处理均在浏览器内完成；收藏、最近使用仅保存在本机 localStorage，可随时清空。',
                en: 'Text, JSON, YAML and image processing all happen in your browser; favorites and recent history stay in your local localStorage and can be cleared anytime.',
              })}
            </p>
          </div>
        </div>
        <Link
          to="/privacy"
          className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs text-ink-2 transition-colors hover:border-accent/40 hover:text-accent-strong"
        >
          {t({ zh: '阅读隐私说明', en: 'Read privacy notes' })}
        </Link>
      </section>
    </div>
  );
}
