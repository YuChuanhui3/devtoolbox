import { useMemo, useState } from 'react';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { CopyIconButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { ipToNumberString, numberStringToIp } from '@/lib/ip';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

function ValueRow({ label, value }: { label: L10n; value: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <span className="w-24 shrink-0 text-xs text-ink-3">{t(label)}</span>
      <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-ink">{value}</code>
      <CopyIconButton text={value} label={{ zh: `复制${label.zh}`, en: `Copy ${label.en}` }} />
    </div>
  );
}

export default function IpNumberTool() {
  const { t } = useI18n();
  const [family, setFamily] = useState<'4' | '6'>('4');
  const [ipInput, setIpInput] = useState('192.168.1.100');
  const [numInput, setNumInput] = useState('3232235876');

  const debouncedIp = useDebouncedValue(ipInput, 200);
  const debouncedNum = useDebouncedValue(numInput, 200);

  const ipResult = useMemo(() => {
    if (!debouncedIp.trim()) return null;
    try {
      return { data: ipToNumberString(debouncedIp), error: null as Localized | null };
    } catch (caught) {
      return { data: null, error: toToolError(caught).localized };
    }
  }, [debouncedIp]);

  const numResult = useMemo(() => {
    if (!debouncedNum.trim()) return null;
    try {
      return { data: numberStringToIp(debouncedNum, family === '4' ? 4 : 6), error: null as Localized | null };
    } catch (caught) {
      return { data: null, error: toToolError(caught).localized };
    }
  }, [debouncedNum, family]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Segmented
          value={family}
          onChange={setFamily}
          ariaLabel={t({ zh: '协议版本', en: 'Protocol version' })}
          options={[
            { value: '4', label: 'IPv4' },
            { value: '6', label: 'IPv6' },
          ]}
        />
        <span className="text-xs text-ink-3">{t({ zh: '切换版本后两侧同时生效', en: 'Switching versions applies to both sides' })}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t({ zh: 'IP → 数字', en: 'IP → Number' })} bodyClassName="space-y-2">
          <Input
            value={ipInput}
            onChange={(e) => setIpInput(e.target.value)}
            placeholder={family === '4' ? '192.168.1.100' : '2001:db8::1'}
            mono
            aria-label={t({ zh: 'IP 地址', en: 'IP address' })}
          />
          {ipResult?.error ? <ToolAlert tone="error" title={ipResult.error} /> : null}
        </Panel>

        <Panel title={t({ zh: '数字 → IP', en: 'Number → IP' })} bodyClassName="space-y-2">
          <Input
            value={numInput}
            onChange={(e) => setNumInput(e.target.value)}
            placeholder={family === '4' ? '3232235876' : '42540616884606557580160382452697563137'}
            mono
            aria-label={t({ zh: '十进制数字', en: 'Decimal number' })}
          />
          {numResult?.error ? <ToolAlert tone="error" title={numResult.error} /> : null}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t({ zh: '转换结果', en: 'Result' })} subtitle={t({ zh: 'IP → 数字', en: 'IP → Number' })} bodyClassName="p-0">
          {ipResult?.data ? (
            <>
              <ValueRow label={{ zh: '十进制', en: 'Decimal' }} value={ipResult.data.decimal} />
              <ValueRow label={{ zh: '十六进制', en: 'Hexadecimal' }} value={ipResult.data.hex} />
              <ValueRow label={{ zh: '版本', en: 'Version' }} value={`IPv${ipResult.data.family}`} />
            </>
          ) : (
            <div className="flex min-h-[120px] items-center justify-center text-xs text-ink-3">{t({ zh: '输入合法 IP 后显示', en: 'Enter a valid IP to see the result' })}</div>
          )}
        </Panel>

        <Panel title={t({ zh: '转换结果', en: 'Result' })} subtitle={t({ zh: '数字 → IP', en: 'Number → IP' })} bodyClassName="p-0">
          {numResult?.data ? (
            <ValueRow label={family === '4' ? { zh: 'IPv4 地址', en: 'IPv4 address' } : { zh: 'IPv6 地址', en: 'IPv6 address' }} value={numResult.data} />
          ) : (
            <div className="flex min-h-[120px] items-center justify-center text-xs text-ink-3">{t({ zh: '输入十进制整数后显示', en: 'Enter a decimal integer to see the result' })}</div>
          )}
        </Panel>
      </div>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: 'IPv4 为 32 位无符号整数（0 ~ 4294967295）；IPv6 使用 128 位 BigInt，支持超大十进制输入。', en: 'IPv4 is a 32-bit unsigned integer (0 ~ 4294967295); IPv6 uses a 128-bit BigInt, so very large decimal inputs are supported.' })}
      </p>
    </div>
  );
}
