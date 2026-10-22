import { useMemo, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ActionBar, CopyIconButton, SampleButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { formatBytes } from '@/lib/number';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'KiB', 'MiB', 'GiB', 'TiB'] as const;
type Unit = (typeof UNITS)[number];

const MULTIPLIERS: Record<Unit, number> = {
  B: 1,
  KB: 1000,
  MB: 1000 ** 2,
  GB: 1000 ** 3,
  TB: 1000 ** 4,
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
  TiB: 1024 ** 4,
};

interface ResultRow {
  label: Localized;
  value: string;
  detail: Localized;
}

export default function FileSizeTool() {
  const { t } = useI18n();
  const [amount, setAmount] = useState('1536');
  const [unit, setUnit] = useState<Unit>('MB');

  const analysis = useMemo(() => {
    const numeric = Number(amount.replace(/,/g, '').trim());
    if (!amount.trim()) return { error: '' as Localized, bytes: null as number | null, rows: [] as ResultRow[] };
    if (!Number.isFinite(numeric) || numeric < 0) {
      return { error: { zh: '请输入大于等于 0 的有效数字。', en: 'Enter a valid number greater than or equal to 0.' }, bytes: null, rows: [] as ResultRow[] };
    }

    const bytes = numeric * MULTIPLIERS[unit];

    const decimalRows = ['B', 'KB', 'MB', 'GB', 'TB'].map((item) => {
      const value = bytes / MULTIPLIERS[item as Unit];
      return {
        label: item,
        value: `${Number(value.toFixed(6))} ${item}`,
        detail: item === 'B' ? { zh: '字节', en: 'Bytes' } : { zh: '十进制单位', en: 'Decimal units' },
      };
    });

    const binaryRows = ['B', 'KiB', 'MiB', 'GiB', 'TiB'].map((item) => {
      const value = bytes / MULTIPLIERS[item as Unit];
      return {
        label: item,
        value: `${Number(value.toFixed(6))} ${item}`,
        detail: item === 'B' ? { zh: '字节', en: 'Bytes' } : { zh: '二进制单位', en: 'Binary units' },
      };
    });

    return {
      error: '' as Localized,
      bytes,
      rows: [
        { label: 'Bit', value: `${Number((bytes * 8).toFixed(3))} bit`, detail: { zh: '比特', en: 'Bits' } },
        { label: { zh: '字节', en: 'Bytes' }, value: `${Number(bytes.toFixed(3))} B`, detail: 'Bytes' },
        { label: { zh: '可读（二进制）', en: 'Readable (binary)' }, value: formatBytes(bytes, 2, 1024), detail: 'KiB / MiB / GiB' },
        { label: { zh: '可读（十进制）', en: 'Readable (decimal)' }, value: formatBytes(bytes, 2, 1000), detail: 'KB / MB / GB' },
        ...decimalRows,
        ...binaryRows.slice(1),
      ],
    };
  }, [amount, unit]);

  return (
    <div className="space-y-4">
      <ActionBar>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={t({ zh: '输入数值', en: 'Enter a value' })}
            aria-label={t({ zh: '文件大小数值', en: 'File size value' })}
            inputMode="decimal"
            className="w-40"
          />
          <Select
            value={unit}
            onChange={(event) => setUnit(event.target.value as Unit)}
            aria-label={t({ zh: '文件大小单位', en: 'File size unit' })}
            wrapperClassName="w-24"
          >
            {UNITS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </div>
        <div className="ml-auto">
          <SampleButton
            onClick={() => {
              setAmount('1536');
              setUnit('MB');
            }}
          />
        </div>
      </ActionBar>

      {analysis.error ? <ToolAlert tone="error" title={analysis.error} /> : null}

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Panel title={t({ zh: '换算说明', en: 'How conversion works' })} bodyClassName="space-y-3 p-4 text-sm leading-6 text-ink-2">
          <p className="flex items-start gap-2">
            <HardDrive className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              {t({
                zh: '十进制单位按 1000 进位（KB、MB、GB），二进制单位按 1024 进位（KiB、MiB、GiB）， 两者不能混用。',
                en: 'Decimal units step by 1000 (KB, MB, GB); binary units step by 1024 (KiB, MiB, GiB). Do not mix the two.',
              })}
            </span>
          </p>
          <div className="rounded-xl bg-surface-2 p-3 font-mono text-[11px] leading-6 text-ink-3">
            1 KiB = 1024 B
            <br />
            1 KB = 1000 B
            <br />
            1 MiB = 1.048576 MB
          </div>
          <p className="text-xs text-ink-3">
            {t({
              zh: '磁盘厂商标称容量通常使用十进制单位，操作系统显示通常使用二进制单位。',
              en: 'Disk vendors usually rate capacity in decimal units; operating systems usually display in binary units.',
            })}
          </p>
        </Panel>

        <Panel
          title={t({ zh: '换算结果', en: 'Results' })}
          subtitle={
            analysis.bytes !== null
              ? t({ zh: `${analysis.bytes} 字节`, en: `${analysis.bytes} bytes` })
              : t({ zh: '输入数值后实时换算', en: 'Live conversion once you enter a value' })
          }
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-line">
            {analysis.rows.length === 0 ? (
              <li className="flex min-h-[240px] items-center justify-center text-xs text-ink-3">
                {t({ zh: '输入数值后展示全部单位', en: 'All units appear once you enter a value' })}
              </li>
            ) : (
              analysis.rows.map((row, index) => (
                <li key={index} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-28 shrink-0">
                    <span className="block text-xs font-medium text-ink-2">{t(row.label)}</span>
                    <span className="text-[10px] text-ink-3">{t(row.detail)}</span>
                  </span>
                  <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink">
                    {row.value}
                  </code>
                  <CopyIconButton text={row.value} label={t({ zh: `复制 ${t(row.label)}`, en: `Copy ${t(row.label)}` })} />
                </li>
              ))
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
