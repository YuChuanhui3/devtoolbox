import { useMemo, useState } from 'react';
import { ChevronDown, QrCode } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Textarea } from '@/components/ui/Textarea';
import { QrZoomFrame } from '@/components/tool/QrZoomFrame';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { toToolError } from '@/lib/errors';
import { formatBytes } from '@/lib/number';
import { buildQrSvg, createQrMatrix, QR_DEFAULT_STYLE, utf8ByteLength } from '@/lib/qr';

const TOUCH_DEVICE = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

/** 码框被网格限制在 240px，密度判断必须按这个上屏宽度算。 */
const QR_BOARD_INLINE_PX = 240;

/**
 * 本机把文本编码成二维码，让对方用「本机充当对方的扫码器」连续扫描。
 * 方向是对称的：电脑给手机扫，手机也可以给电脑扫。
 */
export function TextQrBoard() {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(!TOUCH_DEVICE);

  const result = useMemo(() => {
    if (!text.trim()) return { svg: '', matrix: null, error: null };
    try {
      // 单张二维码取 L 级容错，尽量容纳更长的文本；超出容量时交给下方错误提示。
      const matrix = createQrMatrix(text, 'L');
      return { svg: buildQrSvg(matrix, { ...QR_DEFAULT_STYLE, ecc: 'L', size: QR_BOARD_INLINE_PX }), matrix, error: null };
    } catch (error) {
      return { svg: '', matrix: null, error: toToolError(error) };
    }
  }, [text]);

  const { svg, matrix, error } = result;

  return (
    <Panel
      title={t({ zh: '文本二维码 · 扫码回传', en: 'Text QR · scan back here' })}
      subtitle={t({
        zh: '把文本编码成二维码，让对方扫码；扫到的内容会实时回传到「扫码回传」。',
        en: 'Encode text as a QR for the peer to scan; the result is sent back to "Scanned results" live.',
      })}
      actions={
        <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
          {open ? t({ zh: '收起', en: 'Hide' }) : t({ zh: '生成二维码', en: 'Show QR' })}
        </Button>
      }
      bodyClassName="p-4"
    >
      {open ? (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_240px]">
          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              placeholder={t({
                zh: '输入要编码成二维码的文本…',
                en: 'Enter the text to encode as a QR code…',
              })}
              aria-label={t({ zh: '二维码文本内容', en: 'QR text content' })}
              className="text-sm"
            />
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
              <span>
                {text.length} {t({ zh: '字符', en: 'chars' })}
              </span>
              <span>UTF-8 {formatBytes(utf8ByteLength(text), 0)}</span>
              {matrix ? <Badge tone="neutral">V{matrix.version}</Badge> : null}
              {text ? (
                <Button variant="ghost" size="sm" onClick={() => setText('')}>
                  {t({ zh: '清空', en: 'Clear' })}
                </Button>
              ) : null}
            </div>
            {error ? <ToolAlert tone="error" title={error.localized} hint={error.hint} /> : null}
          </div>

          <div className="flex flex-col items-center gap-2">
            {matrix ? (
              <QrZoomFrame
                svg={svg}
                moduleCount={matrix.moduleCount}
                inlineWidth={QR_BOARD_INLINE_PX}
                remedy={{ zh: '改用「二维码发送」分帧传输。', en: 'switch to QR Send to split it into frames.' }}
              />
            ) : (
              <div className="flex aspect-square w-full max-w-[240px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-surface-2/40 px-6 text-center">
                <QrCode className="h-7 w-7 text-ink-3" aria-hidden="true" />
                <p className="text-xs text-ink-3">
                  {error
                    ? t({ zh: '内容超出二维码容量', en: 'Content exceeds QR capacity' })
                    : t({ zh: '输入文本后自动生成', en: 'Generated once you enter text' })}
                </p>
              </div>
            )}
            <p className="text-center text-[11px] leading-5 text-ink-3">
              {t({
                zh: '让对方勾选「本机充当对方的扫码器」后扫描此码。',
                en: 'Have the peer tick "Use this device as the peer\'s scanner" and scan this code.',
              })}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs leading-5 text-ink-3">
          {t({
            zh: '需要让手机把文本读回本机时，展开输入文本并生成二维码。',
            en: 'When you need the phone to read text back into this device, expand this panel and generate a QR code.',
          })}
        </p>
      )}
    </Panel>
  );
}
