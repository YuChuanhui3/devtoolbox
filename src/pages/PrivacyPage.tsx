import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, HardDrive, Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { useSeo } from '@/hooks/useSeo';
import { clearToolDrafts, countToolDrafts } from '@/lib/drafts';
import { clearAnalytics, getAnalyticsSummary } from '@/lib/analytics';

const DATA_ROWS: Array<{ name: L10n; key: string; storage: string; description: L10n }> = [
  {
    name: { zh: '收藏工具', en: 'Favorites' },
    key: 'favorites',
    storage: 'localStorage',
    description: {
      zh: '工具 ID 列表，用于首页与收藏页展示。',
      en: 'Tool ID list shown on the home and favorites pages.',
    },
  },
  {
    name: { zh: '最近使用', en: 'Recently used' },
    key: 'recent',
    storage: 'localStorage',
    description: {
      zh: '最近 20 条工具访问记录与时间。',
      en: 'The last 20 tool visits with timestamps.',
    },
  },
  {
    name: { zh: '搜索历史', en: 'Search history' },
    key: 'searchHistory',
    storage: 'localStorage',
    description: {
      zh: '最近 10 条搜索关键词。',
      en: 'Your last 10 search keywords.',
    },
  },
  {
    name: { zh: 'Markdown 草稿', en: 'Markdown draft' },
    key: 'markdownDraft',
    storage: 'localStorage',
    description: {
      zh: 'Markdown 编辑器的自动保存内容。',
      en: 'Auto-saved content of the Markdown editor.',
    },
  },
  {
    name: { zh: '工具草稿', en: 'Tool drafts' },
    key: 'devtoolbox-drafts',
    storage: 'localStorage',
    description: {
      zh: '各工具自动保存的输入，单条上限 200,000 字符；加密、摘要与 JWT 工具不保存。',
      en: 'Auto-saved tool inputs, capped at 200,000 characters each; encryption, hash and JWT tools are never saved.',
    },
  },
  {
    name: { zh: '本地统计', en: 'Local stats' },
    key: 'devtoolbox-analytics',
    storage: 'localStorage',
    description: {
      zh: '工具访问、执行、失败与搜索次数，仅匿名计数，不含任何输入内容。',
      en: 'Anonymous counts of visits, executions, failures and searches — never your input.',
    },
  },
  {
    name: { zh: '功能偏好', en: 'Preferences' },
    key: 'themeMode · locale · …',
    storage: 'localStorage',
    description: {
      zh: '主题、语言、草稿自动保存与本地统计开关。',
      en: 'Theme, language, draft auto-save and local stats toggles.',
    },
  },
];

export function PrivacyPage() {
  const { t } = useI18n();
  useSeo(
    { zh: '隐私说明', en: 'Privacy Notes' },
    {
      zh: '了解 DevToolbox 如何处理你的数据，以及如何清空本地记录。',
      en: 'How DevToolbox handles your data and how to clear local records.',
    },
  );

  const toast = useToast();
  const favorites = useAppStore((state) => state.favorites);
  const clearFavorites = useAppStore((state) => state.clearFavorites);
  const clearRecent = useAppStore((state) => state.clearRecent);
  const clearSearchHistory = useAppStore((state) => state.clearSearchHistory);
  const clearMarkdownDraft = useAppStore((state) => state.clearMarkdownDraft);
  const [draftCount, setDraftCount] = useState(() => countToolDrafts());
  const [analyticsSummary, setAnalyticsSummary] = useState(() => getAnalyticsSummary());

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-ok" aria-hidden="true" />
          <h1 className="text-2xl font-semibold tracking-[0.01em] text-ink">
            {t({ zh: '隐私说明', en: 'Privacy Notes' })}
          </h1>
          <Badge tone="success">{t({ zh: '本地优先', en: 'Local-first' })}</Badge>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-2">
          {t({
            zh: 'DevToolbox 的设计原则是「能在浏览器完成的，就不发送到服务器」。本页说明各类数据的处理方式、存储位置，以及你如何随时清空本地记录。',
            en: 'DevToolbox follows one rule: whatever can run in the browser never goes to a server. This page explains how each kind of data is handled, where it is stored, and how you can clear it anytime.',
          })}
        </p>
      </header>

      <section className="card-surface p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Lock className="h-5 w-5 text-accent" aria-hidden="true" />
          {t({ zh: '数据处理原则', en: 'How data is handled' })}
        </h2>
        <ol className="mt-3 space-y-2.5 text-sm leading-6 text-ink-2">
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-strong">
              1
            </span>
            {t({
              zh: '大部分工具在浏览器本地运行，文本、JSON、YAML、XML、CSV、图片等内容默认不会上传服务器。',
              en: 'Most tools run locally in the browser; text, JSON, YAML, XML, CSV, images and other content are never uploaded by default.',
            })}
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-strong">
              2
            </span>
            {t({
              zh: '收藏、最近使用、搜索历史、Markdown 草稿与工具草稿保存在本机 localStorage，不会同步到云端。加密、摘要与 JWT 工具不会自动保存输入。',
              en: 'Favorites, recent history, search history, the Markdown draft and tool drafts live in your local localStorage and never sync to the cloud. Encryption, hash and JWT tools do not auto-save input.',
            })}
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-strong">
              3
            </span>
            {t({
              zh: '当前版本不包含账号体系、广告与第三方统计脚本。本地统计仅记录工具访问、执行与失败次数，不包含输入内容、文件或搜索关键词，可随时在设置中关闭。',
              en: 'This version has no accounts, ads or third-party analytics scripts. Local stats only count visits, executions and failures — no input, files or search keywords — and can be turned off in Settings anytime.',
            })}
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-strong">
              4
            </span>
            {t({
              zh: '未来若增加 IP 查询等依赖服务端的功能，会在工具页明确提示数据将发送到服务端。',
              en: 'If future features need a server (e.g. IP lookup), the tool page will clearly state that data is sent out.',
            })}
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warn-soft text-[11px] font-semibold text-warn">
              5
            </span>
            {t({
              zh: '请勿在加密、JWT、AES 等工具中输入生产环境的敏感密钥。所有计算虽在本地进行，但仍应遵循最小暴露原则。',
              en: 'Do not enter production secrets into the encryption, JWT or AES tools. Even though everything computes locally, follow the principle of minimal exposure.',
            })}
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok-soft text-[11px] font-semibold text-ok">
              6
            </span>
            {t({
              zh: '你可以随时在下方清空收藏、最近使用、搜索历史、草稿与本地统计，或在右上角设置中一键清除。',
              en: 'You can clear favorites, recent history, search history, drafts and local stats below, or wipe everything in one click from the Settings panel.',
            })}
          </li>
        </ol>
      </section>

      <section className="card-surface overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Database className="h-5 w-5 text-accent" aria-hidden="true" />
            {t({ zh: '本地数据清单', en: 'Local data inventory' })}
          </h2>
          <p className="mt-1 text-xs text-ink-3">
            {t({
              zh: '以下数据仅存储在当前浏览器的 localStorage 中。',
              en: 'All of the data below is stored only in this browser’s localStorage.',
            })}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-3">
                <th className="px-5 py-2.5 font-medium">{t({ zh: '数据', en: 'Data' })}</th>
                <th className="px-5 py-2.5 font-medium">{t({ zh: '键名', en: 'Key' })}</th>
                <th className="px-5 py-2.5 font-medium">{t({ zh: '存储位置', en: 'Storage' })}</th>
                <th className="px-5 py-2.5 font-medium">{t({ zh: '说明', en: 'Description' })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {DATA_ROWS.map((row) => (
                <tr key={row.key} className="text-ink-2">
                  <td className="px-5 py-3 font-medium text-ink">{t(row.name)}</td>
                  <td className="px-5 py-3 font-mono text-[11px] text-ink-3">{t(row.key)}</td>
                  <td className="px-5 py-3 text-xs">{row.storage}</td>
                  <td className="px-5 py-3 text-xs leading-5 text-ink-3">{t(row.description)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-surface p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <HardDrive className="h-5 w-5 text-accent" aria-hidden="true" />
          {t({ zh: '管理本地数据', en: 'Manage local data' })}
        </h2>
        <p className="mt-1.5 text-sm text-ink-3">
          {t({
            zh: '清除操作立即生效且不可恢复。已保存在工具输入框中的内容不会被清空，但下次输入会重新生成草稿。',
            en: 'Clearing takes effect immediately and cannot be undone. Content still open in tool inputs is not removed, but new input will start fresh drafts.',
          })}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ConfirmButton
            confirmLabel={t({ zh: '确认清空收藏？', en: 'Click again to clear favorites' })}
            onConfirm={() => {
              clearFavorites();
              toast.success(t({ zh: '已清空收藏', en: 'Favorites cleared' }));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: `清空收藏（${favorites.length}）`, en: `Clear favorites (${favorites.length})` })}
          </ConfirmButton>
          <ConfirmButton
            confirmLabel={t({ zh: '确认清空最近使用？', en: 'Click again to clear recent history' })}
            onConfirm={() => {
              clearRecent();
              toast.success(t({ zh: '已清空最近使用', en: 'Recent history cleared' }));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '清空最近使用', en: 'Clear recent history' })}
          </ConfirmButton>
          <ConfirmButton
            confirmLabel={t({ zh: '确认清空搜索历史？', en: 'Click again to clear search history' })}
            onConfirm={() => {
              clearSearchHistory();
              toast.success(t({ zh: '已清空搜索历史', en: 'Search history cleared' }));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '清空搜索历史', en: 'Clear search history' })}
          </ConfirmButton>
          <ConfirmButton
            confirmLabel={t({ zh: '确认清空草稿？', en: 'Click again to clear the draft' })}
            onConfirm={() => {
              clearMarkdownDraft();
              toast.success(t({ zh: '已清空 Markdown 草稿', en: 'Markdown draft cleared' }));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '清空 Markdown 草稿', en: 'Clear Markdown draft' })}
          </ConfirmButton>
          <ConfirmButton
            confirmLabel={t({ zh: '确认清空所有工具草稿？', en: 'Click again to clear all tool drafts' })}
            onConfirm={() => {
              clearToolDrafts();
              setDraftCount(0);
              toast.success(t({ zh: '已清空工具草稿', en: 'Tool drafts cleared' }));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: `清空工具草稿（${draftCount}）`, en: `Clear tool drafts (${draftCount})` })}
          </ConfirmButton>
          <ConfirmButton
            confirmLabel={t({ zh: '确认清空本地统计？', en: 'Click again to clear local stats' })}
            onConfirm={() => {
              clearAnalytics();
              setAnalyticsSummary(getAnalyticsSummary());
              toast.success(t({ zh: '已清空本地统计', en: 'Local stats cleared' }));
            }}
            disabled={analyticsSummary.totalViews + analyticsSummary.totalExecutions === 0}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '清空本地统计', en: 'Clear local stats' })}
          </ConfirmButton>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface-2/60 p-5">
        <h2 className="text-lg font-semibold text-ink">{t({ zh: '安全提示', en: 'Security notes' })}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-3">
          {t({
            zh: '本站通过 HTTPS 部署时，页面与资源传输均经过加密。Markdown 预览使用 DOMPurify 过滤危险标签与事件属性，渲染结果不会执行脚本。图片处理通过 Canvas 在本地完成，文件不会离开浏览器。',
            en: 'When deployed over HTTPS, all pages and assets are encrypted in transit. Markdown preview is sanitized with DOMPurify — dangerous tags and event attributes are stripped, so rendered output never runs scripts. Image processing happens locally via Canvas; files never leave your browser.',
          })}
        </p>
        <p className="mt-3 text-sm text-ink-3">
          {t({
            zh: '如发现安全问题，请通过部署方提供的反馈渠道联系维护者。返回',
            en: 'Found a security issue? Contact the maintainer through the feedback channel provided by the deployment. Back to',
          })}
          <Link to="/tools" className="mx-1 text-accent-strong hover:underline">
            {t({ zh: '全部工具', en: 'All Tools' })}
          </Link>
          {t({ zh: '继续使用。', en: 'to keep working.' })}
        </p>
      </section>
    </div>
  );
}
