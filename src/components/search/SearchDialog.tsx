import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search, Sparkles } from 'lucide-react';
import { FEATURED_TOOLS, getTool, searchTools, sortToolsForLocale, toolDescription, toolName, toolPath } from '@/data/tools';
import { getCategory } from '@/data/categories';
import { useAppStore } from '@/store/appStore';
import { Modal } from '@/components/ui/Modal';
import { Kbd } from '@/components/ui/Kbd';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { useI18n } from '@/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { trackSearch } from '@/lib/analytics';
import type { ToolMeta } from '@/types/tool';

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

interface SearchEntry {
  tool: ToolMeta;
  group: string;
}

export function SearchDialog({ open, onClose }: SearchDialogProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t, locale } = useI18n();

  const favorites = useAppStore((state) => state.favorites);
  const recent = useAppStore((state) => state.recent);
  const searchHistory = useAppStore((state) => state.searchHistory);
  const addSearchHistory = useAppStore((state) => state.addSearchHistory);
  const clearSearchHistory = useAppStore((state) => state.clearSearchHistory);

  const results = useMemo(() => (query.trim() ? searchTools(query, locale).slice(0, 12) : []), [query, locale]);

  const entries = useMemo<SearchEntry[]>(() => {
    if (query.trim()) {
      return results.map((tool) => ({ tool, group: t({ zh: '搜索结果', en: 'Search results' }) }));
    }

    const seen = new Set<string>();
    const list: SearchEntry[] = [];
    const push = (tools: ToolMeta[], group: string) => {
      for (const tool of tools) {
        if (seen.has(tool.id)) continue;
        seen.add(tool.id);
        list.push({ tool, group });
      }
    };

    push(
      recent.map((entry) => getTool(entry.toolId)).filter((tool): tool is ToolMeta => Boolean(tool)).slice(0, 4),
      t({ zh: '最近使用', en: 'Recent' }),
    );
    push(
      favorites.map((id) => getTool(id)).filter((tool): tool is ToolMeta => Boolean(tool)).slice(0, 4),
      t({ zh: '我的收藏', en: 'Favorites' }),
    );
    push(sortToolsForLocale(FEATURED_TOOLS, locale).slice(0, 6), t({ zh: '推荐工具', en: 'Featured' }));
    return list.slice(0, 14);
  }, [query, results, recent, favorites, locale, t]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const node = document.querySelector<HTMLElement>(`[data-search-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const openTool = (tool: ToolMeta) => {
    const keyword = query.trim();
    addSearchHistory(keyword || toolName(tool, locale));
    if (keyword && useAppStore.getState().analyticsEnabled) trackSearch();
    onClose();
    navigate(toolPath(tool.id));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (entries.length > 0) setActiveIndex((index) => (index + 1) % entries.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (entries.length > 0) setActiveIndex((index) => (index - 1 + entries.length) % entries.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = entries[activeIndex];
      if (selected) openTool(selected.tool);
    }
  };

  let lastGroup = '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="max-w-2xl"
      bodyClassName="p-3 sm:p-4"
      align="top"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t({
            zh: '搜索工具，例如 JSON、Base64、Markdown、时间戳',
            en: 'Search tools, e.g. JSON, Base64, Markdown, timestamp',
          })}
          aria-label={t({ zh: '搜索工具', en: 'Search tools' })}
          className="h-12 w-full rounded-2xl border border-line bg-surface-2 pl-11 pr-20 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent-soft"
        />
        <span className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 sm:flex">
          <Kbd>Esc</Kbd>
        </span>
      </div>

      {query.trim() && results.length === 0 ? (
        <div className="px-2 py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-ink-3">
            <Search className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-ink">
            {t({
              zh: `没有找到 “${query.trim()}” 相关工具`,
              en: `No tools found for “${query.trim()}”`,
            })}
          </p>
          <p className="mt-1.5 text-xs leading-5 text-ink-3">
            {t({
              zh: '可以尝试更简短的关键词，或搜索工具别名，例如 md、base64、json。',
              en: 'Try a shorter keyword, or search by alias, e.g. md, base64, json.',
            })}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {sortToolsForLocale(FEATURED_TOOLS, locale).slice(0, 5).map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => openTool(tool)}
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition-colors hover:border-accent/40 hover:text-accent-strong"
              >
                {toolName(tool, locale)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-2 max-h-[58vh] overflow-y-auto pr-1 code-scroll">
          {entries.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-ink-3">
              {t({ zh: '输入关键词开始搜索工具', en: 'Type a keyword to search tools' })}
            </div>
          ) : null}

          {entries.map((entry, index) => {
            const showGroup = entry.group !== lastGroup;
            lastGroup = entry.group;
            const category = getCategory(entry.tool.category);

            return (
              <div key={entry.tool.id}>
                {showGroup ? (
                  <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                    {entry.group}
                  </p>
                ) : null}
                <button
                  type="button"
                  data-search-index={index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openTool(entry.tool)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-150',
                    activeIndex === index ? 'bg-accent-soft' : 'hover:bg-surface-2',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      category?.tone ?? 'bg-accent-soft text-accent',
                    )}
                  >
                    <ToolIcon name={entry.tool.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          'truncate text-sm font-medium',
                          activeIndex === index ? 'text-accent-strong' : 'text-ink',
                        )}
                      >
                        {toolName(entry.tool, locale)}
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-3">{category ? t(category.name) : null}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-3">{toolDescription(entry.tool, locale)}</span>
                  </span>
                  {activeIndex === index ? (
                    <CornerDownLeft className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line px-1 pt-3">
        <div className="flex items-center gap-2 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> {t({ zh: '选择', en: 'Select' })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Enter</Kbd> {t({ zh: '打开', en: 'Open' })}
          </span>
        </div>
        {searchHistory.length > 0 && !query.trim() ? (
          <button
            type="button"
            onClick={clearSearchHistory}
            className="text-[11px] text-ink-3 transition-colors hover:text-ink"
          >
            {t({ zh: '清空搜索历史', en: 'Clear search history' })}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {t({
              zh: '支持名称、别名与标签搜索',
              en: 'Search by name, alias and tag',
            })}
          </span>
        )}
      </div>
    </Modal>
  );
}
