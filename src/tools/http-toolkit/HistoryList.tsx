import { useState } from 'react';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { useI18n } from '@/i18n/I18nProvider';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import type { WbHistoryEntry } from '@/lib/apiworkbench/types';

const METHOD_TONE: Record<string, 'success' | 'accent' | 'warning' | 'danger' | 'neutral'> = {
  GET: 'success',
  POST: 'accent',
  PUT: 'warning',
  PATCH: 'warning',
  DELETE: 'danger',
};

const VIA_LABEL: Record<WbHistoryEntry['via'], { zh: string; en: string }> = {
  mock: { zh: 'Mock', en: 'Mock' },
  corsproxy: { zh: 'CORS 代理', en: 'CORS proxy' },
  allorigins: { zh: '抓取代理', en: 'Fetch proxy' },
  direct: { zh: '直连', en: 'Direct' },
};

export function HistoryList({ history, onSelect, onClear }: {
  history: WbHistoryEntry[];
  onSelect: (entry: WbHistoryEntry) => void;
  onClear: () => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const time = (at: number) => new Date(at).toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', { hour12: false });

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2/40">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink"
        >
          {open
            ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: `历史（${history.length}）`, en: `History (${history.length})` })}
        </button>
        {open && history.length > 0 ? (
          <ConfirmButton
            size="sm"
            confirmLabel={{ zh: '确认清空？', en: 'Click again to clear' }}
            onConfirm={onClear}
            aria-label={t({ zh: '清空历史', en: 'Clear history' })}
          >
            {t({ zh: '清空', en: 'Clear' })}
          </ConfirmButton>
        ) : null}
      </div>
      {open ? (
        <div className="max-h-56 space-y-0.5 overflow-auto border-t border-line px-1.5 py-1.5">
          {history.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-ink-3">
              {t({ zh: '发送过的请求会记录在这里（最近 100 条，保存在本机）。', en: 'Sent requests land here (latest 100, stored locally).' })}
            </p>
          ) : null}
          {history.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect(entry)}
              className="block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-left transition-colors hover:border-accent/40"
            >
              <span className="flex items-center gap-1.5">
                <Badge
                  tone={METHOD_TONE[entry.request.method] ?? 'neutral'}
                  className="shrink-0 px-1 py-0 text-[10px] leading-4"
                >
                  {entry.request.method}
                </Badge>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">{entry.request.url}</span>
              </span>
              <span className="mt-1 flex items-center gap-2 text-[10px] text-ink-3">
                <span className={`font-mono ${entry.status >= 400 ? 'text-danger' : 'text-ok'}`}>{entry.status}</span>
                <span className="font-mono">{entry.ms}ms</span>
                {entry.via !== 'direct' ? <span>{t(VIA_LABEL[entry.via])}</span> : null}
                <span className="ml-auto font-mono">{time(entry.at)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <p className="px-3 pb-2 pt-0.5 text-[10px] text-ink-3">
        {t({ zh: '记录仅保存在本机 localStorage（含响应体前 4KB）。', en: `History stays in this browser's localStorage (first 4KB of each body). Key: ${WORKBENCH_STORAGE_KEY}` })}
      </p>
    </div>
  );
}
