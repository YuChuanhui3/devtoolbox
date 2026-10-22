import { useEffect, useMemo, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Segmented';
import { CopyIconButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';

type Detect = 'auto' | 'sec' | 'ms';
type Zone = 'local' | 'utc';

const pad = (value: number) => String(value).padStart(2, '0');

function formatLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toDatetimeLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function ValueRow({ label, value }: { label: Localized; value: string }) {
  const { t } = useI18n();
  const labelZh = t(label);
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <span className="w-24 shrink-0 text-xs text-ink-3">{labelZh}</span>
      <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-5 text-ink">{value || '-'}</code>
      <CopyIconButton text={value} label={t({ zh: `复制${labelZh}`, en: `Copy ${labelZh}` })} />
    </div>
  );
}

export default function TimestampTool() {
  const { t } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const [timestampInput, setTimestampInput] = useState('');
  const [detect, setDetect] = useState<Detect>('auto');
  const [dateInput, setDateInput] = useState(() => toDatetimeLocal(new Date()));
  const [zone, setZone] = useState<Zone>('local');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const current = useMemo(() => {
    const nowMs = now.getTime();
    return {
      sec: String(Math.floor(nowMs / 1000)),
      ms: String(nowMs),
      local: formatLocal(now),
      iso: now.toISOString(),
      utc: now.toUTCString(),
    };
  }, [now]);

  const timestampResult = useMemo(() => {
    const raw = timestampInput.trim();
    if (!raw) return { date: null as Date | null, mode: null as 'sec' | 'ms' | null, error: '' };

    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      return { date: null, mode: null, error: { zh: '时间戳必须是数字，例如 1799999999 或 1799999999000。', en: 'The timestamp must be a number, e.g. 1799999999 or 1799999999000.' } };
    }

    const mode: 'sec' | 'ms' =
      detect === 'auto' ? (Math.abs(Math.trunc(numeric)).toString().length >= 12 ? 'ms' : 'sec') : detect;
    const ms = mode === 'ms' ? numeric : numeric * 1000;
    const date = new Date(ms);

    if (Number.isNaN(date.getTime())) {
      return { date: null, mode, error: { zh: '时间戳超出可解析范围。', en: 'The timestamp is outside the parsable range.' } };
    }

    return { date, mode, error: '' };
  }, [timestampInput, detect]);

  const dateResult = useMemo(() => {
    if (!dateInput) return { date: null as Date | null, error: '' };
    const value = zone === 'utc' ? `${dateInput}Z` : dateInput;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return { date: null, error: { zh: '日期格式不正确，请重新选择。', en: 'Invalid date format. Pick again.' } };
    }
    return { date, error: '' };
  }, [dateInput, zone]);

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: '当前时间', en: 'Current time' })}
        subtitle={t({ zh: '每秒自动刷新', en: 'Refreshes every second' })}
        actions={
          <button
            type="button"
            onClick={() => setNow(new Date())}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            {t({ zh: '刷新', en: 'Refresh' })}
          </button>
        }
        bodyClassName="p-0"
      >
        <div className="divide-y divide-line">
          <ValueRow label={t({ zh: '秒级时间戳', en: 'Unix seconds' })} value={current.sec} />
          <ValueRow label={t({ zh: '毫秒时间戳', en: 'Milliseconds' })} value={current.ms} />
          <ValueRow label={t({ zh: '本地时间', en: 'Local time' })} value={current.local} />
          <ValueRow label="ISO 8601" value={current.iso} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t({ zh: '时间戳转日期', en: 'Timestamp to date' })} bodyClassName="space-y-4 p-4">
          <div className="space-y-2">
            <label htmlFor="timestamp-input" className="text-xs text-ink-3">
              {t({ zh: '输入时间戳', en: 'Enter a timestamp' })}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="timestamp-input"
                value={timestampInput}
                onChange={(event) => setTimestampInput(event.target.value)}
                placeholder={t({ zh: '例如 1799999999 或 1799999999000', en: 'e.g. 1799999999 or 1799999999000' })}
                mono
                className="min-w-0 flex-1"
              />
              <Segmented
                value={detect}
                onChange={setDetect}
                ariaLabel={t({ zh: '时间戳单位', en: 'Timestamp unit' })}
                options={[
                  { value: 'auto', label: t({ zh: '自动', en: 'Auto' }) },
                  { value: 'sec', label: t({ zh: '秒', en: 'Sec' }) },
                  { value: 'ms', label: t({ zh: '毫秒', en: 'Ms' }) },
                ]}
              />
            </div>
          </div>

          {timestampResult.error ? <ToolAlert tone="error" title={timestampResult.error} /> : null}

          {timestampResult.date ? (
            <div className="rounded-xl border border-line bg-surface-2/40">
              <ValueRow
                label={timestampResult.mode === 'ms' ? { zh: '识别为毫秒', en: 'Detected as ms' } : { zh: '识别为秒', en: 'Detected as sec' }}
                value={timestampResult.mode === 'ms' ? t({ zh: '毫秒级', en: 'Milliseconds' }) : t({ zh: '秒级', en: 'Seconds' })}
              />
              <ValueRow label={t({ zh: '本地时间', en: 'Local time' })} value={formatLocal(timestampResult.date)} />
              <ValueRow label="ISO 8601" value={timestampResult.date.toISOString()} />
              <ValueRow label="UTC" value={timestampResult.date.toUTCString()} />
            </div>
          ) : (
            <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-line-strong text-xs text-ink-3">
              {t({ zh: '输入时间戳后显示对应日期', en: 'Enter a timestamp to see the matching date' })}
            </div>
          )}
        </Panel>

        <Panel title={t({ zh: '日期转时间戳', en: 'Date to timestamp' })} bodyClassName="space-y-4 p-4">
          <div className="space-y-2">
            <label htmlFor="date-input" className="text-xs text-ink-3">
              {t({ zh: '选择日期时间', en: 'Pick a date and time' })}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="date-input"
                type="datetime-local"
                step={1}
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink transition-colors focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
              />
              <Select
                value={zone}
                onChange={(event) => setZone(event.target.value as Zone)}
                aria-label={t({ zh: '时区', en: 'Time zone' })}
                className="h-10 text-xs"
                wrapperClassName="w-28"
              >
                <option value="local">{t({ zh: '本地时区', en: 'Local time zone' })}</option>
                <option value="utc">UTC</option>
              </Select>
            </div>
          </div>

          {dateResult.error ? <ToolAlert tone="error" title={dateResult.error} /> : null}

          {dateResult.date ? (
            <div className="rounded-xl border border-line bg-surface-2/40">
              <ValueRow label={t({ zh: '秒级时间戳', en: 'Unix seconds' })} value={String(Math.floor(dateResult.date.getTime() / 1000))} />
              <ValueRow label={t({ zh: '毫秒时间戳', en: 'Milliseconds' })} value={String(dateResult.date.getTime())} />
              <ValueRow label="ISO 8601" value={dateResult.date.toISOString()} />
            </div>
          ) : null}

          <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {(() => {
              const offset = new Date().getTimezoneOffset();
              const sign = offset <= 0 ? '+' : '-';
              const hours = Math.abs(offset / 60);
              return t({ zh: `当前时区偏移：UTC${sign}${hours} 小时`, en: `Current time zone offset: UTC${sign}${hours} hours` });
            })()}
          </p>
        </Panel>
      </div>

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: '自动识别规则：整数部分达到 12 位时按毫秒处理，否则按秒处理。时间戳转换全部在本地完成。',
          en: 'Auto detection: integer parts of 12 digits or more are treated as milliseconds, otherwise seconds. All conversion happens locally.',
        })}
      </p>
    </div>
  );
}
