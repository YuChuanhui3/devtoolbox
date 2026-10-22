import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { CopyIconButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { queryIpWho, type IpWhoResult } from './shared/ipInfoQuery';

function InfoRow({ label, value }: { label: L10n; value: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <span className="w-24 shrink-0 text-xs text-ink-3">{t(label)}</span>
      <span className="min-w-0 flex-1 break-all text-sm text-ink">{value || '—'}</span>
      {value ? <CopyIconButton text={value} label={{ zh: `复制${label.zh}`, en: `Copy ${label.en}` }} /> : null}
    </div>
  );
}

export default function IpInfoTool() {
  const { t } = useI18n();
  const [ipInput, setIpInput] = useState('');
  const [data, setData] = useState<IpWhoResult | null>(null);
  const [error, setError] = useState<Localized | null>(null);
  const [hint, setHint] = useState<Localized | undefined>();
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(async (ip: string) => {
    setLoading(true);
    setError(null);
    try {
      setData(await queryIpWho(ip));
    } catch (caught) {
      const err = toToolError(caught);
      setData(null);
      setError(err.localized);
      setHint(err.hint);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void lookup('');
  }, [lookup]);

  const rows = data
    ? ([
        [{ zh: 'IP 地址', en: 'IP address' } as L10n, data.ip ?? ''],
        [{ zh: '类型', en: 'Type' } as L10n, data.type ?? ''],
        [{ zh: '国家/地区', en: 'Country/Region' } as L10n, data.country ?? ''],
        [{ zh: '省份/区域', en: 'Province/Region' } as L10n, data.region ?? ''],
        [{ zh: '城市', en: 'City' } as L10n, data.city ?? ''],
        [{ zh: '经纬度', en: 'Coordinates' } as L10n, data.latitude !== undefined ? `${data.latitude}, ${data.longitude}` : ''],
        [{ zh: '邮政编码', en: 'Postal code' } as L10n, data.postal ?? ''],
        [{ zh: '时区', en: 'Timezone' } as L10n, [data.timezone?.id, data.timezone?.utc].filter(Boolean).join(' ')],
        [{ zh: '运营商', en: 'ISP' } as L10n, data.connection?.isp ?? data.connection?.org ?? ''],
        [{ zh: 'ASN', en: 'ASN' } as L10n, data.connection?.asn ? `AS${data.connection.asn}` : ''],
        [{ zh: '是否欧盟', en: 'EU member' } as L10n, data.is_eu === undefined ? '' : data.is_eu ? t({ zh: '是', en: 'Yes' }) : t({ zh: '否', en: 'No' })],
      ] as [L10n, string][])
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input
            value={ipInput}
            onChange={(e) => setIpInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void lookup(ipInput);
            }}
            placeholder={t({ zh: '输入 IPv4 / IPv6，留空查询本机出口 IP…', en: 'Enter an IPv4 / IPv6, or leave empty for your egress IP…' })}
            mono
            className="pl-9"
            aria-label={t({ zh: '要查询的 IP', en: 'IP to look up' })}
          />
        </div>
        <Button variant="primary" onClick={() => void lookup(ipInput)} disabled={loading}>
          {loading ? t({ zh: '查询中…', en: 'Querying…' }) : t({ zh: '查询', en: 'Lookup' })}
        </Button>
      </div>

      {error ? <ToolAlert tone="error" title={error} hint={hint} /> : null}

      <Panel title={t({ zh: 'IP 归属信息', en: 'IP geolocation' })} subtitle={t({ zh: '数据来自 ipwho.is（免费 GeoIP 服务）', en: 'Data from ipwho.is (free GeoIP service)' })} bodyClassName="p-0">
        {rows.length > 0 ? (
          rows.map(([label, value]) => <InfoRow key={label.en} label={label} value={value} />)
        ) : (
          <div className="flex min-h-[200px] items-center justify-center text-xs text-ink-3">
            {loading ? t({ zh: '正在查询…', en: 'Querying…' }) : t({ zh: '输入 IP 后查询归属地、运营商与时区', en: 'Enter an IP to see location, ISP, and timezone' })}
          </div>
        )}
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '定位结果基于 IP 地址库，精度通常为城市级，实际位置可能存在偏差。', en: 'Results come from an IP geolocation database. Accuracy is usually city-level and may deviate from the real location.' })}
      </p>
    </div>
  );
}
