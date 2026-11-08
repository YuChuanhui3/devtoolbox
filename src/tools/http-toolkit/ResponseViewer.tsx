import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { CopyButton, DownloadButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { baseMime, responseViewKind, suggestFilename, type ResponseViewKind } from '@/lib/apiworkbench/response';
import type { StreamedEvent } from '@/lib/apiworkbench/send';
import type { WbVia } from '@/lib/apiworkbench/types';
import { BinaryBody, ChunkedText, DiffBody, EventList, HtmlPreview, ImageBody, JsonBody } from './ResponseViews';

export interface ResponseView {
  status: number;
  ok: boolean;
  headers: [string, string][];
  text: string;
  bytes: number;
  ms: number;
  via: WbVia;
  /** 直连拿到的图片/PDF 字节，只活在本页内存里。 */
  blob?: Blob | null;
  /** 流式响应解析出的帧；没有就是普通一次性响应。 */
  events?: StreamedEvent[];
  /** 被主动叫停的流：正文与帧是已收到的部分。 */
  aborted?: boolean;
  /** 事件流末尾那一帧没攒出 data，被按规范丢弃了。 */
  sseDiscarded?: boolean;
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

type ViewId = 'events' | 'pretty' | 'raw' | 'preview' | 'source' | 'image' | 'info' | 'diff';

/** 每种响应给几种看得下去的看法；顺序即默认顺序，第一个是打开时的视图。 */
function viewsFor(kind: ResponseViewKind, hasEvents: boolean, hasPrevious: boolean): ViewId[] {
  if (hasEvents) return ['events', 'raw'];
  if (kind === 'image') return ['image'];
  if (kind === 'pdf' || kind === 'binary') return ['info'];
  if (kind === 'html') return hasPrevious ? ['preview', 'source', 'diff'] : ['preview', 'source'];
  if (kind === 'json') return hasPrevious ? ['pretty', 'raw', 'diff'] : ['pretty', 'raw'];
  return hasPrevious ? ['raw', 'diff'] : ['raw'];
}

const VIEW_LABEL: Record<ViewId, Localized> = {
  events: { zh: '事件流', en: 'Events' },
  pretty: { zh: '美化', en: 'Pretty' },
  raw: { zh: '原文', en: 'Raw' },
  preview: { zh: '预览', en: 'Preview' },
  source: { zh: '源码', en: 'Source' },
  image: { zh: '图片', en: 'Image' },
  info: { zh: '信息', en: 'Details' },
  diff: { zh: '与上次差异', en: 'Diff' },
};

export function ResponseViewer({ result, error, hint, previous, requestUrl }: {
  result: ResponseView | null;
  error: Localized | null;
  hint?: Localized;
  /** 同一 URL 与方法的上一条响应（本次会话内存里），差异视图的左半边。 */
  previous?: { text: string; status: number; ms: number } | null;
  /** 下载按钮给文件起名用的请求 URL（响应头里的 content-disposition 优先）。 */
  requestUrl?: string;
}) {
  const { t } = useI18n();
  const [override, setOverride] = useState<ViewId | null>(null);
  // 换一次响应就回到该类型默认的那一栏，别把上次的选择带到新响应上。
  useEffect(() => setOverride(null), [result]);

  const kind = useMemo(() => (result ? responseViewKind(result.headers, result.text) : 'empty'), [result]);
  const hasEvents = Boolean(result?.events?.length);
  const options = result ? viewsFor(kind, hasEvents, Boolean(previous)) : [];
  const view = override && options.includes(override) ? override : options[0] ?? 'raw';

  if (error) return <ToolAlert tone="error" title={error} hint={hint} />;
  if (!result) {
    return (
      <section className="wb-response-empty" aria-label={t({ zh: '响应区域', en: 'Response area' })}>
        <div className="wb-shortcut-guide">
          <span>{t({ zh: '发送请求', en: 'Send Request' })}</span><kbd>⌘</kbd><kbd>↩</kbd>
          <span>{t({ zh: '快捷键', en: 'Keyboard shortcuts' })}</span><kbd>⌘</kbd><kbd>/</kbd>
          <span>{t({ zh: '搜索请求与集合', en: 'Search requests & collections' })}</span><kbd>⌘</kbd><kbd>K</kbd>
          <a href="https://docs.hoppscotch.io" target="_blank" rel="noreferrer">{t({ zh: '文档', en: 'Documentation' })} ↗</a>
        </div>
      </section>
    );
  }
  const mime = baseMime(result.headers);
  const filename = suggestFilename(result.headers, requestUrl ?? '');
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {t({ zh: '响应', en: 'Response' })}
          <Badge tone={statusTone(result.status)}>{result.status}</Badge>
          {result.aborted ? <Badge tone="warning">{t({ zh: '已中止', en: 'Stopped' })}</Badge> : null}
        </span>
      }
      actions={
        <span className="flex items-center gap-1.5">
          <Badge>{result.ms} ms</Badge>
          <Badge>{result.bytes} B</Badge>
          {result.headers.length ? <Badge>{t({ zh: `响应头 ${result.headers.length}`, en: `${result.headers.length} headers` })}</Badge> : null}
          <Badge tone={result.via === 'mock' ? 'accent' : 'neutral'}>{t(VIA_LABEL[result.via])}</Badge>
        </span>
      }
    >
      {!result.ok ? (
        <ToolAlert tone="warning" title={t({ zh: `非 2xx 响应：HTTP ${result.status}`, en: `Non-2xx response: HTTP ${result.status}` })} className="mb-3" />
      ) : null}
      {result.aborted ? (
        <ToolAlert
          tone="warning"
          title={t({ zh: '流已被叫停', en: 'The stream was stopped' })}
          hint={t({ zh: '下面是在中止之前已经收到的部分', en: 'What follows is everything received before the abort' })}
          className="mb-3"
        />
      ) : null}
      {result.headers.length === 0 ? (
        <ToolAlert
          tone="info"
          title={t({
            zh: '读不到响应头',
            en: 'No response headers are readable',
          })}
          hint={t({
            zh: '跨域请求只能读到 CORS 明确暴露的头；要完整头就换 allorigins 通道',
            en: 'Cross-origin requests expose only the headers CORS allows; switch to allorigins for the full set',
          })}
          className="mb-3"
        />
      ) : (
        <details className="mb-3 overflow-hidden rounded-xl border border-line">
          <summary className="cursor-pointer bg-surface-2/50 px-3 py-1.5 text-xs font-medium text-ink-2">
            {t({ zh: '响应头', en: 'Response headers' })}
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
      )}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {options.length > 1 ? (
          <Segmented
            size="sm"
            value={view}
            onChange={(next) => setOverride(next)}
            ariaLabel={t({ zh: '响应视图', en: 'Response view' })}
            options={options.map((id) => ({ value: id, label: t(VIEW_LABEL[id]) }))}
          />
        ) : (
          <span className="text-xs font-medium text-ink-2">{t(VIEW_LABEL[view])}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {result.blob ? (
            <DownloadButton
              filename={filename}
              blob={result.blob}
              mime={mime || 'application/octet-stream'}
              label={{ zh: '下载', en: 'Download' }}
            />
          ) : null}
          <CopyButton text={result.text} label={{ zh: '复制响应体', en: 'Copy body' }} />
        </span>
      </div>
      {view === 'events' ? (
        <EventList events={result.events ?? []} aborted={Boolean(result.aborted)} discarded={Boolean(result.sseDiscarded)} />
      ) : view === 'image' ? (
        <ImageBody blob={result.blob ?? null} bytes={result.bytes} mime={mime} />
      ) : view === 'info' ? (
        <BinaryBody blob={result.blob ?? null} bytes={result.bytes} mime={mime} filename={filename} />
      ) : view === 'preview' ? (
        <HtmlPreview html={result.text} />
      ) : view === 'diff' ? (
        <DiffBody left={previous?.text ?? ''} right={result.text} />
      ) : view === 'pretty' && kind === 'json' ? (
        <JsonBody text={result.text} />
      ) : (
        <ChunkedText text={result.text} />
      )}
    </Panel>
  );
}
