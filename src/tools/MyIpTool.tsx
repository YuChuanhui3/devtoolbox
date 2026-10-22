import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { ActionBar, CopyIconButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { fetchJson } from '@/lib/net';

interface EchoResult {
  ip: string;
  error: Localized | null;
}

async function echo(url: string): Promise<EchoResult> {
  try {
    const data = await fetchJson<{ ip: string }>(url, undefined, 8000);
    return { ip: data.ip, error: null };
  } catch (caught) {
    return {
      ip: '',
      error: caught instanceof Error ? toToolError(caught).localized : { zh: '获取失败', en: 'Failed to fetch' },
    };
  }
}

function IpRow({ label, result, hint }: { label: string; result: EchoResult | null; hint: Localized }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <span className="w-16 shrink-0 text-xs text-ink-3">{label}</span>
      <code className="min-w-0 flex-1 break-all font-mono text-sm text-ink">
        {result ? result.ip || (result.error ? t(result.error) : '') : t({ zh: '查询中…', en: 'Querying…' })}
      </code>
      {result?.ip ? <CopyIconButton text={result.ip} label={{ zh: `复制${label}`, en: `Copy ${label}` }} /> : null}
      <span className="hidden w-40 shrink-0 text-right text-[11px] text-ink-3 sm:block">{t(hint)}</span>
    </div>
  );
}

export default function MyIpTool() {
  const { t } = useI18n();
  const [ipv4, setIpv4] = useState<EchoResult | null>(null);
  const [ipv6, setIpv6] = useState<EchoResult | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [v4, v6] = await Promise.all([
      echo('https://api.ipify.org?format=json'),
      echo('https://api6.ipify.org?format=json'),
    ]).finally(() => setLoading(false));
    setIpv4(v4);
    setIpv6(v6);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <ActionBar>
        <span className="px-1 text-xs text-ink-3">{t({ zh: '通过 api.ipify.org 回显你的出口地址', en: 'Echoes your egress address via api.ipify.org' })}</span>
        <div className="ml-auto">
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} aria-hidden="true" />
            {t({ zh: '重新获取', en: 'Refresh' })}
          </Button>
        </div>
      </ActionBar>

      {ipv4?.error && ipv6?.error ? (
        <ToolAlert
          tone="error"
          title={{ zh: '无法获取出口 IP', en: 'Unable to get your egress IP' }}
          hint={{ zh: '可能是网络受限或服务商暂时不可用，稍后重试。', en: 'The network may be restricted or the provider temporarily unavailable. Try again later.' }}
        />
      ) : null}

      <Panel title={t({ zh: '你的 IP 地址', en: 'Your IP addresses' })}>
        <div className="divide-y divide-line">
          <IpRow label="IPv4" result={ipv4} hint="api.ipify.org" />
          <IpRow
            label="IPv6"
            result={ipv6}
            hint={ipv6?.error ? { zh: '未检测到 IPv6 连接', en: 'No IPv6 connection detected' } : 'api6.ipify.org'}
          />
        </div>
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '显示的是当前网络的公网出口地址（NAT 后为路由器公网 IP），可能与本机内网地址不同。', en: 'Shown is the public egress address of the current network (behind NAT, the router’s public IP), which may differ from this device’s private address.' })}
      </p>
    </div>
  );
}
