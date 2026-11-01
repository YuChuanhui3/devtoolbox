import { useEffect, useRef, useState } from 'react';
import { Camera, Video } from 'lucide-react';
import { ToolError } from '@/lib/errors';
import { useI18n } from '@/i18n/I18nProvider';
import { tl, type L10n, type Localized } from '@/i18n/locale';
import { isSignalText } from '@/lib/sdp';

interface ScannerProps {
  active: boolean;
  onResult: (text: string) => void;
  /** signal：只吃配对信息，扫到一次即停；any：连续扫任意二维码并逐次回调。 */
  mode?: 'signal' | 'any';
}

const SCAN_FALLBACK_HINT: L10n = { zh: '可改用「粘贴连接信息」完成配对', en: 'You can use "paste connection info" to pair instead' };

export function Scanner({ active, onResult, mode = 'signal' }: ScannerProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [message, setMessage] = useState<Localized>('');
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const lastCodeRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setStatus('starting');
    setMessage({ zh: '正在开启摄像头…', en: 'Starting camera…' });

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader(new Map(), { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          (result, _err, ctrl) => {
            if (!result) return;
            const text = result.getText();
            if (mode === 'signal') {
              if (!isSignalText(text)) return;
              ctrl.stop();
              stopRef.current = null;
              setStatus('running');
              onResultRef.current(text);
              return;
            }
            // 摄像头每 150ms 重复解到同一张码，去重后才算一次新扫码
            const now = Date.now();
            if (text === lastCodeRef.current.text && now - lastCodeRef.current.at < 1500) return;
            lastCodeRef.current = { text, at: now };
            setStatus('running');
            onResultRef.current(text);
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        stopRef.current = () => controls.stop();
        setStatus('running');
        setMessage(
          mode === 'signal'
            ? { zh: '对准对方屏幕上的二维码', en: 'Point at the QR code on the other screen' }
            : { zh: '对准任意二维码，扫到即回传', en: 'Point at any QR code; each hit is forwarded' },
        );
      } catch (caught) {
        if (cancelled) return;
        setStatus('error');
        const err = caught instanceof ToolError ? caught : new ToolError({ zh: '摄像头不可用', en: 'Camera unavailable' });
        const hint = err.hint ?? SCAN_FALLBACK_HINT;
        setMessage({
          zh: `${tl(err.localized, 'zh')}：${tl(hint, 'zh')}`,
          en: `${tl(err.localized, 'en')}: ${tl(hint, 'en')}`,
        });
      }
    })();

    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [active, mode]);

  if (!active) return null;

  return (
    <div className="space-y-2">
      <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-card border border-line bg-black/90">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label={t({ zh: '扫码预览', en: 'Scanner preview' })} />
        <div className="pointer-events-none absolute inset-[14%] rounded-lg border-2 border-accent/80" />
        {status !== 'running' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 px-4 text-center text-xs text-white/85">
            {status === 'error' ? (
              <Video className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Camera className="h-5 w-5 animate-pulse" aria-hidden="true" />
            )}
            <span>{message ? t(message) : null}</span>
          </div>
        ) : null}
      </div>
      <p className="text-center text-[11px] text-ink-3">{status === 'error' && message
          ? t(message)
          : mode === 'signal'
            ? t({ zh: '扫码失败时，可展开下方「粘贴连接信息」兜底', en: 'If scanning fails, use the "paste connection info" fallback below' })
            : t({ zh: '同一张码 1.5 秒内只回传一次，可连续扫多张', en: 'The same code is forwarded once per 1.5 s, so you can keep scanning' })}</p>
    </div>
  );
}
