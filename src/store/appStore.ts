import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { detectLocale, type Locale } from '@/i18n/locale';
import { resolveToolId } from '@/data/tools';
import type { RecentEntry } from '@/types/tool';

export type ThemeMode = 'light' | 'dark' | 'system';

export const MAX_RECENT = 20;
export const MAX_SEARCH_HISTORY = 10;

/** 统一收藏判定：容忍 localStorage 里残留的旧 ID，避免收藏页有项、星标不亮。 */
export const isFavoriteTool = (favorites: readonly string[], toolId: string): boolean =>
  favorites.some((id) => resolveToolId(id) === toolId);

interface AppState {
  themeMode: ThemeMode;
  locale: Locale;
  favorites: string[];
  recent: RecentEntry[];
  searchHistory: string[];
  markdownDraft: string;
  draftEnabled: boolean;
  analyticsEnabled: boolean;
  sidebarCollapsed: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  toggleFavorite: (toolId: string) => boolean;
  isFavorite: (toolId: string) => boolean;
  clearFavorites: () => void;
  addRecent: (toolId: string) => void;
  clearRecent: () => void;
  addSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
  setMarkdownDraft: (draft: string) => void;
  clearMarkdownDraft: () => void;
  setDraftEnabled: (enabled: boolean) => void;
  setAnalyticsEnabled: (enabled: boolean) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      themeMode: 'light',
      locale: detectLocale(),
      favorites: [],
      recent: [],
      searchHistory: [],
      markdownDraft: '',
      draftEnabled: true,
      analyticsEnabled: true,
      sidebarCollapsed: false,

      setThemeMode: (mode) => set({ themeMode: mode }),

      setLocale: (locale) => set({ locale }),

      toggleTheme: () => {
        const current = get().themeMode;
        set({ themeMode: current === 'dark' ? 'light' : 'dark' });
      },

      toggleFavorite: (toolId) => {
        const canonicalId = resolveToolId(toolId);
        const isFav = get().favorites.some((id) => resolveToolId(id) === canonicalId);
        set((state) => ({
          favorites: isFav
            ? state.favorites.filter((id) => resolveToolId(id) !== canonicalId)
            : [
                canonicalId,
                ...state.favorites.filter((id) => resolveToolId(id) !== canonicalId),
              ],
        }));
        return !isFav;
      },

      isFavorite: (toolId) => {
        const canonicalId = resolveToolId(toolId);
        return get().favorites.some((id) => resolveToolId(id) === canonicalId);
      },

      clearFavorites: () => set({ favorites: [] }),

      addRecent: (toolId) => {
        const canonicalId = resolveToolId(toolId);
        set((state) => ({
          recent: [
            { toolId: canonicalId, visitedAt: Date.now() },
            ...state.recent.filter((entry) => resolveToolId(entry.toolId) !== canonicalId),
          ].slice(0, MAX_RECENT),
        }));
      },

      clearRecent: () => set({ recent: [] }),

      addSearchHistory: (query) => {
        const keyword = query.trim();
        if (!keyword) return;
        set((state) => ({
          searchHistory: [
            keyword,
            ...state.searchHistory.filter((item) => item !== keyword),
          ].slice(0, MAX_SEARCH_HISTORY),
        }));
      },

      clearSearchHistory: () => set({ searchHistory: [] }),

      setMarkdownDraft: (draft) => set({ markdownDraft: draft }),

      clearMarkdownDraft: () => set({ markdownDraft: '' }),

      setDraftEnabled: (enabled) => set({ draftEnabled: enabled }),

      setAnalyticsEnabled: (enabled) => set({ analyticsEnabled: enabled }),

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    {
      name: 'devtoolbox-store',
      version: 3,
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<AppState>;
        if (version < 3 && state.locale === undefined) {
          state.locale = detectLocale();
        }
        // 幂等规范化：任何版本都可能残留合并前的旧 ID（工具整合发生在 v3 之后），
        // 每次启动都去重归一，而不是只在 <2 时迁移。
        state.favorites = [...new Set((state.favorites ?? []).map(resolveToolId))];
        state.recent = (state.recent ?? []).reduce<RecentEntry[]>((list, entry) => {
          const toolId = resolveToolId(entry.toolId);
          if (!list.some((item) => item.toolId === toolId)) {
            list.push({ ...entry, toolId });
          }
          return list;
        }, []).slice(0, MAX_RECENT);
        return state;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        themeMode: state.themeMode,
        locale: state.locale,
        favorites: state.favorites,
        recent: state.recent,
        searchHistory: state.searchHistory,
        markdownDraft: state.markdownDraft,
        draftEnabled: state.draftEnabled,
        analyticsEnabled: state.analyticsEnabled,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);
