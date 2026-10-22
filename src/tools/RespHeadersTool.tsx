import { useState } from 'react';
import { Rows3 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { CopyButton, CopyIconButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { allOriginsGet, proxyFetch } from '@/lib/net';

interface HeadResult {
  headers: [string, string][];
  status: number;
}

export default function RespHeadersTool() {
  const { t } = useI18n();
  const [url, setUrl] = useState('https://www.baidu.com');
  const [result, setResult] = useState<HeadResult | null>(null);
  const [meta, setMeta] = useState<{ http_code: number; content_type: string; response_time: number; content_length: number } | null>(null);
  const [error, setError] = useState<Localized | null>(null);
  const [hint, setHint] = useState<Localized | undefined>();
  const [loading, setLoading] = useState(false);

  const query = async () => {
    const target = url.trim();
    if (!target) return;
    const resolved = target.startsWith('http') ? target : `https://${target}`;
    setLoading(true);
    setError(null);
    setResult(null);
    setMeta(null);
    try {
      const [viaProxy, viaAllOrigins] = await Promise.allSettled([
        proxyFetch(resolved, { mode: 'corsproxy' }),
        allOriginsGet(resolved),
      ]);
      const ok =
        viaProxy.status === 'fulfilled'
          ? { headers: viaProxy.value.headers, status: viaProxy.value.status }
          : null;
      setResult(ok);
      if (viaAllOrigins.status === 'fulfilled') setMeta(viaAllOrigins.value.status);
      if (!ok && viaProxy.status === 'rejected') {
        const err = toToolError(viaProxy.reason);
        setError(err.localized);
        setHint(err.hint);
      }
    } finally {
      setLoading(false);
    }
  };

  const headerText = result ? result.headers.map(([k, v]) => `${k}: ${v}`).join('\n') : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void query();
          }}
          placeholder="https://www.example.com"
          mono
          className="h-9 min-w-64 flex-1 text-xs"
          aria-label={t({ zh: '目标网址', en: 'Target URL' })}
        />
        <Button variant="primary" onClick={() => void query()} disabled={loading}>
          <Rows3 className="h-3.5 w-3.5" aria-hidden="true" />
          {loading ? t({ zh: '查询中…', en: 'Querying…' }) : t({ zh: '查看头信息', en: 'Fetch headers' })}
        </Button>
      </div>

      <ToolAlert
        tone="info"
        title={t({ zh: '关于响应头可见范围', en: 'About response header visibility' })}
        hint={t({ zh: '公共代理会转发目标站点的响应头，但个别以安全头列表暴露的头（如 Set-Cookie）可能被浏览器或代理过滤，结果仅供参考。', en: 'Public proxies forward the target\'s response headers, but some headers exposed via security header lists (e.g. Set-Cookie) may be filtered by the browser or proxy. Results are indicative only.' })}
      />

      {error ? <ToolAlert tone="error" title={error} hint={hint} /> : null}

      {meta ? (
        <Panel title={t({ zh: '抓取概况', en: 'Fetch summary' })} subtitle={t({ zh: '来自 allorigins', en: 'From allorigins' })} bodyClassName="p-0">
          {([
            { label: { zh: 'HTTP 状态', en: 'HTTP status' }, value: String(meta.http_code) },
            { label: { zh: 'Content-Type', en: 'Content-Type' }, value: meta.content_type || t({ zh: '未知', en: 'Unknown' }) },
            { label: { zh: '代理耗时', en: 'Proxy latency' }, value: `${meta.response_time} ms` },
            { label: { zh: '内容长度', en: 'Content length' }, value: `${meta.content_length} B` },
          ] as { label: L10n; value: string }[]).map((item) => (
            <div key={item.label.en} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
              <span className="w-28 shrink-0 text-xs text-ink-3">{t(item.label)}</span>
              <span className="min-w-0 flex-1 break-all text-sm text-ink">{item.value}</span>
              <CopyIconButton text={item.value} label={{ zh: `复制${item.label.zh}`, en: `Copy ${item.label.en}` }} />
            </div>
          ))}
        </Panel>
      ) : null}

      {result ? (
        <Panel
          title={t({ zh: '响应头', en: 'Response headers' })}
          subtitle={t({ zh: `HTTP ${result.status} · ${result.headers.length} 个头`, en: `HTTP ${result.status} · ${result.headers.length} headers` })}
          actions={<CopyButton text={headerText} label={{ zh: '复制全部', en: 'Copy all' }} />}
          bodyClassName="p-0"
        >
          {result.headers.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-ink-3">{t({ zh: '代理未暴露任何可读响应头', en: 'The proxy exposed no readable response headers' })}</div>
          ) : (
            <table className="w-full text-left text-[12px]">
              <tbody>
                {result.headers.map(([key, value]) => (
                  <tr key={key} className="border-b border-line last:border-b-0">
                    <td className="w-52 shrink-0 bg-surface-2/50 px-3 py-2 font-mono text-ink-3">{key}</td>
                    <td className="break-all px-3 py-2 font-mono text-ink">
                      {value}
                      <CopyIconButton text={value} label={t({ zh: `复制 ${key}`, en: `Copy ${key}` })} className="ml-2" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      ) : null}

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '同时通过 corsproxy.io 与 allorigins.win 两个通道请求，任一通道成功即展示结果。', en: 'Requests go through both corsproxy.io and allorigins.win; results show if either channel succeeds.' })}
      </p>
    </div>
  );
}
