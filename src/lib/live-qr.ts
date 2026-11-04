import { ToolError } from '@/lib/errors';

/**
 * 摄像头连续解码的自有循环。
 *
 * 之所以不用 @zxing/browser 的 `decodeFromVideoDevice`：它把解码循环攥在自己手里，
 * 一旦某帧抛出 NotFoundException 之外的错误（画面还没就绪时 drawImage 的
 * InvalidStateError、0×0 画布、密集码的 IllegalArgumentException），它会
 * 悄悄拆掉摄像头流并永久停止扫描，调用方只收到一次被丢弃的 err ——
 * 表现就是「预览还在，但扫码器一直没反应」。这里把循环拿回自己手上：
 * 任何一帧失败都只是这一帧作废，下一帧继续，并把错误计数暴露给界面。
 */
export interface LiveQrStats {
  /** 尝试解码的帧数。为 0 说明根本没进到解码这一步。 */
  attempts: number;
  /** 成功读到内容的帧数（不区分是不是本协议的帧）。 */
  hits: number;
  width: number;
  height: number;
  /** 视频轨道已开但没有画面（readyState/videoWidth 长期为 0）。 */
  stalled: boolean;
  lastError: string | null;
}

export interface LiveQrOptions {
  video: HTMLVideoElement;
  onText: (text: string) => void;
  onStats?: (stats: LiveQrStats) => void;
  /** 两次解码之间的间隔。密集内容靠双引擎逐帧重试，不必贪频率。 */
  intervalMs?: number;
}

type JsQr = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: Record<string, unknown>,
) => { data?: string } | null;

/** jsQR 的 ESM/CJS 互操作在不同打包器下 default 层级不一致，与 SalvagePanel 同一套取法。 */
async function loadJsQr(): Promise<JsQr | null> {
  try {
    const mod = await import('jsqr');
    const candidate = (mod as { default?: unknown }).default ?? mod;
    const fn = typeof candidate === 'function' ? candidate : (mod as { jsQR?: unknown }).jsQR;
    return typeof fn === 'function' ? (fn as JsQr) : null;
  } catch {
    return null;
  }
}

async function loadZxing() {
  const { BrowserQRCodeReader } = await import('@zxing/browser');
  return new BrowserQRCodeReader(new Map(), { delayBetweenScanAttempts: 0 });
}

function cameraError(error: unknown): ToolError {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return new ToolError(
      { zh: '摄像头权限被拒绝', en: 'Camera permission denied' },
      { zh: '在浏览器地址栏的站点设置里重新允许摄像头；HTTP 局域网页面默认拿不到摄像头。', en: 'Re-allow the camera in the site settings; plain-HTTP LAN pages are blocked from camera access by default.' },
    );
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new ToolError(
      { zh: '没找到可用摄像头', en: 'No camera found' },
      { zh: '确认设备有摄像头且未被系统禁用。', en: 'Check that this device has a camera and that it is not disabled in the system.' },
    );
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return new ToolError(
      { zh: '摄像头被其他程序占用', en: 'Camera is busy' },
      { zh: '关掉正在使用摄像头的会议/相机应用后重试。', en: 'Close the meeting or camera app holding the device, then retry.' },
    );
  }
  return new ToolError(
    { zh: '摄像头不可用', en: 'Camera unavailable' },
    { zh: '浏览器要求 HTTPS 或 localhost 才能开摄像头；不满足时请改用截图/录屏回收。', en: 'The browser needs HTTPS or localhost for camera access; otherwise use screenshot/screen-recording salvage.' },
  );
}

async function openCamera(): Promise<MediaStream> {
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) throw cameraError(null);
  // 高分辨率优先：模块越多的码越吃像素；被拒时退回浏览器默认档位。
  const tries: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
    { audio: false, video: true },
  ];
  let last: unknown;
  for (const constraints of tries) {
    try {
      return await media.getUserMedia(constraints);
    } catch (error) {
      last = error;
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotFoundError') break;
    }
  }
  throw cameraError(last);
}

async function waitForFrame(video: HTMLVideoElement): Promise<void> {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) return;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  throw new ToolError(
    { zh: '摄像头已开启但没有画面', en: 'Camera started but no picture arrived' },
    { zh: '可能被系统隐私开关拦截，或该摄像头刚被别的程序占用。', en: 'A system privacy switch may be blocking it, or another app just took the device.' },
  );
}

function describeError(error: unknown): string {
  // DOMException（InvalidStateError/NotReadableError…）不是 Error 子类，只能按字段取
  if (error && typeof error === 'object' && 'name' in error) {
    const { name, message } = error as { name: string; message?: string };
    return `${name}: ${message ?? ''}`.slice(0, 120);
  }
  return String(error).slice(0, 120);
}

export async function startLiveQr({ video, onText, onStats, intervalMs = 120 }: LiveQrOptions): Promise<() => void> {
  const stream = await openCamera();
  const release = () => {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  };
  video.srcObject = stream;
  video.setAttribute('autoplay', 'true');
  video.setAttribute('muted', 'true');
  video.setAttribute('playsinline', 'true');
  try {
    await video.play();
  } catch {
    // play() 被拦时 autoplay 属性通常已让它开播；真正的判据是下面的画面是否到位
  }
  try {
    await waitForFrame(video);
  } catch (error) {
    release();
    throw error;
  }

  const jsQr = await loadJsQr();
  const zxing = await loadZxing().catch(() => null);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    release();
    throw new ToolError({ zh: '当前浏览器不支持 Canvas', en: 'Canvas is not supported in this browser' });
  }

  const stats: LiveQrStats = {
    attempts: 0,
    hits: 0,
    width: video.videoWidth,
    height: video.videoHeight,
    stalled: false,
    lastError: null,
  };
  let stopped = false;
  let timer = 0;
  let reportedAt = 0;
  let lastReport: LiveQrStats | null = null;

  // 状态有跃迁（读到码/卡画面/新错误）立刻上报，纯计数变化按 500ms 节流
  const report = () => {
    const changed = !lastReport
      || lastReport.stalled !== stats.stalled
      || lastReport.hits !== stats.hits
      || lastReport.lastError !== stats.lastError;
    if (!changed && Date.now() - reportedAt < 500) return;
    reportedAt = Date.now();
    lastReport = { ...stats };
    onStats?.(lastReport);
  };

  const tick = () => {
    if (stopped) return;
    stats.attempts += 1;
    const width = video.videoWidth;
    const height = video.videoHeight;
    try {
      if (width <= 0 || height <= 0 || video.readyState < 2) {
        // 画面还没就绪时 drawImage 会抛 InvalidStateError：这一帧作废，不做任何解码
        stats.stalled = true;
      } else {
        stats.stalled = false;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          stats.width = width;
          stats.height = height;
        }
        context.drawImage(video, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        const found = jsQr?.(data, width, height, { inversionAttempts: 'dontInvert' })?.data;
        const text = found || zxing?.decodeFromCanvas(canvas)?.getText();
        if (text) {
          stats.hits += 1;
          stats.lastError = null;
          onText(text);
        }
      }
    } catch (error) {
      stats.lastError = describeError(error);
    }
    report();
    if (!stopped) timer = window.setTimeout(tick, intervalMs);
  };

  timer = window.setTimeout(tick, 0);

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    release();
  };
}
