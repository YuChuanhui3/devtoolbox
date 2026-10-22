import { useMemo, useState } from 'react';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { ActionBar, CopyButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { toToolError } from '@/lib/errors';
import { calcSubnet, maskToPrefix, parseCidrInput, prefixToMask } from '@/lib/subnet';

const QUICK = ['192.168.1.100/24', '10.0.5.130/20', '172.16.88.9/22', '203.0.113.45/30'];

function FieldRow({ label, value }: { label: L10n; value: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <span className="w-28 shrink-0 text-xs text-ink-3">{t(label)}</span>
      <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-ink">{value}</code>
    </div>
  );
}

export default function SubnetMaskTool() {
  const { t } = useI18n();
  const [input, setInput] = useState('192.168.1.100/24');
  const [maskInput, setMaskInput] = useState('');
  const debounced = useDebouncedValue(input, 200);
  const debouncedMask = useDebouncedValue(maskInput, 200);

  const result = useMemo(() => {
    if (!debounced.trim()) return null;
    try {
      const { ip, prefix } = parseCidrInput(debounced, debouncedMask);
      return { info: calcSubnet(ip, prefix), error: null as Localized | null };
    } catch (caught) {
      return { info: null, error: toToolError(caught).localized };
    }
  }, [debounced, debouncedMask]);

  const maskOnly = useMemo(() => {
    if (!debouncedMask.trim()) return null;
    try {
      return { prefix: maskToPrefix(debouncedMask), error: null as Localized | null };
    } catch (caught) {
      return { prefix: -1, error: toToolError(caught).localized };
    }
  }, [debouncedMask]);

  const summaryText = result?.info
    ? t({
        zh: [
          `CIDR: ${result.info.cidr}`,
          `子网掩码: ${result.info.mask}`,
          `反掩码: ${result.info.wildcard}`,
          `网络地址: ${result.info.network}`,
          `广播地址: ${result.info.broadcast}`,
          `可用主机: ${result.info.firstHost} ~ ${result.info.lastHost}（${result.info.usableHosts} 个）`,
        ].join('\n'),
        en: [
          `CIDR: ${result.info.cidr}`,
          `Subnet mask: ${result.info.mask}`,
          `Wildcard mask: ${result.info.wildcard}`,
          `Network address: ${result.info.network}`,
          `Broadcast address: ${result.info.broadcast}`,
          `Usable hosts: ${result.info.firstHost} ~ ${result.info.lastHost} (${result.info.usableHosts})`,
        ].join('\n'),
      })
    : '';

  return (
    <div className="space-y-4">
      <ActionBar>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t({ zh: '192.168.1.100/24 或 192.168.1.100 + 掩码', en: '192.168.1.100/24 or 192.168.1.100 + mask' })}
          mono
          className="h-8 w-72 text-xs"
          aria-label={t({ zh: 'IP 与前缀', en: 'IP and prefix' })}
        />
        <Input
          value={maskInput}
          onChange={(e) => setMaskInput(e.target.value)}
          placeholder={t({ zh: '子网掩码（可选）', en: 'Subnet mask (optional)' })}
          mono
          className="h-8 w-40 text-xs"
          aria-label={t({ zh: '子网掩码', en: 'Subnet mask' })}
        />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <CopyButton text={summaryText} label={{ zh: '复制摘要', en: 'Copy summary' }} />
        </div>
      </ActionBar>

      <div className="flex flex-wrap items-center gap-1.5 px-1">
        <span className="text-xs text-ink-3">{t({ zh: '快速示例：', en: 'Quick examples:' })}</span>
        {QUICK.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setInput(item)}
            className="rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-ink-2 transition-colors hover:border-accent/40 hover:text-accent-strong"
          >
            {item}
          </button>
        ))}
      </div>

      {result?.error ? <ToolAlert tone="error" title={result.error} /> : null}
      {maskOnly?.error && maskInput.trim() ? <ToolAlert tone="error" title={maskOnly.error} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t({ zh: '掩码换算', en: 'Mask conversion' })} bodyClassName="p-0">
          {result?.info ? (
            <>
              <FieldRow label={{ zh: '前缀长度', en: 'Prefix length' }} value={`/${result.info.prefix}`} />
              <FieldRow label={{ zh: '子网掩码', en: 'Subnet mask' }} value={result.info.mask} />
              <FieldRow label={{ zh: '反掩码（通配符）', en: 'Wildcard mask' }} value={result.info.wildcard} />
              <FieldRow label={{ zh: '二进制掩码', en: 'Binary mask' }} value={prefixToMask(result.info.prefix).split('.').map((o) => Number(o).toString(2).padStart(8, '0')).join('.')} />
            </>
          ) : (
            <div className="flex min-h-[140px] items-center justify-center text-xs text-ink-3">{t({ zh: '输入 CIDR 或掩码后显示', en: 'Enter a CIDR or mask to see the result' })}</div>
          )}
          {maskOnly && maskOnly.prefix >= 0 && !result?.info ? (
            <FieldRow label={{ zh: '掩码对应前缀', en: 'Mask prefix' }} value={`/${maskOnly.prefix}`} />
          ) : null}
        </Panel>

        <Panel
          title={t({ zh: '子网信息', en: 'Subnet info' })}
          subtitle={result?.info
            ? t({
                zh: `地址类别 ${result.info.addressClass}${result.info.private ? ' · 私有地址' : ''}`,
                en: `Address class ${result.info.addressClass}${result.info.private ? ' · Private' : ''}`,
              })
            : undefined}
          bodyClassName="p-0"
        >
          {result?.info ? (
            <>
              <FieldRow label={{ zh: '网络地址', en: 'Network address' }} value={result.info.network} />
              <FieldRow label={{ zh: '广播地址', en: 'Broadcast address' }} value={result.info.broadcast} />
              <FieldRow label={{ zh: '首个可用主机', en: 'First usable host' }} value={result.info.firstHost} />
              <FieldRow label={{ zh: '末个可用主机', en: 'Last usable host' }} value={result.info.lastHost} />
              <FieldRow label={{ zh: '可用主机数', en: 'Usable hosts' }} value={String(result.info.usableHosts)} />
              <FieldRow label={{ zh: '地址总数', en: 'Total addresses' }} value={String(result.info.totalAddresses)} />
            </>
          ) : (
            <div className="flex min-h-[140px] items-center justify-center text-xs text-ink-3">
              {t({ zh: '支持 IP/前缀（192.168.1.100/24）或 IP + 掩码两栏输入', en: 'Supports IP/prefix (192.168.1.100/24) or IP + mask in two fields' })}
            </div>
          )}
        </Panel>
      </div>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '/31 与 /32 分别按 2 个与 1 个可用地址处理（RFC 3021 点对点链路）；计算全部在浏览器本地完成。', en: '/31 and /32 are treated as having 2 and 1 usable addresses respectively (RFC 3021 point-to-point links); all calculation runs locally in the browser.' })}
      </p>
    </div>
  );
}
