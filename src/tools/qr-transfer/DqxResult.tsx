import { useEffect, useState } from 'react';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { CopyButton, DownloadButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { formatBytes } from '@/lib/number';
import { safeFilename } from '@/lib/download';
import { inflatePayloadBytes, type SessionView } from '@/lib/qr-transfer';

interface DqxResultProps {
  view: SessionView;
  payload: Uint8Array;
}

/** 齐帧后的展示：解压、文本预览、下载。接收与回收两个 tab 共用。 */
export function DqxResult({ view, payload }: DqxResultProps) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setNote(null);
    inflatePayloadBytes(payload)
      .then((inflated) => {
        if (cancelled) return;
        try {
          setText(new TextDecoder('utf-8', { fatal: true }).decode(inflated));
        } catch {
          setNote(
            t({
              zh: '内容是二进制数据，下载后交给对应程序打开。',
              en: 'The content is binary; download it and open it with the right program.',
            }),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setNote(t({ zh: 'Gzip 解压失败，请下载原始载荷。', en: 'Gzip decompression failed; download the raw payload.' }));
      });
    return () => {
      cancelled = true;
    };
  }, [payload, t]);

  const fileName = safeFilename(view.meta?.fileName ?? `dqx-${view.sid}.bin`, `dqx-${view.sid}.bin`);
  const looksCompressed = payload.length >= 2 && payload[0] === 0x1f && payload[1] === 0x8b;
  const downloadName = text !== null ? fileName : looksCompressed ? `${fileName}.gz` : fileName;
  const blob = new Blob([payload.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' });

  return (
    <div className="space-y-3 rounded-xl border border-ok/30 bg-ok-soft/40 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
        <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden="true" />
        {t({ zh: '接收完成', en: 'Transfer complete' })}
        <span className="text-xs font-normal text-ink-3">
          {fileName} · {formatBytes(payload.length, 0)}
          {view.meta?.rawBytes && view.meta.rawBytes !== payload.length ? ` → ${formatBytes(view.meta.rawBytes, 0)}` : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <DownloadButton filename={downloadName} blob={blob} label={t({ zh: '下载文件', en: 'Download file' })} />
        {text !== null ? <CopyButton text={text} label={t({ zh: '复制文本', en: 'Copy text' })} /> : null}
      </div>
      {note ? <p className="text-xs text-ink-3">{note}</p> : null}
      {text !== null ? (
        <pre className="max-h-56 overflow-auto rounded-lg bg-surface p-3 font-mono text-[11px] leading-5 text-ink-2">{text.slice(0, 4000)}{text.length > 4000 ? '…' : ''}</pre>
      ) : null}
    </div>
  );
}

export function SessionProgress({ view, mismatch }: { view: SessionView; mismatch?: string }) {
  const { t } = useI18n();
  const percent = view.total > 0 ? Math.round((view.received / view.total) * 100) : 0;
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface-2/40 p-3.5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
        <span className="font-mono text-[11px] text-ink-3">#{view.sid}</span>
        <span className="font-medium">
          {view.received}/{view.total} {t({ zh: '帧', en: 'frames' })}
        </span>
        {view.meta?.fileName ? <span className="text-ink-3">{view.meta.fileName}</span> : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      {mismatch ? (
        <div className="flex items-start gap-1.5 text-[11px] leading-5 text-danger">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            {t({
              zh: `帧已齐但 CRC 校验不符（期望 ${view.crcExpected ?? '-'}，实际 ${mismatch}）：某帧被错读，请点击「清空重来」或补扫全部帧。`,
              en: `All frames arrived but the CRC check failed (expected ${view.crcExpected ?? '-'}, got ${mismatch}): one frame was misread. Reset or rescan every frame.`,
            })}
          </span>
        </div>
      ) : view.missing.length > 0 ? (
        <p className="text-[11px] text-ink-3">
          {t({ zh: '还缺帧：', en: 'Missing frames: ' })}
          <span className="font-mono">{view.missing.slice(0, 24).join(', ')}{view.missing.length > 24 ? '…' : ''}</span>
        </p>
      ) : null}
    </div>
  );
}
