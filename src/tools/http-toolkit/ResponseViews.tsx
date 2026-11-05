import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DownloadButton } from '@/components/tool/ToolActions';
import { JsonTree } from '@/components/tool/JsonTree';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { compareText, isEmptyDiff } from '@/lib/diff';
import { MAX_DIFF_CHARS, canDiff, renderSlice } from '@/lib/apiworkbench/response';
import type { StreamedEvent } from '@/lib/apiworkbench/send';

/**
 * 响应体的几种展示形态。每个组件只管一种 content-type，
 * 尺寸与配色沿用同一套语义 token，避免出现第二个「响应面板」。
 */

const BOX = 'max-h-[420px] overflow-auto rounded-xl bg-code-bg p-3 font-mono text-[12px] leading-5 text-ink';

/** 按块显示长正文：一次给一块，「继续加载」把下一块接上。 */
export function ChunkedText({ text }: { text: string }) {
  const { t } = useI18n();
  const [blocks, setBlocks] = useState(1);
  // 换一次响应必须回到第一块，否则新响应的第 3 块接在旧响应的进度上。
  useEffect(() => setBlocks(1), [text]);
  const slice = renderSlice(text, blocks);
  return (
    <div className="space-y-2">
      <pre className={BOX}>
        {slice.shown || t({ zh: '（空响应体）', en: '(empty body)' })}
        {slice.remaining > 0 ? '\n' : ''}
      </pre>
      {slice.remaining > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setBlocks((n) => n + 1)}>
            {t({ zh: '继续加载', en: 'Load more' })}
          </Button>
          <span className="text-[11px] text-ink-3">
            {t({
              zh: `已显示 ${slice.blocks}/${slice.totalBlocks} 块 · 还有 ${slice.remaining} 字符`,
              en: `${slice.blocks}/${slice.totalBlocks} blocks shown · ${slice.remaining} characters left`,
            })}
          </span>
        </div>
      ) : (
        <p className="text-[11px] text-ink-3">
          {t({ zh: `完整正文已显示（${text.length} 字符）`, en: `Full body shown (${text.length} characters)` })}
        </p>
      )}
    </div>
  );
}

/** JSON：能解就树视图，解不了退回原文，不假装格式化成功。 */
export function JsonBody({ text }: { text: string }) {
  const parsed = useMemo(() => {
    try {
      const value = JSON.parse(text) as unknown;
      return value !== null && typeof value === 'object' ? value : undefined;
    } catch {
      return undefined;
    }
  }, [text]);
  if (parsed === undefined) return <ChunkedText text={text} />;
  return (
    <div className="max-h-[420px] overflow-auto rounded-xl bg-code-bg p-3">
      <JsonTree value={parsed} />
    </div>
  );
}

/**
 * HTML 预览。sandbox 留空 = 最严的那一档：脚本、同源、表单、弹窗、顶层跳转全禁。
 * 预览因此是静态标记 + 样式，第三方页面碰不到宿主文档，也「点不穿」出去。
 */
export function HtmlPreview({ html }: { html: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <ToolAlert
        tone="info"
        title={t({
          zh: '预览已禁用脚本、表单与跳转',
          en: 'Preview runs with scripts, forms, and navigation disabled',
        })}
        hint={t({
          zh: '需要看交互请复制响应体到本地打开，这类页面在静态沙箱里本来就不会动',
          en: 'To see interactions, copy the body and open it locally — scripted pages cannot run in this sandbox by design',
        })}
        className="mb-0"
      />
      <iframe
        title={t({ zh: 'HTML 预览', en: 'HTML preview' })}
        sandbox=""
        srcDoc={html}
        className="h-[420px] w-full rounded-xl border border-line bg-white"
      />
    </div>
  );
}

/** 图片走 object URL，组件卸载或换响应就 revoke。 */
export function ImageBody({ blob, bytes, mime }: { blob: Blob | null; bytes: number; mime: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  if (!url) {
    return (
      <ToolAlert
        tone="warning"
        title={t({ zh: '没有保留图片字节', en: 'No image bytes were kept' })}
        hint={t({
          zh: '代理通道与本地 Mock 只给文本；切到直连再发一次就能看到图',
          en: 'Proxy channels and the local mock return text only; send again over direct to get the bytes',
        })}
      />
    );
  }
  return (
    <figure className="space-y-2">
      <div className="flex max-h-[420px] items-center justify-center overflow-auto rounded-xl border border-line bg-surface-2/60 p-3">
        <img src={url} alt={t({ zh: '响应图片', en: 'Response image' })} className="max-h-[390px] max-w-full" />
      </div>
      <figcaption className="text-[11px] text-ink-3">
        {mime} · {bytes} B
      </figcaption>
    </figure>
  );
}

/** 二进制：给大小、类型和下载，不解码也不假装能预览。 */
export function BinaryBody({ blob, bytes, mime, filename }: { blob: Blob | null; bytes: number; mime: string; filename: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-xs">
        <Badge tone="accent">{mime || t({ zh: '未知类型', en: 'unknown type' })}</Badge>
        <span className="text-ink-2">{bytes} B</span>
        {blob ? (
          <DownloadButton
            filename={filename}
            blob={blob}
            mime={mime || 'application/octet-stream'}
            label={{ zh: '下载响应体', en: 'Download body' }}
          />
        ) : (
          <span className="text-ink-3">
            {t({ zh: '字节未保留，无法下载', en: 'Bytes were not kept, so there is nothing to download' })}
          </span>
        )}
      </div>
      <ToolAlert
        tone="info"
        title={t({
          zh: blob ? '二进制响应只显示大小，不内联渲染' : '这份响应没有可预览的字节',
          en: blob ? 'Binary bodies report their size instead of rendering inline' : 'This response has no previewable bytes',
        })}
        hint={t({
          zh: 'PDF 与图片在直连下会留在内存里；超过 8 MB 就不再留，刷新页面也不会恢复',
          en: 'Direct-mode PDF and images stay in memory; anything over 8 MB is dropped and cannot be restored by a reload',
        })}
      />
    </div>
  );
}

/** SSE 帧日志：事件名、数据、到达时刻；中止或不完整的帧要标出来。 */
export function EventList({ events, aborted, discarded }: { events: StreamedEvent[]; aborted: boolean; discarded: boolean }) {
  const { t } = useI18n();
  if (events.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-xs text-ink-3">
        {t({
          zh: '还没有解析出完整帧。流式响应要直连，服务端也得返回 text/event-stream。',
          en: 'No complete frames parsed yet. Streaming needs the direct channel and a text/event-stream response.',
        })}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {aborted ? (
        <ToolAlert tone="warning" title={t({ zh: '已中止，下面是收到的那部分', en: 'Stopped — these are the frames that arrived' })} className="mb-0" />
      ) : null}
      {discarded ? (
        <ToolAlert
          tone="warning"
          title={t({ zh: '最后一帧不完整，已丢弃', en: 'The last frame was incomplete and got dropped' })}
          hint={t({ zh: '连接被切断时常见；服务端没写完那一帧的 data 与空行', en: 'Usual when the connection is cut: the server never finished that frame' })}
          className="mb-0"
        />
      ) : null}
      <ol className="max-h-[420px] space-y-1.5 overflow-auto">
        {events.map((event, index) => (
          <li key={`${event.at}-${index}`} className="rounded-xl border border-line bg-surface px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <Badge tone={event.event === 'message' ? 'neutral' : 'accent'}>{event.event}</Badge>
              <span className="text-ink-3">+{event.at} ms</span>
              {event.id ? <span className="text-ink-3">id {event.id}</span> : null}
              {event.incomplete ? <Badge tone="warning">{t({ zh: '未闭合', en: 'unclosed' })}</Badge> : null}
            </div>
            <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-5 text-ink">{event.data}</pre>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 与上一次响应的行级差异。两侧都够小才比，否则说清楚为什么不比。 */
export function DiffBody({ left, right }: { left: string; right: string }) {
  const { t } = useI18n();
  if (!canDiff(left, right)) {
    return (
      <ToolAlert
        tone="warning"
        title={t({ zh: '两侧太大，不做比较', en: 'Too large to compare' })}
        hint={t({
          zh: `单次比较要求两边都不超过 ${MAX_DIFF_CHARS} 字符，现在分别是 ${left.length} 与 ${right.length}`,
          en: `Each side must stay under ${MAX_DIFF_CHARS} characters; these are ${left.length} and ${right.length}`,
        })}
      />
    );
  }
  const result = compareText(left, right, { ignoreWhitespace: false, compareAsJson: false });
  if (isEmptyDiff(result)) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-xs text-ok">
        {t({ zh: '与上一次响应完全一致', en: 'Identical to the previous response' })}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Badge tone="success">+{result.stats.added}</Badge>
        <Badge tone="danger">-{result.stats.removed}</Badge>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-xl bg-code-bg p-3 font-mono text-[12px] leading-5">
        {result.parts.map((part, index) => (
          <div
            key={index}
            className={
              part.added
                ? 'whitespace-pre-wrap break-all bg-ok-soft text-ok'
                : part.removed
                  ? 'whitespace-pre-wrap break-all bg-danger-soft text-danger'
                  : 'whitespace-pre-wrap break-all text-ink-2'
            }
          >
            {part.lines.map((line, lineIndex) => (
              <div key={lineIndex}>
                {part.added ? '+' : part.removed ? '-' : ' '} {line}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
