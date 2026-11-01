import { useEffect, useRef, useState } from 'react';
import { Film, ImageIcon, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { ImageDropzone } from '@/components/tool/ImageDropzone';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import { formatBytes } from '@/lib/number';
import { toToolError } from '@/lib/errors';
import type { L10n } from '@/i18n/locale';
import { SessionProgress, DqxResult } from './DqxResult';
import type { DqxSession } from '@/hooks/useDqxSession';

async function loadZxing() {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  return new BrowserMultiFormatReader(new Map(), { delayBetweenScanAttempts: 0 });
}

/** zxing-js 对 V20+ 密集码有随机漏检，jsQR 作为第二引擎兜底。 */
async function loadJsQr() {
  const mod = await import('jsqr');
  const candidate = (mod as { default?: unknown }).default ?? mod;
  const fn = typeof candidate === 'function' ? candidate : (mod as { jsQR?: unknown }).jsQR;
  return typeof fn === 'function' ? (fn as JsQr) : null;
}

type JsQr = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: Record<string, unknown>,
) => { data?: string } | null;

function decodeCanvas(
  canvas: HTMLCanvasElement,
  reader: Awaited<ReturnType<typeof loadZxing>>,
  jsQr: JsQr | null,
): string | null {
  try {
    const text = reader.decodeFromCanvas(canvas)?.getText();
    if (text) return text;
  } catch {
    /* zxing 漏检，交给 jsQR */
  }
  if (jsQr) {
    const context = canvas.getContext('2d');
    try {
      const data = context?.getImageData(0, 0, canvas.width, canvas.height).data;
      const found = data && jsQr(data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
      if (found?.data) return found.data;
    } catch {
      /* 两引擎都没读到 */
    }
  }
  return null;
}

function decodeOnce(
  reader: Awaited<ReturnType<typeof loadZxing>>,
  jsQr: JsQr | null,
  image: HTMLImageElement,
  scale: number,
): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return decodeCanvas(canvas, reader, jsQr);
}

function decodeImage(
  reader: Awaited<ReturnType<typeof loadZxing>>,
  jsQr: JsQr | null,
  file: Blob,
): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      const cap = 1600;
      const base = image.naturalWidth > cap ? cap / image.naturalWidth : 1;
      for (const scale of [base, base * 2, base * 0.75]) {
        const text = decodeOnce(reader, jsQr, image, scale);
        if (text) {
          URL.revokeObjectURL(url);
          resolve(text);
          return;
        }
      }
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

interface SalvagePanelProps {
  active: boolean;
  session: DqxSession;
}

export function SalvagePanel({ active, session }: SalvagePanelProps) {
  const { t } = useI18n();
  const toast = useToast();
  const acceptRef = useRef(session.accept);
  acceptRef.current = session.accept;

  const [imageBusy, setImageBusy] = useState(false);
  const [imageNote, setImageNote] = useState<L10n | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [sampleFps, setSampleFps] = useState(2);
  const [videoState, setVideoState] = useState<'idle' | 'running' | 'done'>('idle');
  const [videoProgress, setVideoProgress] = useState({ time: 0, total: 0, hits: 0 });
  const abortRef = useRef(false);

  useEffect(() => {
    if (!active) abortRef.current = true;
  }, [active]);

  useEffect(() => () => {
    abortRef.current = true;
  }, []);

  const onImages = async (files: FileList | File[]) => {
    if (imageBusy) return;
    abortRef.current = false;
    setImageBusy(true);
    setImageNote(null);
    try {
      const reader = await loadZxing();
      const jsQr = await loadJsQr();
      let hits = 0;
      for (const file of Array.from(files)) {
        if (abortRef.current) break;
        const text = await decodeImage(reader, jsQr, file);
        if (text) {
          acceptRef.current(text);
          hits += 1;
        }
      }
      setImageNote(
        hits === files.length
          ? { zh: `全部 ${hits} 张图解出二维码`, en: `All ${hits} images decoded` }
          : { zh: `${hits}/${files.length} 张图解出二维码，其余未识别（可提高图片分辨率后重试）`, en: `${hits}/${files.length} images decoded; the rest were unreadable (try higher-resolution captures)` },
      );
    } catch (error) {
      toast.error(t(toToolError(error).localized));
    } finally {
      setImageBusy(false);
    }
  };

  const scanVideo = async (file: File) => {
    abortRef.current = false;
    setVideoState('running');
    setVideoProgress({ time: 0, total: 0, hits: 0 });
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    const canvas = document.createElement('canvas');
    try {
      const reader = await loadZxing();
      const jsQr = await loadJsQr();
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('video load failed'));
      });
      const scale = Math.min(1, 1280 / (video.videoWidth || 1280));
      canvas.width = Math.max(1, Math.round((video.videoWidth || 640) * scale));
      canvas.height = Math.max(1, Math.round((video.videoHeight || 480) * scale));
      const interval = 1 / Math.max(0.5, Math.min(10, sampleFps));
      let hits = 0;
      for (let time = 0; time <= video.duration + 1e-3; time += interval) {
        if (abortRef.current) break;
        if (video.seekable.length > 0) {
          video.currentTime = Math.min(time, Math.max(0, video.seekable.end(video.seekable.length - 1) - 0.05));
        }
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          window.setTimeout(resolve, 1200);
        });
        const context = canvas.getContext('2d');
        if (!context) break;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const text = decodeCanvas(canvas, reader, jsQr);
        if (text) {
          acceptRef.current(text);
          hits += 1;
        }
        setVideoProgress({ time, total: video.duration, hits });
      }
      setVideoState(abortRef.current ? 'idle' : 'done');
      toast.success(
        t({ zh: `录屏扫描完成：命中 ${hits} 帧`, en: `Recording scan done: ${hits} frames hit` }),
      );
    } catch {
      setVideoState('idle');
      toast.error(t({ zh: '视频无法解析，请换 MP4/WebM 录屏文件', en: 'Video could not be parsed; try an MP4/WebM recording' }));
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const sessions = session.sessions;
  const complete = sessions.find((view) => view.missingCount === 0);
  const completePayload =
    session.event?.kind === 'complete' && session.event.session.sid === complete?.sid ? session.event.payload : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-4">
        <Panel
          title={t({ zh: '图片回收', en: 'Screenshot salvage' })}
          subtitle={t({ zh: '把发送端逐帧截图传过来（聊天软件/AirDrop 均可），批量解码', en: 'Send frame screenshots over any channel (chat, AirDrop) and batch-decode them' })}
          bodyClassName="p-4"
        >
          <ImageDropzone
            accept="image/*"
            icon={<ImageIcon className="h-5 w-5" aria-hidden="true" />}
            title={t({ zh: '拖入帧截图（可多选）', en: 'Drop frame screenshots (multiple allowed)' })}
            hint={t({ zh: 'PNG / JPG 截图，按任意顺序提供，缺帧可后续补', en: 'PNG / JPG captures in any order; missing frames can be added later' })}
            onFiles={(files) => void onImages(files)}
          />
          {imageBusy ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {t({ zh: '正在逐张解码…', en: 'Decoding images…' })}
            </p>
          ) : null}
          {imageNote ? <p className="mt-3 text-xs text-ink-3">{t(imageNote)}</p> : null}
        </Panel>

        <Panel
          title={t({ zh: '录屏回收', en: 'Screen-recording salvage' })}
          subtitle={t({ zh: '对方录一段播放视频传过来，按时钟逐帧解码', en: 'The other side records the playback; frames are sampled on a clock' })}
          bodyClassName="p-4"
        >
          <div className="space-y-3">
            <ImageDropzone
              multiple={false}
              accept="video/*"
              icon={<Film className="h-5 w-5" aria-hidden="true" />}
              title={t({ zh: '拖入录屏视频', en: 'Drop a screen recording' })}
              hint={t({ zh: 'MP4 / WebM；帧率建议 ≥2fps 且每帧停留 ≥1 秒', en: 'MP4 / WebM; playback should show each frame for at least ~1s' })}
              onFiles={(files) => {
                const picked = files[0];
                if (picked) setVideoFile(picked);
              }}
            />
            {videoFile ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/40 px-3 py-2 text-xs text-ink-2">
                <Film className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                <span className="font-medium">{videoFile.name}</span>
                <span className="text-ink-3">{formatBytes(videoFile.size, 0)}</span>
                <label className="ml-auto flex items-center gap-1.5 text-ink-3">
                  {t({ zh: '采样', en: 'Sample' })}
                  <Input
                    value={String(sampleFps)}
                    onChange={(event) => setSampleFps(Number(event.target.value) || 2)}
                    inputMode="decimal"
                    aria-label={t({ zh: '视频采样帧率', en: 'Video sampling fps' })}
                    className="h-8 w-14 text-xs"
                  />
                  fps
                </label>
                {videoState === 'running' ? (
                  <Button variant="secondary" size="sm" onClick={() => { abortRef.current = true; }}>
                    <Square className="h-3.5 w-3.5" aria-hidden="true" />
                    {t({ zh: '停止', en: 'Stop' })}
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" disabled={!active} onClick={() => void scanVideo(videoFile)}>
                    {t({ zh: '开始扫描', en: 'Scan' })}
                  </Button>
                )}
              </div>
            ) : null}
            {videoState !== 'idle' ? (
              <div className="space-y-1.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: videoProgress.total > 0 ? `${Math.min(100, (videoProgress.time / videoProgress.total) * 100)}%` : '0%' }}
                  />
                </div>
                <p className="text-[11px] text-ink-3">
                  {videoProgress.time.toFixed(1)}s / {videoProgress.total.toFixed(1)}s ·{' '}
                  {t({ zh: `命中 ${videoProgress.hits} 帧`, en: `${videoProgress.hits} frames hit` })}
                </p>
              </div>
            ) : null}
            {videoState === 'done' ? (
              <ToolAlert
                tone="success"
                title={t({ zh: '扫描完成', en: 'Scan finished' })}
                hint={t({ zh: '右侧显示重组进度；若有缺帧可让对方重播缺失部分后再录一段。', en: 'See reassembly on the right; if frames are missing, record the missing part again.' })}
              />
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel
        title={t({ zh: '重组进度', en: 'Reassembly' })}
        subtitle={t({ zh: '与「接收」tab 共享同一会话池', en: 'Shares one session pool with the Receive tab' })}
        bodyClassName="p-4"
      >
        <div className="space-y-3">
          {sessions.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 px-6 text-center">
              <ImageIcon className="h-8 w-8 text-ink-3" aria-hidden="true" />
              <p className="text-sm font-medium text-ink">{t({ zh: '还没有解出任何帧', en: 'No frames decoded yet' })}</p>
              <p className="max-w-sm text-xs leading-5 text-ink-3">
                {t({
                  zh: '截图和录屏可以混着来：每解出一帧就自动入账。',
                  en: 'Mix screenshots and recordings freely; every decoded frame is banked automatically.',
                })}
              </p>
            </div>
          ) : (
            sessions.map((view) => <SessionProgress key={view.sid} view={view} />)
          )}
          {complete && completePayload ? <DqxResult view={complete} payload={completePayload} /> : null}
        </div>
      </Panel>
    </div>
  );
}
