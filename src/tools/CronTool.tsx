import { useMemo, useState } from 'react';
import { CalendarClock, Clock } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ActionBar, CopyButton, CopyIconButton, SampleButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { formatDateTime, parseCron } from '@/lib/cron';
import { toToolError, type ToolError } from '@/lib/errors';
import { SAMPLE_CRON } from '@/data/samples';

const PRESETS: Array<{ label: L10n; value: string }> = [
  { label: { zh: '每 5 分钟', en: 'Every 5 minutes' }, value: '*/5 * * * *' },
  { label: { zh: '工作日 09:00', en: 'Weekdays 09:00' }, value: '0 9 * * 1-5' },
  { label: { zh: '每月 1 日 00:00', en: '1st of month 00:00' }, value: '0 0 1 * *' },
  { label: { zh: '每天 09:00（6 位）', en: 'Daily 09:00 (6-field)' }, value: '0 0 9 * * ?' },
  { label: { zh: '每周日 02:30', en: 'Sundays 02:30' }, value: '30 2 * * 0' },
];

export default function CronTool() {
  const { t } = useI18n();
  const [expression, setExpression] = useState(SAMPLE_CRON);
  const debounced = useDebouncedValue(expression, 200);

  const parsed = useMemo(() => {
    if (!debounced.trim()) return { data: null, error: null as ToolError | null };
    try {
      return { data: parseCron(debounced), error: null };
    } catch (caught) {
      return { data: null, error: toToolError(caught) };
    }
  }, [debounced]);

  const nextRunsText = parsed.data?.nextRuns.map((date) => formatDateTime(date)).join('\n') ?? '';

  return (
    <div className="space-y-4">
      <ActionBar>
        <div className="relative min-w-[220px] flex-1">
          <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            placeholder={t({ zh: 'Cron 表达式，例如 0 9 * * 1-5', en: 'Cron expression, e.g. 0 9 * * 1-5' })}
            aria-label={t({ zh: 'Cron 表达式', en: 'Cron expression' })}
            mono
            className="pl-9"
          />
        </div>
        <SampleButton onClick={() => setExpression(SAMPLE_CRON)} />
        <CopyButton text={expression} label={{ zh: '复制表达式', en: 'Copy expression' }} />
        <CopyButton text={nextRunsText} label={{ zh: '复制执行时间', en: 'Copy run times' }} />
      </ActionBar>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[11px] text-ink-3">{t({ zh: '常用示例', en: 'Common presets' })}</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => setExpression(preset.value)}
            className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent-strong"
          >
            {t(preset.label)}
          </button>
        ))}
      </div>

      {parsed.error ? <ToolAlert tone="error" title={parsed.error.localized} hint={parsed.error.hint} /> : null}

      {parsed.data ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <Panel title={t({ zh: '表达式含义', en: 'What it means' })} bodyClassName="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <CalendarClock className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-base font-semibold leading-7 text-ink">{parsed.data.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="accent">{t({ zh: `${parsed.data.fieldCount} 位表达式`, en: `${parsed.data.fieldCount}-field expression` })}</Badge>
                    <Badge tone="neutral">{parsed.data.hasSeconds ? t({ zh: '包含秒级', en: 'With seconds' }) : t({ zh: '不含秒级', en: 'No seconds' })}</Badge>
                    <Badge tone="neutral">{t({ zh: '按服务器本地时区计算', en: 'Computed in the local time zone' })}</Badge>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title={t({ zh: '字段解析', en: 'Field breakdown' })} bodyClassName="p-0">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-[11px] text-ink-3">
                    <th className="px-4 py-2 font-medium">{t({ zh: '字段', en: 'Field' })}</th>
                    <th className="px-4 py-2 font-medium">{t({ zh: '值', en: 'Value' })}</th>
                    <th className="px-4 py-2 font-medium">{t({ zh: '含义', en: 'Meaning' })}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {parsed.data.fields.map((field) => (
                    <tr key={field.label}>
                      <td className="px-4 py-2.5 text-xs text-ink-3">{field.label}</td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-accent-strong">{field.value}</td>
                      <td className="px-4 py-2.5 text-xs text-ink-2">{field.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>

          <Panel
            title={t({ zh: '未来 5 次执行时间', en: 'Next 5 run times' })}
            subtitle={t({ zh: '基于当前时间计算', en: 'Calculated from the current time' })}
            bodyClassName="p-0"
            actions={<CopyIconButton text={nextRunsText} label={{ zh: '复制执行时间', en: 'Copy run times' }} />}
          >
            <ul className="divide-y divide-line">
              {parsed.data.nextRuns.map((date, index) => (
                <li key={date.toISOString()} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-ink-3">
                    {index + 1}
                  </span>
                  <code className="font-mono text-[12px] text-ink">{formatDateTime(date)}</code>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({ zh: '支持 5 位（分 时 日 月 周）与 6 位（秒 分 时 日 月 周）表达式，', en: 'Supports 5-field (minute hour day month weekday) and 6-field (second minute hour day month weekday) expressions;' })}
        <code className="font-mono">?</code>{t({ zh: ' 会按 ', en: ' is treated as ' })}<code className="font-mono">*</code>{t({ zh: ' 处理。', en: '.' })}
      </p>
    </div>
  );
}
