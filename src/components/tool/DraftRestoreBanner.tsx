import { useState } from 'react';
import { History, Trash2, X } from 'lucide-react';
import { useToolContext } from './ToolContext';
import { useI18n } from '@/i18n/I18nProvider';
import type { Locale } from '@/i18n/locale';
import { IconButton } from '@/components/ui/IconButton';

function formatSavedAt(timestamp: number, locale: Locale): string {
  return new Date(timestamp).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: locale === 'en',
  });
}

export function DraftRestoreBanner() {
  const context = useToolContext();
  const { t, locale } = useI18n();
  const [dismissed, setDismissed] = useState(false);

  if (!context || !context.draftEnabled || !context.initialInput || dismissed) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl border border-accent/20 bg-accent-soft/60 px-3.5 py-2.5 text-xs text-ink-2"
    >
      <History className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {context.draftUpdatedAt
          ? t({
              zh: `已恢复上次未完成的输入（保存于 ${formatSavedAt(context.draftUpdatedAt, locale)}），草稿仅保存在本机。`,
              en: `Restored your last unfinished input (saved ${formatSavedAt(context.draftUpdatedAt, locale)}). Drafts are stored on this device only.`,
            })
          : t({
              zh: '已恢复上次未完成的输入，草稿仅保存在本机。',
              en: 'Restored your last unfinished input. Drafts are stored on this device only.',
            })}
      </span>
      <button
        type="button"
        onClick={() => {
          context.discardDraft();
          setDismissed(true);
        }}
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium text-danger transition-colors hover:bg-danger-soft"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        {t({ zh: '清除草稿', en: 'Discard draft' })}
      </button>
      <IconButton
        label={t({ zh: '隐藏草稿提示', en: 'Hide draft notice' })}
        size="sm"
        className="h-6 w-6"
        onClick={() => setDismissed(true)}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </IconButton>
    </div>
  );
}
