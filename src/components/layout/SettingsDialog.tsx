import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Database,
  Info,
  Keyboard,
  Monitor,
  Moon,
  Sun,
  Trash2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/Segmented';
import { Switch } from '@/components/ui/Switch';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { useToast } from '@/components/ui/Toast';
import { useAppStore, type ThemeMode } from '@/store/appStore';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Locale } from '@/i18n/locale';
import { getTool } from '@/data/tools';
import { clearToolDrafts, countToolDrafts } from '@/lib/drafts';
import {
  clearAnalytics,
  getAnalyticsSummary,
  type AnalyticsSummary,
} from '@/lib/analytics';
import { APP_BUILD_TIME, APP_VERSION } from '@/lib/appInfo';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onShowShortcuts: () => void;
}

const THEME_OPTIONS: Array<{ value: ThemeMode; label: L10n; icon: ReactNode }> = [
  { value: 'light', label: { zh: '浅色', en: 'Light' }, icon: <Sun className="h-3.5 w-3.5" aria-hidden="true" /> },
  { value: 'dark', label: { zh: '深色', en: 'Dark' }, icon: <Moon className="h-3.5 w-3.5" aria-hidden="true" /> },
  {
    value: 'system',
    label: { zh: '系统', en: 'System' },
    icon: <Monitor className="h-3.5 w-3.5" aria-hidden="true" />,
  },
];

const LOCALE_OPTIONS: Array<{ value: Locale; label: string }> = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];

function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/40 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-ink-3">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsDialog({ open, onClose, onShowShortcuts }: SettingsDialogProps) {
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const locale = useAppStore((state) => state.locale);
  const setLocale = useAppStore((state) => state.setLocale);
  const draftEnabled = useAppStore((state) => state.draftEnabled);
  const setDraftEnabled = useAppStore((state) => state.setDraftEnabled);
  const analyticsEnabled = useAppStore((state) => state.analyticsEnabled);
  const setAnalyticsEnabled = useAppStore((state) => state.setAnalyticsEnabled);
  const clearFavorites = useAppStore((state) => state.clearFavorites);
  const clearRecent = useAppStore((state) => state.clearRecent);
  const clearSearchHistory = useAppStore((state) => state.clearSearchHistory);
  const clearMarkdownDraft = useAppStore((state) => state.clearMarkdownDraft);
  const { t } = useI18n();
  const toast = useToast();

  const [draftCount, setDraftCount] = useState(0);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftCount(countToolDrafts());
    setSummary(getAnalyticsSummary());
  }, [open]);

  const buildDate = APP_BUILD_TIME ? APP_BUILD_TIME.slice(0, 10) : '';

  const clearAllLocalData = () => {
    clearFavorites();
    clearRecent();
    clearSearchHistory();
    clearMarkdownDraft();
    clearToolDrafts();
    clearAnalytics();
    setDraftCount(0);
    setSummary(getAnalyticsSummary());
    toast.success(t({ zh: '已清除本地数据', en: 'Local data cleared' }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t({ zh: '设置', en: 'Settings' })}
      description={t({
        zh: '偏好与数据均保存在当前浏览器，不会同步到云端',
        en: 'Preferences and data are stored only in this browser, never synced to the cloud',
      })}
      align="top"
      className="max-w-2xl"
      bodyClassName="max-h-[70vh] overflow-y-auto"
    >
      <div className="space-y-6">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">
            {t({ zh: '外观', en: 'Appearance' })}
          </h3>
          <div className="mt-2.5 space-y-2">
            <SettingsRow
              title={t({ zh: '主题', en: 'Theme' })}
              description={t({
                zh: '可跟随系统自动切换浅色与深色。',
                en: 'Follow the system between light and dark automatically.',
              })}
            >
              <Segmented<ThemeMode>
                value={themeMode}
                onChange={setThemeMode}
                ariaLabel={t({ zh: '主题设置', en: 'Theme settings' })}
                options={THEME_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
              />
            </SettingsRow>
            <SettingsRow
              title={t({ zh: '语言', en: 'Language' })}
              description={t({
                zh: '切换界面与工具文案的语言，立即生效并保存在本机。',
                en: 'Switch the interface and tool copy. Takes effect instantly and is saved on this device.',
              })}
            >
              <Segmented<Locale>
                value={locale}
                onChange={setLocale}
                ariaLabel={t({ zh: '语言设置', en: 'Language settings' })}
                options={LOCALE_OPTIONS}
              />
            </SettingsRow>
          </div>
        </section>

        <section>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '本地优先', en: 'Local-first' })}
          </h3>
          <div className="mt-2.5 space-y-2">
            <SettingsRow
              title={t({ zh: '自动保存工具草稿', en: 'Auto-save tool drafts' })}
              description={t({
                zh: `仅保存在本机；当前有 ${draftCount} 个工具草稿。加密与 JWT 工具不保存输入。`,
                en: `Saved on this device only; ${draftCount} tool draft(s) right now. Encryption and JWT tools never save input.`,
              })}
            >
              <Switch
                checked={draftEnabled}
                onChange={setDraftEnabled}
                label={t({ zh: '自动保存工具草稿', en: 'Auto-save tool drafts' })}
              />
            </SettingsRow>
            <SettingsRow
              title={t({ zh: '本地匿名统计', en: 'Anonymous local stats' })}
              description={t({
                zh: '只统计工具访问与执行次数，不记录输入内容，也不使用第三方脚本。',
                en: 'Counts tool visits and executions only. No input content is recorded and no third-party scripts are used.',
              })}
            >
              <Switch
                checked={analyticsEnabled}
                onChange={setAnalyticsEnabled}
                label={t({ zh: '本地匿名统计', en: 'Anonymous local stats' })}
              />
            </SettingsRow>
          </div>
        </section>

        <section>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '使用概况', en: 'Usage Overview' })}
          </h3>
          <div className="mt-2.5 rounded-xl border border-line bg-surface-2/40 p-3.5">
            {summary && summary.totalViews + summary.totalExecutions > 0 ? (
              <>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
                  <span>
                    {t({ zh: '工具访问', en: 'Tool visits' })}{' '}
                    <strong className="font-semibold text-ink">{summary.totalViews}</strong>{' '}
                    {t({ zh: '次', en: '' })}
                  </span>
                  <span>
                    {t({ zh: '执行', en: 'Executions' })}{' '}
                    <strong className="font-semibold text-ink">{summary.totalExecutions}</strong>{' '}
                    {t({ zh: '次', en: '' })}
                  </span>
                  <span>
                    {t({ zh: '失败', en: 'Errors' })}{' '}
                    <strong className="font-semibold text-ink">{summary.totalErrors}</strong>{' '}
                    {t({ zh: '次', en: '' })}
                  </span>
                  {summary.searches > 0 ? (
                    <span>
                      {t({ zh: '搜索', en: 'Searches' })}{' '}
                      <strong className="font-semibold text-ink">{summary.searches}</strong>{' '}
                      {t({ zh: '次', en: '' })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {summary.topTools.map((entry) => (
                    <Badge key={entry.toolId}>
                      {getTool(entry.toolId)?.name ?? entry.toolId} · {entry.count}
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs leading-5 text-ink-3">
                {t({
                  zh: '还没有本地统计。访客数据不会上传，关闭上方开关后将停止记录。',
                  en: 'No local stats yet. Visitor data is never uploaded; turn the switch above off to stop recording.',
                })}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ConfirmButton
                size="sm"
                confirmLabel={t({ zh: '确认清除统计？', en: 'Click again to clear stats' })}
                onConfirm={() => {
                  clearAnalytics();
                  setSummary(getAnalyticsSummary());
                  toast.success(t({ zh: '已清除本地统计', en: 'Local stats cleared' }));
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '清除统计', en: 'Clear stats' })}
              </ConfirmButton>
              <span className="text-[11px] text-ink-3">
                {t({ zh: '最近记录：', en: 'Last recorded: ' })}
                {summary?.lastUsedAt
                  ? new Date(summary.lastUsedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en', {
                      hour12: locale === 'en',
                    })
                  : '—'}
              </span>
            </div>
          </div>
        </section>

        <section>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '本地数据', en: 'Local Data' })}
          </h3>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/40 p-3.5">
            <ConfirmButton
              variant="secondary"
              size="sm"
              confirmLabel={t({ zh: '再次点击确认清除', en: 'Click again to confirm' })}
              onConfirm={clearAllLocalData}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t({ zh: '清除所有本地数据', en: 'Clear all local data' })}
            </ConfirmButton>
            <p className="text-[11px] leading-5 text-ink-3">
              {t({
                zh: '包括收藏、最近使用、搜索历史、Markdown 草稿、工具草稿与统计，保留主题与开关设置。',
                en: 'Includes favorites, recent tools, search history, Markdown and tool drafts, and stats. Theme and switch settings are kept.',
              })}
            </p>
          </div>
        </section>

        <section>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '帮助与关于', en: 'Help & About' })}
          </h3>
          <div className="mt-2.5 space-y-2">
            <SettingsRow
              title={t({ zh: '键盘快捷键', en: 'Keyboard shortcuts' })}
              description={t({
                zh: '搜索、执行与 Markdown 编辑快捷键。',
                en: 'Shortcuts for search, running tools, and Markdown editing.',
              })}
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onClose();
                  onShowShortcuts();
                }}
              >
                <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '查看快捷键', en: 'View shortcuts' })}
              </Button>
            </SettingsRow>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/40 px-3.5 py-3">
              <div className="text-xs leading-5 text-ink-3">
                <p className="text-sm font-medium text-ink">
                  DevToolbox <span className="ml-1 font-mono text-xs text-ink-3">v{APP_VERSION}</span>
                </p>
                <p className="mt-0.5">
                  {buildDate
                    ? t({ zh: `构建于 ${buildDate} · `, en: `Built ${buildDate} · ` })
                    : ''}
                  {t({ zh: '纯前端本地处理', en: 'fully local, front-end only' })}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <Link
                  to="/about"
                  onClick={onClose}
                  className="font-medium text-accent-strong hover:underline"
                >
                  {t({ zh: '关于', en: 'About' })}
                </Link>
                <Link
                  to="/privacy"
                  onClick={onClose}
                  className="font-medium text-accent-strong hover:underline"
                >
                  {t({ zh: '隐私说明', en: 'Privacy' })}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <Button onClick={onClose}>{t({ zh: '完成', en: 'Done' })}</Button>
        </div>
      </div>
    </Modal>
  );
}
