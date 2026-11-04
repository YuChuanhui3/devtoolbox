import { useCallback, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { assessQrScan, SCAN_MIN_MODULE_PX } from '@/lib/qr';
import { cn } from '@/lib/cn';

interface MeasuredBox {
  /** 挂在真正容纳 <svg> 的那层 div 上。 */
  measureRef: (node: HTMLDivElement | null) => void;
  width: number;
}

/** 码框 p-2 的左右内边距：每模块像素要按 svg 自身的宽度算，不是框的宽度。 */
const FRAME_PADDING_PX = 16;
/** 放大面板 w-[min(92vw,92vh)] 减去 body p-3 与边框后剩下的码宽估算值，只在没有布局时兜底。 */
const ZOOM_INSET_PX = 32;

/**
 * 量一个框的上屏 CSS 宽度：能不能扫只由这个数决定。
 * 声明宽度在没有布局的环境（jsdom、首帧）里兜底，窄屏把码挤小时以实测为准。
 */
function useMeasuredWidth(declaredWidth: number): MeasuredBox {
  const observerRef = useRef<ResizeObserver | null>(null);
  const [width, setWidth] = useState(declaredWidth);

  const measureRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    setWidth(node.getBoundingClientRect().width || declaredWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    observerRef.current = observer;
  }, [declaredWidth]);

  return { measureRef, width };
}

interface QrZoomFrameProps {
  /**
   * buildQrSvg 的产物：矢量图放大不糊边，但 <svg> 自带 role="img"，
   * 所以外层框不能再标一遍，否则读屏会把同一张码念两次。
   */
  svg: string;
  moduleCount: number;
  /** 布局期望的行内宽度（码框的 border-box）。窄屏上真实宽度更小，以实测为准。 */
  inlineWidth: number;
  /** 除了放大还能做什么，例如「改用分帧传输」。 */
  remedy?: Localized;
  className?: string;
}

/**
 * 单张二维码的显示框：报告真实上屏宽度下的每模块像素，不够扫时一键放大。
 * 行内宽度被 CSS 限死，所以密度不够只能放大——改 canvas/SVG 的像素尺寸不影响上屏宽度。
 */
export function QrZoomFrame({ svg, moduleCount, inlineWidth, remedy, className }: QrZoomFrameProps) {
  const { t } = useI18n();
  const [zoomed, setZoomed] = useState(false);
  const inlineBox = useMeasuredWidth(inlineWidth - FRAME_PADDING_PX);
  // 放大面板是 min(92vw,92vh)，没有布局时（jsdom）按这个估算兜底，有布局就以实测为准
  const zoomBox = useMeasuredWidth(Math.min(window.innerWidth, window.innerHeight) * 0.92 - ZOOM_INSET_PX);
  const inline = assessQrScan(moduleCount, inlineBox.width, SCAN_MIN_MODULE_PX);
  const enlarged = assessQrScan(moduleCount, zoomBox.width, SCAN_MIN_MODULE_PX);

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="rounded-card border border-line bg-white p-2 shadow-card" style={{ width: inlineWidth, maxWidth: '100%' }}>
        <div
          ref={inlineBox.measureRef}
          className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <p className={cn('text-center text-[11px] leading-5', inline.ok ? 'text-ink-3' : 'text-warn')}>
        {inline.ok
          ? t({
              zh: `每模块 ${inline.modulePx.toFixed(2)}px，高于 ${SCAN_MIN_MODULE_PX}px，够扫。`,
              en: `${inline.modulePx.toFixed(2)}px per module, above the ${SCAN_MIN_MODULE_PX}px floor — scannable.`,
            })
          : t({
              zh: `每模块只有 ${inline.modulePx.toFixed(2)}px（需要 ≥${SCAN_MIN_MODULE_PX}px），点下方「放大」。`,
              en: `Only ${inline.modulePx.toFixed(2)}px per module (needs ≥${SCAN_MIN_MODULE_PX}px) — press Zoom below.`,
            })}
        {!inline.ok && remedy ? ` ${t(remedy)}` : ''}
      </p>
      <Button variant="secondary" size="sm" onClick={() => setZoomed(true)}>
        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        {t({ zh: '放大', en: 'Zoom' })}
      </Button>

      <Modal
        open={zoomed}
        onClose={() => setZoomed(false)}
        title={t({ zh: '放大二维码', en: 'Zoomed QR code' })}
        maxWidth="min(92vw,92vh)"
        bodyClassName="p-3"
      >
        <div className="flex flex-col items-center gap-2">
          <div
            ref={zoomBox.measureRef}
            className="w-full [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className={cn('text-center text-[11px] leading-5', enlarged.ok ? 'text-ink-3' : 'text-warn')}>
            {enlarged.ok
              ? t({
                  zh: `每模块 ${enlarged.modulePx.toFixed(2)}px · 对准摄像头 20–40cm，把亮度调高更容易识别。`,
                  en: `${enlarged.modulePx.toFixed(2)}px per module · hold the camera 20–40cm away and turn the brightness up.`,
                })
              : t({
                  zh: `放大后每模块 ${enlarged.modulePx.toFixed(2)}px，仍然偏密；${remedy ? t(remedy) : '请缩短内容。'}`,
                  en: `${enlarged.modulePx.toFixed(2)}px per module even zoomed — still too dense; ${remedy ? t(remedy) : 'shorten the content.'}`,
                })}
          </p>
        </div>
      </Modal>
    </div>
  );
}
