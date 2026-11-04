import { useState } from 'react';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { useI18n } from '@/i18n/I18nProvider';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import type { WbHistoryEntry } from '@/lib/apiworkbench/types';

export function HistoryList({ history, onSelect, onClear }: {
  history: WbHistoryEntry[];
  onSelect: (entry: WbHistoryEntry) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

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
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[11px] text-ink-2 hover:bg-surface-2"
            >
              <span className={`w-11 shrink-0 font-mono ${entry.request.method === 'GET' ? 'text-ok' : 'text-accent'}`}>
                {entry.request.method}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono">{entry.request.url}</span>
              <span className={`shrink-0 font-mono ${entry.status >= 400 ? 'text-danger' : 'text-ok'}`}>{entry.status}</span>
              <span className="shrink-0 text-ink-3">{entry.ms}ms</span>
              {entry.via === 'mock' ? <span className="shrink-0 text-accent">M</span> : null}
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
