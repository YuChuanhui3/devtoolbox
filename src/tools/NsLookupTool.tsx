import { useCallback, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { CopyIconButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { fetchJson, dnsResolve, type DnsAnswer } from '@/lib/net';
import { toToolError } from '@/lib/errors';

interface RdapEntity {
  handle?: string;
  roles?: string[];
  vcardArray?: [string, [string, unknown, unknown, string][]];
}

interface RdapDomain {
  ldhName?: string;
  status?: string[];
  events?: { action: string; eventAction?: string[]; date?: string }[];
  entities?: RdapEntity[];
  nameservers?: { ldhName?: string }[];
  secureDNS?: { delegationSigner?: unknown };
}

function findVcard(rdap: RdapDomain, role: string): string {
  const entity = rdap.entities?.find((e) => e.roles?.includes(role));
  const tel = entity?.vcardArray?.[1]?.find(([name]) => name === 'fn');
  return typeof tel?.[3] === 'string' ? tel[3] : entity?.handle ?? '';
}

export default function NsLookupTool() {
  const { t } = useI18n();
  const [domain, setDomain] = useState('example.com');
  const [ns, setNs] = useState<DnsAnswer[]>([]);
  const [soa, setSoa] = useState<DnsAnswer[]>([]);
  const [rdap, setRdap] = useState<RdapDomain | null>(null);
  const [error, setError] = useState<Localized | null>(null);
  const [rdapWarning, setRdapWarning] = useState<Localized | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(async (name: string) => {
    const trimmed = name.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setRdapWarning(null);
    try {
      const [nsResult, soaResult] = await Promise.all([dnsResolve(trimmed, 'NS'), dnsResolve(trimmed, 'SOA')]);
      setNs(nsResult.Answer ?? []);
      setSoa(soaResult.Answer ?? []);
      try {
        setRdap(await fetchJson<RdapDomain>(`https://rdap.org/domain/${encodeURIComponent(trimmed)}`, undefined, 10000));
      } catch {
        setRdap(null);
        setRdapWarning({ zh: 'RDAP 注册信息暂不可用（部分 .cn 等后缀不支持公开 RDAP）。', en: 'RDAP registration data is unavailable (some TLDs such as .cn do not support public RDAP).' });
      }
    } catch (caught) {
      setNs([]);
      setSoa([]);
      setRdap(null);
      setError(toToolError(caught).localized);
    } finally {
      setLoading(false);
    }
  }, []);

  const registrar = rdap ? findVcard(rdap, 'registrar') : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void lookup(domain);
            }}
            placeholder={t({ zh: '输入域名…', en: 'Enter a domain…' })}
            mono
            className="pl-9"
            aria-label={t({ zh: '域名', en: 'Domain' })}
          />
        </div>
        <Button variant="primary" onClick={() => void lookup(domain)} disabled={loading}>
          {loading ? t({ zh: '查询中…', en: 'Querying…' }) : t({ zh: '查询', en: 'Lookup' })}
        </Button>
      </div>

      {error ? <ToolAlert tone="error" title={error} /> : null}
      {rdapWarning ? <ToolAlert tone="info" title={rdapWarning} /> : null}

      <Panel title={t({ zh: `域名服务器（NS）${domain ? ` · ${domain}` : ''}`, en: `Name servers (NS)${domain ? ` · ${domain}` : ''}` })} bodyClassName="p-0">
        {ns.length > 0 ? (
          ns.map((answer, index) => (
            <div key={index} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
              <span className="w-10 shrink-0 font-mono text-[11px] text-ink-3">NS{index + 1}</span>
              <code className="min-w-0 flex-1 break-all font-mono text-sm text-ink">{answer.data}</code>
              <CopyIconButton text={answer.data} label={{ zh: '复制服务器', en: 'Copy server' }} />
            </div>
          ))
        ) : (
          <div className="flex min-h-[120px] items-center justify-center text-xs text-ink-3">
            {loading ? t({ zh: '解析中…', en: 'Resolving…' }) : t({ zh: '查询后显示权威 DNS 服务器', en: 'Authoritative DNS servers appear after lookup' })}
          </div>
        )}
      </Panel>

      {rdap ? (
        <Panel title={t({ zh: '注册信息（RDAP）', en: 'Registration (RDAP)' })} subtitle={t({ zh: '来自 rdap.org 引导的注册局公开数据', en: 'Public registry data bootstrapped via rdap.org' })} bodyClassName="p-0">
          {[
            [t({ zh: '注册状态', en: 'Status' }), (rdap.status ?? []).join(', ')],
            [t({ zh: '注册商', en: 'Registrar' }), registrar],
            ...((rdap.events ?? []).map(
              (event) => [event.eventAction?.[0] ?? event.action, event.date ? event.date.slice(0, 10) : ''] as [string, string],
            )),
          ]
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                <span className="w-28 shrink-0 text-xs text-ink-3">{label}</span>
                <span className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink">{value}</span>
              </div>
            ))}
        </Panel>
      ) : null}

      <Panel title={t({ zh: 'SOA 记录', en: 'SOA record' })} bodyClassName="p-0">
        {soa.map((answer, index) => (
          <div key={index} className="flex items-start gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
            <span className="w-10 shrink-0 font-mono text-[11px] text-ink-3">SOA</span>
            <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-5 text-ink-2">{answer.data}</code>
          </div>
        ))}
        {soa.length === 0 && !loading ? (
          <div className="flex min-h-[80px] items-center justify-center text-xs text-ink-3">{t({ zh: '暂无 SOA 应答', en: 'No SOA answer' })}</div>
        ) : null}
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: 'NS 记录通过 Cloudflare DoH 查询；RDAP 为 WHOIS 的现代替代协议，数据覆盖取决于对应注册局。', en: 'NS records come from Cloudflare DoH; RDAP is the modern WHOIS replacement, and coverage depends on the registry.' })}
      </p>
    </div>
  );
}
