import { useEffect, useRef, useState } from 'react';
import { Camera, ScanLine, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { tl, type L10n, type Localized } from '@/i18n/locale';
import { ToolError } from '@/lib/errors';
import { parseFrame } from '@/lib/qr-transfer';
import { DqxResult, SessionProgress } from './DqxResult';
import type { DqxSession } from '@/hooks/useDqxSession';

const SCAN_HINT: L10n = {
  zh: '可切到「截图/录屏回收」，用对方发来的帧截图或录屏逐帧解码',
  en: 'Switch to "Salvage" to decode frame screenshots or a screen recording from the other side',
};

interface ReceivePanelProps {
  active: boolean;
  session: DqxSession;
}

export function ReceivePanel({ active, session }: ReceivePanelProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const lastRef = useRef<{ key: string; confirmed: boolean }>({ key: '', confirmed: false });
  const acceptRef = useRef(session.accept);
  acceptRef.current = session.accept;

  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [message, setMessage] = useState<Localized>('');
  const [manual, setManual] = useState('');
  const [mismatch, setMismatch] = useState<{ sid: string; crc: string } | null>(null);

  // 双读确认：同一帧连续两次被完整读出才入账，挡掉相机错读。
  const handleResult = (text: string) => {
    const frame = parseFrame(text);
    if (!frame) return;
    const key = `${frame.sid}:${frame.index}`;
    if (lastRef.current.key !== key) {
      lastRef.current = { key, confirmed: false };
      return;
    }
    if (lastRef.current.confirmed) return;
    lastRef.current.confirmed = true;
    acceptRef.current(text);
  };

  const stopScan = () => {
    stopRef.current?.();
    stopRef.current = null;
    setScanning(false);
    setStatus('idle');
  };

  useEffect(() => {
    if (!active && scanning) stopScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => () => stopRef.current?.(), []);

  const lastEvent = session.event;
  useEffect(() => {
    if (lastEvent?.kind === 'mismatch') setMismatch({ sid: lastEvent.session.sid, crc: lastEvent.crcActual });
    if (lastEvent?.kind === 'complete') setMismatch(null);
  }, [lastEvent]);

  const startScan = async () => {
    setScanning(true);
    setStatus('starting');
    setMessage({ zh: '正在开启摄像头…', en: 'Starting camera…' });
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader(new Map(), { delayBetweenScanAttempts: 120 });
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        if (!result) return;
        handleResult(result.getText());
      });
      stopRef.current = () => controls.stop();
      setStatus('running');
      setMessage({ zh: '对准对方屏幕上的二维码序列', en: 'Point at the QR sequence on the other screen' });
    } catch (caught) {
      const err = caught instanceof ToolError ? caught : new ToolError({ zh: '摄像头不可用', en: 'Camera unavailable' });
      setStatus('error');
      setMessage({
        zh: `${tl(err.localized, 'zh')}：${tl(err.hint ?? SCAN_HINT, 'zh')}`,
        en: `${tl(err.localized, 'en')}: ${tl(err.hint ?? SCAN_HINT, 'en')}`,
      });
    }
  };

  const sessions = session.sessions;
  const { complete } = session;

  return (
    <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
      <Panel
        title={t({ zh: '摄像头扫码', en: 'Camera scan' })}
        subtitle={t({ zh: '连续识别 DQX 协议帧，自动去重与乱序归位', en: 'Continuously reads DQX frames, dedupes and reorders automatically' })}
        bodyClassName="p-4"
      >
        <div className="space-y-3">
          <div className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-card border border-line bg-black/90">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label={t({ zh: '扫码预览', en: 'Scanner preview' })} />
            <div className="pointer-events-none absolute inset-[16%] rounded-lg border-2 border-accent/80" />
            {status !== 'running' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 px-4 text-center text-xs text-white/85">
                {status === 'error' ? <Video className="h-5 w-5" aria-hidden="true" /> : <Camera className="h-5 w-5 animate-pulse" aria-hidden="true" />}
                <span>{message ? t(message) : t({ zh: '点击「开始扫码」授权摄像头', en: 'Press Start scan to grant camera access' })}</span>
              </div>
            ) : null}
          </div>
          <div className="flex justify-center gap-1.5">
            {scanning ? (
              <Button variant="secondary" size="sm" onClick={stopScan}>
                {t({ zh: '停止扫码', en: 'Stop scan' })}
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => void startScan()}>
                <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '开始扫码', en: 'Start scan' })}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={session.reset} disabled={sessions.length === 0}>
              {t({ zh: '清空重来', en: 'Reset' })}
            </Button>
          </div>
          {status === 'error' ? (
            <ToolAlert tone="warning" title={{ zh: '摄像头不可用', en: 'Camera unavailable' }} hint={SCAN_HINT} />
          ) : null}

          <div className="space-y-1.5 border-t border-line pt-3">
            <label htmlFor="dqx-manual" className="text-xs text-ink-3">
              {t({ zh: '手动粘贴帧文本（兜底）', en: 'Paste frame text manually (fallback)' })}
            </label>
            <div className="flex gap-1.5">
              <Input
                id="dqx-manual"
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                placeholder="DQX1:abc123::0of27:eyJmaWxlIjox…="
                className="h-9 flex-1 font-mono text-xs"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!manual.trim()}
                onClick={() => {
                  session.accept(manual.trim());
                  setManual('');
                }}
              >
                {t({ zh: '入账', en: 'Add' })}
              </Button>
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title={t({ zh: '接收进度', en: 'Receiving progress' })}
        subtitle={t({ zh: '同一浏览器内切到发送 tab 也能实时看到进度', en: 'Progress updates live even when you switch to the Send tab' })}
        bodyClassName="p-4"
      >
        <div className="space-y-3">
          {sessions.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 px-6 text-center">
              <ScanLine className="h-8 w-8 text-ink-3" aria-hidden="true" />
              <p className="text-sm font-medium text-ink">{t({ zh: '等待扫到第一帧', en: 'Waiting for the first frame' })}</p>
              <p className="max-w-sm text-xs leading-5 text-ink-3">
                {t({
                  zh: '让发送端点击「播放」；扫到的帧会按会话归组，缺哪帧就等哪帧。',
                  en: 'Ask the sender to hit Play; scanned frames are grouped by session and missing frames simply stay pending.',
                })}
              </p>
            </div>
          ) : (
            sessions.map((view) => (
              <SessionProgress key={view.sid} view={view} mismatch={mismatch?.sid === view.sid ? mismatch.crc : undefined} />
            ))
          )}
          {complete ? <DqxResult view={complete.view} payload={complete.payload} /> : null}
        </div>
      </Panel>
    </div>
  );
}
