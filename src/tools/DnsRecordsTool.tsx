import { useCallback, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { CopyButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { dohTypeName, dnsResolve, type DnsAnswer } from '@/lib/net';

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'CAA', 'SRV', 'PTR'];

const STATUS_TEXT: Record<number, L10n> = {
  0: { zh: 'NOERROR · 查询成功', en: 'NOERROR · Query succeeded' },
  2: { zh: 'SERVFAIL · 服务器处理失败', en: 'SERVFAIL · Server failure' },
  3: { zh: 'NXDOMAIN · 域名不存在', en: 'NXDOMAIN · Domain does not exist' },
  5: { zh: 'REFUSED · 查询被拒绝', en: 'REFUSED · Query refused' },
};

export default function DnsRecordsTool() {
  const { t } = useI18n();
  const [domain, setDomain] = useState('example.com');
  const [type, setType] = useState('A');
  const [answers, setAnswers] = useState<DnsAnswer[]>([]);
  const [statusText, setStatusText] = useState<Localized | null>(null);
  const [error, setError] = useState<Localized | null>(null);
  const [loading, setLoading] = useState(false);

  const query = useCallback(async (name: string, recordType: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await dnsResolve(name, recordType);
      setAnswers(result.Answer ?? []);
      setStatusText(STATUS_TEXT[result.Status] ?? { zh: `状态码 ${result.Status}`, en: `Status code ${result.Status}` });
    } catch (caught) {
      setAnswers([]);
      setStatusText(null);
      setError(toToolError(caught).localized);
    } finally {
      setLoading(false);
    }
  }, []);

  const allText = answers
    .map((a) => `${a.name}\t${dohTypeName(a.type)}\t${a.TTL}\t${a.data}`)
    .join('\n');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={type}
          onChange={setType}
          ariaLabel={t({ zh: '记录类型', en: 'Record type' })}
          options={TYPES.map((item) => ({ value: item, label: item }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void query(domain, type);
            }}
            placeholder={t({ zh: '输入域名，如 example.com…', en: 'Enter a domain, e.g. example.com…' })}
            mono
            className="pl-9"
            aria-label={t({ zh: '域名', en: 'Domain' })}
          />
        </div>
        <Button variant="primary" onClick={() => void query(domain, type)} disabled={loading}>
          {loading ? t({ zh: '查询中…', en: 'Querying…' }) : t({ zh: '解析', en: 'Resolve' })}
        </Button>
      </div>

      {error ? <ToolAlert tone="error" title={error} hint={{ zh: 'Cloudflare DoH 服务暂时不可达，稍后重试。', en: 'Cloudflare DoH is temporarily unreachable. Try again later.' }} /> : null}

      <Panel
        title={t({ zh: `${domain || '—'} 的 ${type} 记录`, en: `${type} records for ${domain || '—'}` })}
        subtitle={statusText ? t({ zh: `${t(statusText)} · ${answers.length} 条应答 · Cloudflare DoH`, en: `${t(statusText)} · ${answers.length} answers · Cloudflare DoH` }) : undefined}
        actions={<CopyButton text={allText} label={{ zh: '复制全部', en: 'Copy all' }} />}
        bodyClassName="p-0"
      >
        {answers.length > 0 ? (
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-line text-ink-3">
                <th className="px-4 py-2 font-medium">{t({ zh: '名称', en: 'Name' })}</th>
                <th className="px-4 py-2 font-medium">{t({ zh: '类型', en: 'Type' })}</th>
                <th className="px-4 py-2 font-medium">TTL</th>
                <th className="px-4 py-2 font-medium">{t({ zh: '数据', en: 'Data' })}</th>
              </tr>
            </thead>
            <tbody>
              {answers.map((answer, index) => (
                <tr key={`${answer.name}-${index}`} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2.5 font-mono text-ink-2">{answer.name}</td>
                  <td className="px-4 py-2.5"><span className="rounded-lg bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{dohTypeName(answer.type)}</span></td>
                  <td className="px-4 py-2.5 font-mono text-ink-2">{answer.TTL}</td>
                  <td className="max-w-[420px] break-all px-4 py-2.5 font-mono text-ink">{answer.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex min-h-[160px] items-center justify-center text-xs text-ink-3">
            {loading ? t({ zh: '正在通过 Cloudflare DNS over HTTPS 解析…', en: 'Resolving via Cloudflare DNS over HTTPS…' }) : statusText ? t({ zh: '该类型暂无应答', en: 'No answers for this record type' }) : t({ zh: '输入域名后查看解析记录', en: 'Enter a domain to view its records' })}
          </div>
        )}
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '查询直连 Cloudflare DoH（cloudflare-dns.com），返回结果为权威应答，TTL 以秒计。', en: 'Queries go directly to Cloudflare DoH (cloudflare-dns.com). Results are authoritative answers; TTL is in seconds.' })}
      </p>
    </div>
  );
}
