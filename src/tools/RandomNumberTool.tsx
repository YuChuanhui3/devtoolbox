import { useState } from 'react';
import { Dices } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { ActionBar, CopyButton, CopyIconButton, DownloadButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { randomIntInclusive } from '@/lib/number';

function randomFloat(min: number, max: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return min + (buffer[0] / 0x100000000) * (max - min);
}

export default function RandomNumberTool() {
  const { t } = useI18n();
  const [minInput, setMinInput] = useState('1');
  const [maxInput, setMaxInput] = useState('100');
  const [countInput, setCountInput] = useState('5');
  const [unique, setUnique] = useState(true);
  const [integer, setInteger] = useState(true);
  const [decimals, setDecimals] = useState('2');
  const [values, setValues] = useState<string[]>(['42', '7', '88', '13', '64']);
  const [error, setError] = useState<Localized | null>(null);

  const generate = () => {
    const min = Number(minInput);
    const max = Number(maxInput);
    const count = Math.floor(Number(countInput));

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      setError({ zh: '最小值与最大值必须是有效数字。', en: 'Min and max must be valid numbers.' });
      setValues([]);
      return;
    }
    if (min > max) {
      setError({ zh: '最小值不能大于最大值。', en: 'Min cannot be greater than max.' });
      setValues([]);
      return;
    }
    if (!Number.isFinite(count) || count < 1 || count > 100) {
      setError({ zh: '生成数量需在 1 - 100 之间。', en: 'The count must be between 1 and 100.' });
      setValues([]);
      return;
    }

    if (integer) {
      const low = Math.ceil(min);
      const high = Math.floor(max);
      if (low > high) {
        setError({ zh: '范围内没有整数可取。', en: 'No integers fall within the range.' });
        setValues([]);
        return;
      }
      const range = high - low + 1;
      if (unique && range < count) {
        setError(
          t({
            zh: `范围内只有 ${range} 个整数，无法生成 ${count} 个不重复数字。`,
            en: `Only ${range} integers in range; cannot generate ${count} unique values.`,
          }),
        );
        setValues([]);
        return;
      }

      setError(null);
      if (!unique) {
        setValues(Array.from({ length: count }, () => String(randomIntInclusive(low, high))));
        return;
      }

      const seen = new Set<number>();
      while (seen.size < count) {
        seen.add(randomIntInclusive(low, high));
      }
      setValues(Array.from(seen, (value) => String(value)));
      return;
    }

    setError(null);
    const precision = Math.min(6, Math.max(0, Number(decimals) || 0));
    setValues(
      Array.from({ length: count }, () => randomFloat(min, max).toFixed(precision)),
    );
  };

  const allText = values.join('\n');

  return (
    <div className="space-y-4">
      <ActionBar>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            {t({ zh: '最小', en: 'Min' })}
            <Input
              value={minInput}
              onChange={(event) => setMinInput(event.target.value)}
              aria-label={t({ zh: '最小值', en: 'Minimum' })}
              inputMode="decimal"
              className="h-8 w-20 text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            {t({ zh: '最大', en: 'Max' })}
            <Input
              value={maxInput}
              onChange={(event) => setMaxInput(event.target.value)}
              aria-label={t({ zh: '最大值', en: 'Maximum' })}
              inputMode="decimal"
              className="h-8 w-20 text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            {t({ zh: '数量', en: 'Count' })}
            <Input
              value={countInput}
              onChange={(event) => setCountInput(event.target.value)}
              aria-label={t({ zh: '生成数量', en: 'Number to generate' })}
              inputMode="numeric"
              className="h-8 w-16 text-xs"
            />
          </label>
          <Checkbox
            checked={integer}
            onChange={(value) => {
              setInteger(value);
              if (value) setUnique(true);
            }}
            label={t({ zh: '整数', en: 'Integer' })}
            className="text-xs"
          />
          {integer ? (
            <Checkbox checked={unique} onChange={setUnique} label={t({ zh: '不重复', en: 'Unique' })} className="text-xs" />
          ) : (
            <label className="flex items-center gap-1.5 text-xs text-ink-3">
              {t({ zh: '小数位', en: 'Decimals' })}
              <Select
                value={decimals}
                onChange={(event) => setDecimals(event.target.value)}
                aria-label={t({ zh: '小数位数', en: 'Decimal places' })}
                className="h-8 text-xs"
                wrapperClassName="w-16"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button variant="primary" size="sm" onClick={generate}>
            <Dices className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '生成', en: 'Generate' })}
          </Button>
          <CopyButton text={allText} label={{ zh: '复制全部', en: 'Copy all' }} />
          <DownloadButton filename="random-numbers.txt" content={allText} />
        </div>
      </ActionBar>

      {error ? <ToolAlert tone="error" title={error} /> : null}

      <Panel
        title={t({ zh: '生成结果', en: 'Results' })}
        subtitle={t({
          zh: `${values.length} 个数字 · 使用 Web Crypto 随机源`,
          en: `${values.length} values · Web Crypto random source`,
        })}
        bodyClassName="p-0"
      >
        {values.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center px-4 text-xs text-ink-3">
            {t({ zh: '设置范围后点击「生成」', en: 'Set a range, then click Generate' })}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {values.map((value, index) => (
              <li key={`${value}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-6 shrink-0 text-center font-mono text-[11px] text-ink-3">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <code className="min-w-0 flex-1 font-mono text-sm text-ink">{value}</code>
                <CopyIconButton
                  text={value}
                  label={t({ zh: `复制第 ${index + 1} 个数字`, en: `Copy value ${index + 1}` })}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: '整数使用拒绝采样保证均匀分布；小数使用 32 位随机源计算区间值。',
          en: 'Integers use rejection sampling for a uniform distribution; floats derive range values from a 32-bit random source.',
        })}
      </p>
    </div>
  );
}
