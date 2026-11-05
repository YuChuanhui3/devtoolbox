import { Badge } from '@/components/ui/Badge';
import { Panel } from '@/components/ui/Panel';
import { CopyButton } from '@/components/tool/ToolActions';
import { JsonTree } from '@/components/tool/JsonTree';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import type { WbVia } from '@/lib/apiworkbench/types';

export interface ResponseView {
  status: number;
  ok: boolean;
  headers: [string, string][];
  text: string;
  bytes: number;
  ms: number;
  via: WbVia;
}

const VIA_LABEL: Record<WbVia, { zh: string; en: string }> = {
  direct: { zh: '直连', en: 'Direct' },
  corsproxy: { zh: 'CORS 代理', en: 'CORS proxy' },
  allorigins: { zh: 'allorigins', en: 'allorigins' },
  mock: { zh: 'Mock 命中', en: 'Mock hit' },
};

function statusTone(status: number): 'success' | 'warning' | 'danger' {
  if (status >= 200 && status < 300) return 'success';
  if (status >= 400) return 'danger';
  return 'warning';
}

export function ResponseViewer({ result, error, hint }: {
  result: ResponseView | null;
  error: Localized | null;
  hint?: Localized;
}) {
  const { t } = useI18n();
  if (error) return <ToolAlert tone="error" title={error} hint={hint} />;
  if (!result) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-xs text-ink-3">
        {t({ zh: '发送请求后在这里查看状态、耗时、响应头与响应体。', en: 'Send a request to see status, timing, headers, and body here.' })}
      </p>
    );
  }
  let parsed: unknown;
  let isJson = false;
  try {
    parsed = JSON.parse(result.text);
    isJson = typeof parsed === 'object' && parsed !== null;
  } catch {
    /* 非 JSON 走原文展示 */
  }
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {t({ zh: '响应', en: 'Response' })}
          <Badge tone={statusTone(result.status)}>{result.status}</Badge>
        </span>
      }
      actions={
        <span className="flex items-center gap-1.5">
          <Badge>{result.ms} ms</Badge>
          <Badge>{result.bytes} B</Badge>
          <Badge tone={result.via === 'mock' ? 'accent' : 'neutral'}>{t(VIA_LABEL[result.via])}</Badge>
        </span>
      }
    >
      {!result.ok ? (
        <ToolAlert tone="warning" title={t({ zh: `非 2xx 响应：HTTP ${result.status}`, en: `Non-2xx response: HTTP ${result.status}` })} className="mb-3" />
      ) : null}
      {result.headers.length > 0 ? (
        <details className="mb-3 overflow-hidden rounded-xl border border-line" open={false}>
          <summary className="cursor-pointer bg-surface-2/50 px-3 py-1.5 text-xs font-medium text-ink-2">
            {t({ zh: `响应头（${result.headers.length}）`, en: `Response headers (${result.headers.length})` })}
          </summary>
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
        </details>
      ) : (
        <p className="mb-3 text-xs text-ink-3">
          {t({
            zh: '跨域请求仅能读取 CORS 策略暴露的响应头；完整响应头请使用 allorigins 通道查看。',
            en: 'Cross-origin requests can only read headers exposed by CORS. For full headers, use the allorigins channel.',
          })}
        </p>
      )}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2">
          {t({ zh: '响应体', en: 'Response body' })}
          {isJson ? t({ zh: ' · JSON 树视图', en: ' · JSON tree' }) : ''}
        </span>
        <CopyButton text={result.text} label={{ zh: '复制响应体', en: 'Copy body' }} />
      </div>
      {isJson ? (
        <div className="max-h-[420px] overflow-auto rounded-xl bg-code-bg p-3">
          <JsonTree value={parsed} />
        </div>
      ) : (
        <pre className="max-h-[420px] overflow-auto rounded-xl bg-code-bg p-3 font-mono text-[12px] leading-5 text-ink">
          {result.text.slice(0, 20000) || t({ zh: '（空响应体）', en: '(empty body)' })}
          {result.text.length > 20000 ? t({ zh: '\n… 已截断，复制可获取完整内容', en: '\n… truncated; copy to get the full content' }) : ''}
        </pre>
      )}
    </Panel>
  );
}
