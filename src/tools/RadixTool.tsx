import { useMemo, useState } from 'react';
import { Binary } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { ActionBar, ClearButton, CopyIconButton, SampleButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { convertRadix, type Radix, type RadixResult } from '@/lib/number';
import { toToolError } from '@/lib/errors';

const RADIXES: Radix[] = [2, 8, 10, 16];
const PREFIX: Record<Radix, string> = { 2: '0b', 8: '0o', 10: '', 16: '0x' };
const DEFAULT: RadixResult = { 2: '11111111', 8: '377', 10: '255', 16: 'ff' };
const RADIX_NAMES: Record<Radix, L10n> = {
  2: { zh: '二进制', en: 'Binary' },
  8: { zh: '八进制', en: 'Octal' },
  10: { zh: '十进制', en: 'Decimal' },
  16: { zh: '十六进制', en: 'Hex' },
};

export default function RadixTool() {
  const { t } = useI18n();
  const [values, setValues] = useState<RadixResult>(DEFAULT);
  const [error, setError] = useState<Localized | null>(null);
  const [showPrefix, setShowPrefix] = useState(false);

  const handleChange = (radix: Radix, raw: string) => {
    try {
      const result = convertRadix(raw, radix);
      if (!result) return;
      setValues(result);
      setError(null);
    } catch (caught) {
      setValues((current) => ({ ...current, [radix]: raw }));
      setError(toToolError(caught).localized);
    }
  };

  const bitLength = useMemo(() => {
    if (!values[10]) return 0;
    try {
      return BigInt(values[10]).toString(2).length;
    } catch {
      return 0;
    }
  }, [values]);

  return (
    <div className="space-y-4">
      <ActionBar>
        <span className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-3">
          <Binary className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '任意一栏输入，其余进制实时同步', en: 'Type in any field; the other bases sync live' })}
        </span>
        <Checkbox
          checked={showPrefix}
          onChange={setShowPrefix}
          label={t({ zh: '显示进制前缀', en: 'Show base prefixes' })}
          className="text-xs"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <SampleButton onClick={() => {
            setValues(DEFAULT);
            setError(null);
          }} />
          <ClearButton
            onClick={() => {
              setValues({ 2: '', 8: '', 10: '', 16: '' });
              setError(null);
            }}
          />
        </div>
      </ActionBar>

      {error ? <ToolAlert tone="error" title={error} /> : null}

      <Panel
        title={t({ zh: '进制转换', en: 'Base conversion' })}
        subtitle={t({ zh: `当前数值位宽：${bitLength} bit`, en: `Current value width: ${bitLength} bits` })}
        bodyClassName="grid gap-4 p-4 sm:grid-cols-2"
      >
        {RADIXES.map((radix) => {
          const displayed =
            showPrefix && values[radix] ? `${PREFIX[radix]}${values[radix]}` : values[radix];
          const radixName = t(RADIX_NAMES[radix]);

          return (
            <div key={radix} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={`radix-${radix}`} className="text-xs text-ink-3">
                  {radixName}
                  <span className="ml-1 font-mono text-[10px] text-ink-3">({radix})</span>
                </label>
                <CopyIconButton text={values[radix]} label={t({ zh: `复制${radixName}`, en: `Copy ${radixName}` })} />
              </div>
              <Input
                id={`radix-${radix}`}
                value={displayed}
                onChange={(event) => handleChange(radix, event.target.value)}
                placeholder={t({ zh: `输入${radixName}`, en: `Enter ${radixName.toLowerCase()}` })}
                mono
                spellCheck={false}
              />
            </div>
          );
        })}
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: '支持 BigInt 大数转换，输入 0b / 0o / 0x 前缀会自动识别。',
          en: 'BigInt conversions are supported; 0b / 0o / 0x prefixes are detected automatically.',
        })}
      </p>
    </div>
  );
}
