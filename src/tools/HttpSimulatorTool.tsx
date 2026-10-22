import { useState } from 'react';
import { Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { CopyButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { FETCH_MODES, proxyFetch, type FetchMode, type TimedResponse } from '@/lib/net';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

/** lib 中 FETCH_MODES 的中文标签与说明在此覆盖为双语，其余保持原样。 */
const MODE_LABEL: Partial<Record<FetchMode, L10n>> = {
  direct: { zh: '直连', en: 'Direct' },
};
const MODE_NOTE: Record<FetchMode, L10n> = {
  direct: { zh: '受目标站点 CORS 限制，仅部分站点可用', en: 'Limited by the target\'s CORS policy; works only on some sites' },
  corsproxy: { zh: '公共 CORS 代理，透传响应但可能有速率限制', en: 'Public CORS proxy; passes responses through but may be rate-limited' },
  allorigins: { zh: '公共抓取代理，可返回状态与内容', en: 'Public fetch proxy; returns status and content' },
};

interface HeaderRow {
  key: string;
  value: string;
}

export default function HttpSimulatorTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<FetchMode>('corsproxy');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('https://api.github.com/zen');
  const [headers, setHeaders] = useState<HeaderRow[]>([]);
  const [body, setBody] = useState('');
  const [result, setResult] = useState<TimedResponse | null>(null);
  const [error, setError] = useState<Localized | null>(null);
  const [hint, setHint] = useState<Localized | undefined>();
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const headerMap: Record<string, string> = {};
      for (const row of headers) {
        if (row.key.trim()) headerMap[row.key.trim()] = row.value;
      }
      setResult(
        await proxyFetch(url.trim(), {
          mode,
          method,
          headers: Object.keys(headerMap).length ? headerMap : undefined,
          body: body && method !== 'GET' && method !== 'HEAD' ? body : undefined,
        }),
      );
    } catch (caught) {
      const err = toToolError(caught);
      setError(err.localized);
      setHint(err.hint);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Segmented
        value={mode}
        onChange={setMode}
        ariaLabel={t({ zh: '请求通道', en: 'Request channel' })}
        options={FETCH_MODES.map((item) => ({ value: item.id, label: t(MODE_LABEL[item.id] ?? item.label) }))}
      />
      <p className="px-1 text-[11px] text-ink-3">{t(MODE_NOTE[mode])}</p>

      <Panel title={t({ zh: '请求', en: 'Request' })} bodyClassName="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            aria-label={t({ zh: '请求方法', en: 'Request method' })}
            className="h-9 w-28"
            wrapperClassName="w-28 shrink-0"
          >
            {METHODS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </Select>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send();
            }}
            placeholder="https://…"
            mono
            className="h-9 min-w-64 flex-1 text-xs"
            aria-label={t({ zh: '请求 URL', en: 'Request URL' })}
          />
          <Button variant="primary" onClick={() => void send()} disabled={loading}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            {loading ? t({ zh: '请求中…', en: 'Requesting…' }) : t({ zh: '发送', en: 'Send' })}
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-2">{t({ zh: '请求头', en: 'Request headers' })}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHeaders((c) => [...c, { key: '', value: '' }])}
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              {t({ zh: '添加', en: 'Add' })}
            </Button>
          </div>
          {headers.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={row.key}
                onChange={(e) => setHeaders((c) => c.map((h, i) => (i === index ? { ...h, key: e.target.value } : h)))}
                placeholder="Name"
                mono
                className="h-8 w-44 text-xs"
                aria-label={t({ zh: `请求头名称 ${index + 1}`, en: `Header name ${index + 1}` })}
              />
              <Input
                value={row.value}
                onChange={(e) => setHeaders((c) => c.map((h, i) => (i === index ? { ...h, value: e.target.value } : h)))}
                placeholder="value"
                mono
                className="h-8 flex-1 text-xs"
                aria-label={t({ zh: `请求头值 ${index + 1}`, en: `Header value ${index + 1}` })}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHeaders((c) => c.filter((_, i) => i !== index))}
                aria-label={t({ zh: '删除请求头', en: 'Remove header' })}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>

        {method !== 'GET' && method !== 'HEAD' ? (
          <label className="block text-xs text-ink-3">
            {t({ zh: '请求体（代理模式下仅支持 GET，直连模式受 CORS 限制）', en: 'Request body (proxy mode supports GET only; direct mode is limited by CORS)' })}
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              mono
              className="mt-1.5 text-xs"
              placeholder='{"key": "value"}'
            />
          </label>
        ) : null}
      </Panel>

      {error ? <ToolAlert tone="error" title={error} hint={hint} /> : null}

      {result ? (
        <Panel
          title={t({ zh: '响应', en: 'Response' })}
          subtitle={t({ zh: `状态 ${result.status} · 耗时 ${result.ms} ms · 大小 ${result.bytes} B`, en: `Status ${result.status} · ${result.ms} ms · ${result.bytes} B` })}
        >
          {!result.ok ? (
            <ToolAlert tone="warning" title={t({ zh: `非 2xx 响应：HTTP ${result.status}`, en: `Non-2xx response: HTTP ${result.status}` })} className="mb-3" />
          ) : null}
          {result.headers.length > 0 ? (
            <div className="mb-3 overflow-hidden rounded-xl border border-line">
              <table className="w-full text-left text-[12px]">
                <tbody>
                  {result.headers.map(([key, value]) => (
                    <tr key={key} className="border-b border-line last:border-b-0">
                      <td className="w-44 shrink-0 bg-surface-2/50 px-3 py-1.5 font-mono text-ink-3">{key}</td>
                      <td className="break-all px-3 py-1.5 font-mono text-ink">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mb-3 text-xs text-ink-3">
              {t({ zh: '跨域请求仅能读取 CORS 策略暴露的响应头；完整响应头请使用 allorigins 状态接口查看。', en: 'Cross-origin requests can only read headers exposed by CORS. For full headers, use the allorigins status endpoint.' })}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-2">{t({ zh: '响应体', en: 'Response body' })}</span>
            <CopyButton text={result.text} label={{ zh: '复制响应体', en: 'Copy body' }} />
          </div>
          <pre className="mt-2 max-h-[420px] overflow-auto rounded-xl bg-code-bg p-3 font-mono text-[12px] leading-5 text-ink">
            {result.text.slice(0, 20000) || t({ zh: '（空响应体）', en: '(empty body)' })}
            {result.text.length > 20000 ? t({ zh: '\n… 已截断，复制可获取完整内容', en: '\n… truncated; copy to get the full content' }) : ''}
          </pre>
        </Panel>
      ) : null}

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '浏览器发起的真实请求会自动附带 Cookie 之外的标准头；代理模式用于跨域调试，请勿高频调用公共代理。', en: 'Real browser requests automatically include standard headers other than cookies. Proxy mode is for cross-origin debugging — don\'t hammer public proxies.' })}
      </p>
    </div>
  );
}
