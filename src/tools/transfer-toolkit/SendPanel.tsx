import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { ImageDropzone } from '@/components/tool/ImageDropzone';
import { InputPanel, StatsBar } from '@/components/tool/EditorPanels';
import { CopyButton, DownloadButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useHotkey } from '@/hooks/useHotkey';
import { useI18n } from '@/i18n/I18nProvider';
import { toToolError } from '@/lib/errors';
import { bytesToBase64 } from '@/lib/base64';
import { tl, type Localized } from '@/i18n/locale';
import { formatBytes } from '@/lib/number';
import { safeFilename, downloadAll, downloadBlob } from '@/lib/download';
import {
  assessQrScan,
  canvasToPngBlob,
  createQrMatrix,
  crispQrRect,
  isQrCapacityError,
  maxModuleCountForScan,
  renderQrToCanvas,
  QR_DEFAULT_STYLE,
  type QrEcc,
  type QrMatrix,
} from '@/lib/qr';
import {
  DQX_LIMITS,
  gzipBytes,
  makeSessionId,
  sniffPayloadKind,
  splitFrames,
  tuneFrameBytes,
  type PayloadKind,
} from '@/lib/qr-transfer';
import { compressImage, loadImage, mimeToExtension, replaceExtension } from '@/lib/image';

type SourceKind = 'text' | 'file';
type Capacity = 'safe' | 'standard' | 'max';

/**
 * 图片重压预设：帧数只跟字节数成正比，而 JPEG/PNG/WebP 再 gzip 也只省 0-2%，
 * 所以传图真正的杠杆是重编码（限宽 + 有损质量），不是压缩。maxWidth 0 = 不重压。
 *
 * 实测（Chrome，2400×1600 噪点图 —— 压缩的最坏情况，真实照片还要小几倍）：
 * 1280px/0.62 → 290 KB → 行内 1321 帧、放映 203 帧；1600px/0.72 → 653 KB → 2973 / 456 帧。
 * 默认落在「省帧数」：越界的代价是接收端一帧都不收，比图像稍软严重得多。
 */
const IMAGE_PRESETS = [
  { id: 'tiny', maxWidth: 960, quality: 0.52 },
  { id: 'lean', maxWidth: 1280, quality: 0.62 },
  { id: 'balanced', maxWidth: 1600, quality: 0.72 },
  { id: 'sharp', maxWidth: 2400, quality: 0.82 },
  { id: 'off', maxWidth: 0, quality: 0.95 },
] as const;
type ImagePresetId = (typeof IMAGE_PRESETS)[number]['id'];

const IMAGE_PRESET_LABELS: Record<Exclude<ImagePresetId, 'off'>, Localized> = {
  tiny: { zh: '极省', en: 'Minimal' },
  lean: { zh: '省帧数', en: 'Lean' },
  balanced: { zh: '均衡', en: 'Balanced' },
  sharp: { zh: '高清', en: 'Sharp' },
};

// GIF 重压会丢掉动画帧；其余位图都能靠 canvas 重编码换来数量级更少的帧。
const REENCODABLE_IMAGE = /^image\/(jpeg|png|webp|bmp)$/;
const REENCODABLE_EXTENSION = ['jpg', 'jpeg', 'png', 'webp', 'bmp'];

function reencodableImage(file: File | null): boolean {
  if (!file) return false;
  if (REENCODABLE_IMAGE.test(file.type)) return true;
  return REENCODABLE_EXTENSION.includes(file.name.split('.').pop()?.toLowerCase() ?? '');
}

/**
 * 各容量档的字节天花板；真正的约束是「每模块至少几 CSS 像素」——
 * 相机分辨的是屏幕上的物理模块尺寸，canvas 后备像素再多也没用。
 */
const CAPACITY_BOUNDS: Record<Capacity, [number, number]> = {
  safe: [60, 800],
  standard: [60, 1500],
  max: [60, 2400],
};

const TIER_MIN_MODULE_PX: Record<Capacity, number> = { safe: 6, standard: 4, max: 3 };

/**
 * 行内舞台宽度：右侧 420px 列减去 Panel 的 p-4 与码框的 p-2，实测约 372px，
 * 取 16 的倍数留一点余量。窄屏手机上按视口估算收缩。
 */
const INLINE_STAGE_PX = 368;
/** 行内面板被页面与 Panel 内边距挤掉的宽度（粗略估算，窄屏手机上会把码挤小）。 */
const INLINE_STAGE_INSET_PX = 64;
/** 舞台宽度下限：再窄也只按它切帧，避免极窄视口把每帧压到几乎没有载荷。 */
const STAGE_MIN_PX = 176;
/** 下载 PNG 的目标宽度：与上屏宽度无关，导出始终按整数格取到高分辨率。 */
const PNG_EXPORT_PX = 1024;
/** 放映舞台：Modal 面板宽 min(90vw,90vh)，再扣掉 body 内边距、边框与安全余量。 */
const PRESENT_STAGE_INSET_PX = 32;
const STAGE_BUCKET_PX = 16;

function stageWidthFor(presenting: boolean): number {
  const smaller = Math.min(window.innerWidth, window.innerHeight);
  if (!Number.isFinite(smaller) || smaller <= 0) return INLINE_STAGE_PX;
  if (presenting) return smaller * 0.9 - PRESENT_STAGE_INSET_PX;
  return Math.min(INLINE_STAGE_PX, window.innerWidth - INLINE_STAGE_INSET_PX);
}

/** 分桶后的舞台宽度：拖动窗口/旋转屏幕不会让帧序列逐像素重切。 */
function stageBucketWidth(presenting: boolean): number {
  const raw = stageWidthFor(presenting);
  return Math.max(STAGE_MIN_PX, Math.floor(raw / STAGE_BUCKET_PX) * STAGE_BUCKET_PX);
}

function useStageWidth(presenting: boolean): number {
  const [width, setWidth] = useState(() => stageBucketWidth(presenting));
  useEffect(() => {
    const sync = () => setWidth(stageBucketWidth(presenting));
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, [presenting]);
  return width;
}

/** 一帧二维码按显示宽度取整数格绘制：1 模块 = 整数设备像素，不重采样就不会发糊。 */
function QrStage({ matrix, stageWidth, label, className }: { matrix: QrMatrix; stageWidth: number; label: string; className?: string }) {
  const dpr = window.devicePixelRatio || 1;
  const { size, cssSize } = useMemo(() => crispQrRect(matrix.moduleCount, stageWidth, dpr), [matrix.moduleCount, stageWidth, dpr]);
  const source = useMemo(() => renderQrToCanvas(matrix, { ...QR_DEFAULT_STYLE, size }), [matrix, size]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvasRef.current;
    if (!target) return;
    target.width = source.width;
    target.height = source.height;
    const context = target.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, target.width, target.height);
    context.drawImage(source, 0, 0);
  }, [source]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: cssSize, maxWidth: '100%', aspectRatio: '1 / 1' }}
      aria-label={label}
    />
  );
}

interface Prepared {
  frames: string[];
  frameBytes: number;
  version: number;
}

/** 重压后的图片载荷：bytes 直接进切帧流程，note 用于把「换小了多少」摆在明面上。 */
interface EncodedImage {
  bytes: Uint8Array;
  name: string;
  fromBytes: number;
  toBytes: number;
  note: string;
}

/**
 * 探针的填充段必须和真实帧一样是「混合大小写 + 数字 + /+ 的 Base64」。
 * 全 'A' 会让编码器把整段切进 alphanumeric 模式（5.5 bit/字符），而真实帧的 Base64
 * 走 byte 模式（8 bit/字符）——探针以为装得下的长度，真实帧会密上两个版本，正好是「太密扫不出」的第二条根因。
 */
function probeFiller(frameBytes: number): string {
  const pattern = new Uint8Array(Math.max(0, frameBytes));
  for (let i = 0; i < pattern.length; i += 1) pattern[i] = (i * 31 + 7) % 256;
  return bytesToBase64(pattern).replace(/=+$/, '');
}

/** 逐帧控制条：行内面板与放映共用，放映时只是把码放大、不换一套交互。 */
function FrameControls({
  index,
  total,
  playing,
  onIndex,
  onPlaying,
  playBlocked,
  extra,
}: {
  index: number;
  total: number;
  playing: boolean;
  onIndex: (next: number) => void;
  onPlaying: (next: boolean) => void;
  playBlocked?: boolean;
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <Button variant="secondary" size="sm" onClick={() => onIndex((index - 1 + total) % total)} aria-label={t({ zh: '上一帧', en: 'Previous frame' })}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant={playing ? 'secondary' : 'primary'}
        size="sm"
        disabled={playBlocked}
        title={playBlocked ? t({ zh: '帧数超过接收端上限，先按下方提示减帧', en: 'Frame count exceeds the receiver limit — cut frames first' }) : undefined}
        onClick={() => onPlaying(!playing)}
      >
        {playing ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
        {playing ? t({ zh: '暂停', en: 'Pause' }) : t({ zh: '播放', en: 'Play' })}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => onIndex((index + 1) % total)} aria-label={t({ zh: '下一帧', en: 'Next frame' })}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      {extra}
    </div>
  );
}

/** splitFrames 之前的载荷字节：文本、原图/原文件，或重压后的图片。 */
const EMPTY_BYTES = new Uint8Array(0);

export function SendPanel({ active }: { active: boolean }) {
  const { t } = useI18n();
  const [source, setSource] = useState<SourceKind>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array; handle: File | null } | null>(null);
  const [preset, setPreset] = useState<ImagePresetId>('lean');
  const [encoded, setEncoded] = useState<EncodedImage | null>(null);
  const [encodeNote, setEncodeNote] = useState<string | null>(null);
  const [gzip, setGzip] = useState(true);
  const [capacity, setCapacity] = useState<Capacity>('standard');
  const [ecc, setEcc] = useState<QrEcc>('M');
  const [presenting, setPresenting] = useState(false);
  const stageWidth = useStageWidth(presenting);
  const inlineStage = useStageWidth(false);
  const presentStage = useStageWidth(true);
  const minModulePx = TIER_MIN_MODULE_PX[capacity];
  const [fps, setFps] = useState(2);
  const [loop, setLoop] = useState(true);
  const [sid, setSid] = useState(() => makeSessionId());
  const [payload, setPayload] = useState<{ bytes: Uint8Array; error: string | null }>({ bytes: new Uint8Array(0), error: null });
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pngBusy, setPngBusy] = useState(false);

  const textBytes = useMemo(() => new TextEncoder().encode(text), [text]);

  // —— 图片重压：帧数只跟字节数成正比，先把图换小才是省帧的正解 ——
  const canRecompress = reencodableImage(file?.handle ?? null);
  const recompressing = source === 'file' && canRecompress && preset !== 'off';
  useEffect(() => {
    const handle = file?.handle;
    if (!recompressing || !handle) {
      setEncoded(null);
      setEncodeNote(null);
      return undefined;
    }
    let cancelled = false;
    let bitmap: ImageBitmap | HTMLImageElement | null = null;
    const settings = IMAGE_PRESETS.find((item) => item.id === preset)!;
    setEncodeNote(t({ zh: '正在重压图片…', en: 'Re-encoding image…' }));
    void (async () => {
      try {
        bitmap = await loadImage(handle);
        const outcome = await compressImage(
          bitmap,
          { kind: 'smart' },
          { maxWidth: settings.maxWidth, quality: settings.quality, background: '#ffffff' },
        );
        const bytes = new Uint8Array(await outcome.blob.arrayBuffer());
        if (cancelled) return;
        const extension = mimeToExtension(outcome.mime);
        // 已经压得很死的图（如小尺寸调色板 PNG）重编码可能反而变大：那就别压，原图帧数更少
        if (bytes.length >= handle.size) {
          setEncoded(null);
          setEncodeNote(
            t({
              zh: `重压后 ${formatBytes(bytes.length, 0)} 比原图 ${formatBytes(handle.size, 0)} 还大，按原图发送。`,
              en: `Re-encoded to ${formatBytes(bytes.length, 0)}, bigger than the ${formatBytes(handle.size, 0)} original — sending it as-is.`,
            }),
          );
          return;
        }
        setEncoded({
          bytes,
          name: replaceExtension(handle.name, extension),
          fromBytes: handle.size,
          toBytes: bytes.length,
          note: `${outcome.width}×${outcome.height} · ${extension.toUpperCase()}`,
        });
        setEncodeNote(null);
      } catch (error) {
        if (cancelled) return;
        setEncoded(null);
        setEncodeNote(t(toToolError(error).localized));
      }
    })();
    return () => {
      cancelled = true;
      if (bitmap && 'close' in bitmap) bitmap.close();
    };
    // t 只在语言切换时变，届时重算一次文案与产物即可
  }, [file, recompressing, preset, t]);

  const payloadSource = source === 'text' ? textBytes : (encoded?.bytes ?? file?.bytes ?? EMPTY_BYTES);

  // —— 载荷：文本/文件 → 字节（可选 gzip；重压过的图片已是压缩格式，gzip 只白费一遍） ——
  useEffect(() => {
    let cancelled = false;
    const raw = payloadSource;
    if (raw.length === 0) {
      setPayload({ bytes: new Uint8Array(0), error: null });
      return undefined;
    }
    if (!gzip || encoded) {
      setPayload({ bytes: raw, error: null });
      return undefined;
    }
    gzipBytes(raw)
      .then((compressed) => {
        if (!cancelled) setPayload({ bytes: compressed, error: null });
      })
      .catch((error) => {
        if (!cancelled) setPayload({ bytes: raw, error: tl(toToolError(error).localized, 'zh') });
      });
    return () => {
      cancelled = true;
    };
  }, [payloadSource, gzip, encoded]);

  const fileName = source === 'text' ? (text ? 'text-utf8.txt' : undefined) : (encoded?.name ?? file?.name);

  // —— 载荷类型：只改「这句该怎么说」，不改任何行为 ——
  const payloadKind = useMemo<PayloadKind | null>(
    () => (payloadSource.length === 0 ? null : source === 'text' ? 'text' : sniffPayloadKind(payloadSource)),
    [payloadSource, source],
  );

  // 帧数只跟字节数成正比，而「再压一遍值不值」完全取决于载荷是不是已经压过：
  // 文本实测省 80-86%，zip/Office 容器只有 ~13%，图像基本 0。没勾 Gzip 就给经验值，
  // 勾了就把实测数字摆出来（容器可能反而涨，也照实说）。
  const compressionHint = useMemo<Localized | null>(() => {
    if (!payloadKind || encoded || payload.bytes.length === 0) return null;
    const before = payloadSource.length;
    if (!gzip) {
      if (payloadKind === 'text') {
        return {
          zh: '文本类：勾上 Gzip 实测能省 80-86%，帧数除以五到六倍。',
          en: 'Text: gzip typically saves 80-86% — five to six times fewer frames.',
        };
      }
      if (payloadKind === 'container') {
        return {
          zh: 'zip / Office 容器（docx、xlsx、pptx、jar…）内部已经 deflate 过，再 Gzip 约省 10-15%，仍值得勾上。',
          en: 'ZIP/Office containers (docx, xlsx, pptx, jar…) are already deflated; re-gzipping still buys 10-15%, so keep it checked.',
        };
      }
      if (payloadKind === 'image') {
        // 能重压的图片，那一行已经在「图片重压」旁边；只有 GIF 这类压不动的才在这里说话
        return canRecompress
          ? null
          : {
              zh: '图像字节已经压死，Gzip 帮不上；要减帧只能换更小的图。',
              en: 'Image bytes are already packed, so gzip adds nothing — use a smaller picture to cut frames.',
            };
      }
      return null;
    }
    const after = payload.bytes.length;
    const measured = `${formatBytes(before, 0)} → ${formatBytes(after, 0)}（${after <= before ? '−' : '+'}${Math.round(
      Math.abs(after / before - 1) * 100,
    )}%）`;
    if (payloadKind === 'container') {
      return after >= before
        ? {
            zh: `容器内部已经压过，Gzip 实测 ${measured}：再压不划算。要减帧只能抽掉包里的媒体，或改走「局域网互传」。`,
            en: `The container is already packed — gzip measured ${measured}. Strip its media or use LAN transfer to cut frames.`,
          }
        : {
            zh: `容器内部已经压过，Gzip 实测 ${measured}；想再降一个量级得抽掉包里的媒体，或改走「局域网互传」。`,
            en: `Already-deflated container: gzip measured ${measured}. An order of magnitude more means stripping its media or switching to LAN transfer.`,
          };
    }
    if (payloadKind === 'image') {
      return {
        zh: `图像 Gzip 实测 ${measured}：字节已经压死，减帧靠重压或换更小的图，不靠压缩。`,
        en: `Image gzip measured ${measured} — bytes are already packed; re-encode or shrink instead.`,
      };
    }
    if (payloadKind === 'text') {
      return {
        zh: `文本 Gzip 实测 ${measured}，帧数按同比例往下走。`,
        en: `Text gzip measured ${measured}; frames drop by the same factor.`,
      };
    }
    return null;
  }, [payloadKind, encoded, gzip, payloadSource, payload.bytes, canRecompress]);

  // —— 单帧容量：用与真实帧等长的探针文本过 createQrMatrix，二分出最大载荷字节 ——
  const prepared = useMemo<Prepared | null>(() => {
    if (payload.bytes.length === 0) return null;
    const metaProbe = fileName
      ? `:${bytesToBase64(new TextEncoder().encode(JSON.stringify({ f: fileName, r: 999999999, g: 1 })))}`
      : '';
    const fits = (bytes: number, digits: number) => {
      if (bytes < 3) return false;
      const position = `${'0'.repeat(digits)}of${'0'.repeat(digits)}`;
      const probe = `DQX1:${sid}${metaProbe}:${position}:${probeFiller(bytes)}:01234567`;
      try {
        // 密度上限按「码实际显示的那一步宽度」算：每模块低于下限像素时相机与 zxing 都会漏检
        const matrix = createQrMatrix(probe, ecc);
        return matrix.moduleCount <= maxModuleCountForScan(stageWidth, minModulePx);
      } catch (error) {
        return !isQrCapacityError(error);
      }
    };
    // 帧文本长度依赖总帧数的位数：从预估位数出发，迭代到不动点。
    let digits = Math.max(3, Math.ceil(Math.log2(payload.bytes.length / 60 + 2)));
    let split: { frames: string[]; frameBytes: number } | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const frameBytes = tuneFrameBytes(60, CAPACITY_BOUNDS[capacity][1], (bytes) => fits(bytes, digits));
      if (frameBytes === 0) return null;
      split = splitFrames(payload.bytes, {
        sid,
        frameBytes,
        fileName,
        rawBytes: payloadSource.length,
        gzipped: gzip && payload.bytes[0] === 0x1f && payload.bytes[1] === 0x8b,
      });
      const actual = String(split.frames.length).length;
      if (actual <= digits) break;
      digits = actual;
      split = null;
    }
    if (!split) return null;
    let version = 0;
    try {
      // 取第 1 帧而不是末帧：末帧只装余下的零头，密度偏低，读数会骗人
      version = createQrMatrix(split.frames[0], ecc).version;
    } catch {
      version = 0;
    }
    return { frames: split.frames, frameBytes: split.frameBytes, version };
  }, [payload, sid, capacity, minModulePx, ecc, fileName, payloadSource, gzip, stageWidth]);

  const frames = prepared?.frames ?? [];
  const total = frames.length;
  // 接收端按 maxTotalFrames 拒帧（parseFrame 直接判 null），所以超上限的码一帧都收不到，
  // 与其让人扫半天，不如在这里就挡住播放并把出路摆出来。
  const overFrameCap = total > DQX_LIMITS.maxTotalFrames;

  // 换内容、换档位/容错、或舞台宽度变了（放映开关、旋转屏幕）都是另一次传输：
  // 帧的切法随之改变，必须换 sid 并回到第 1 帧，否则接收端会把新帧判成旧会话的冲突帧丢掉。
  useEffect(() => {
    setSid(makeSessionId());
    setIndex(0);
    setPlaying(false);
  }, [payload.bytes, capacity, ecc, stageWidth]);

  // —— 帧号钳制 ——
  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(0, total - 1)));
  }, [total]);

  // —— 播放 ——
  useEffect(() => {
    if (!playing || !active || total === 0) return undefined;
    // 帧数越界时不只在定时器里跳过：连播放态一起撤掉，否则按出来的会停不掉
    if (overFrameCap) {
      setPlaying(false);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setIndex((current) => {
        if (current + 1 < total) return current + 1;
        if (loop) return 0;
        setPlaying(false);
        return current;
      });
    }, Math.max(125, 1000 / fps));
    return () => window.clearInterval(timer);
  }, [playing, active, total, fps, loop, overFrameCap]);

  useHotkey(
    { key: 'ArrowRight', metaOrCtrl: true, enabled: active && total > 0 },
    () => setIndex((current) => (current + 1) % total),
  );
  useHotkey(
    { key: 'ArrowLeft', metaOrCtrl: true, enabled: active && total > 0 },
    () => setIndex((current) => (current - 1 + total) % total),
  );

  const currentMatrix = useMemo(() => {
    if (!frames[index]) return null;
    try {
      return createQrMatrix(frames[index], ecc);
    } catch {
      return null;
    }
  }, [frames, index, ecc]);

  // 密度读数看最密的那一帧（末帧只会更疏），版本 → 模块数 = 4V+17，再加 8 格静区
  const scan = useMemo(() => {
    if (!prepared || !prepared.version) return null;
    return assessQrScan(4 * prepared.version + 17, stageWidth, minModulePx);
  }, [prepared, stageWidth, minModulePx]);

  const manifest = frames.join('\n');
  const estimatedSeconds = total > 0 ? total / fps : 0;

  const startOver = () => {
    setSid(makeSessionId());
    setIndex(0);
    setPlaying(false);
  };

  const onFiles = (files: FileList | File[]) => {
    const picked = files[0];
    if (!picked) return;
    void picked.arrayBuffer().then((buffer) => {
      setEncoded(null);
      setEncodeNote(null);
      // 留一份 File 句柄：重压图片要靠它解码，只有字节是回不去原图的
      setFile({ name: picked.name, bytes: new Uint8Array(buffer), handle: picked });
    });
  };

  const exportPngs = async () => {
    if (!prepared || pngBusy) return;
    setPngBusy(true);
    try {
      const items = [];
      for (let i = 0; i < frames.length; i += 1) {
        const matrix = createQrMatrix(frames[i], ecc);
        const { size } = crispQrRect(matrix.moduleCount, PNG_EXPORT_PX, 1);
        const canvas = renderQrToCanvas(matrix, { ...QR_DEFAULT_STYLE, size });
        const blob = await canvasToPngBlob(canvas);
        items.push({ filename: `dqx-${sid}-${String(i).padStart(3, '0')}of${total}.png`, blob });
      }
      await downloadAll(items, 250);
    } finally {
      setPngBusy(false);
    }
  };

  const downloadPayload = () => {
    if (payload.bytes.length === 0) return;
    const name = safeFilename(fileName ?? 'payload', 'payload') + (gzip && payload.bytes[0] === 0x1f ? '.gz' : '.bin');
    downloadBlob(name, new Blob([(payload.bytes.slice().buffer as ArrayBuffer)], { type: 'application/octet-stream' }));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4">
        <Panel
          title={t({ zh: '发送内容', en: 'Payload' })}
          actions={
            <Segmented<SourceKind>
              size="sm"
              value={source}
              onChange={setSource}
              ariaLabel={t({ zh: '数据来源', en: 'Payload source' })}
              options={[
                { value: 'text', label: t({ zh: '文本', en: 'Text' }) },
                { value: 'file', label: t({ zh: '文件', en: 'File' }) },
              ]}
            />
          }
          bodyClassName="p-4"
        >
          {source === 'text' ? (
            <div className="h-[300px]">
              <InputPanel
                label={t({ zh: '文本', en: 'Text' })}
                value={text}
                onChange={setText}
                placeholder={t({
                  zh: '粘贴要传输的 JSON、配置或任意文本…',
                  en: 'Paste the JSON, config, or any text to transfer…',
                })}
                minHeight={220}
                footer={
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatsBar
                      items={[
                        { label: t({ zh: '字符', en: 'Chars' }), value: text.length },
                        { label: t({ zh: '原始字节', en: 'Raw bytes' }), value: formatBytes(textBytes.length, 0) },
                      ]}
                    />
                    <Checkbox
                      checked={gzip}
                      onChange={setGzip}
                      label={t({ zh: 'Gzip 压缩', en: 'Gzip' })}
                      className="text-xs"
                    />
                  </div>
                }
              />
            </div>
          ) : (
            <div className="space-y-3">
              <ImageDropzone
                multiple={false}
                accept="*/*"
                icon={<Upload className="h-5 w-5" aria-hidden="true" />}
                title={t({ zh: '拖入要传输的文件', en: 'Drop the file to transfer' })}
                hint={t({
                  zh: '或点击选择 · 图片会先按所选档位重压（帧数只跟字节数成正比），其余二进制按字节切帧',
                  en: 'Or click to choose · images are re-encoded at the preset you pick (frames scale with bytes), any other binary is chunked byte-for-byte',
                })}
                onFiles={onFiles}
              />
              {file ? (
                <div className="space-y-2 rounded-xl border border-line bg-surface-2/40 px-3 py-2 text-xs text-ink-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                    <span className="font-medium">{encoded?.name ?? file.name}</span>
                    <span className="text-ink-3">{formatBytes(file.bytes.length, 0)}</span>
                    <Checkbox
                      checked={gzip && !encoded}
                      onChange={setGzip}
                      disabled={Boolean(encoded)}
                      label={
                        encoded
                          ? t({ zh: '已重压，无需 Gzip', en: 'Re-encoded, no Gzip' })
                          : t({ zh: 'Gzip 压缩', en: 'Gzip' })
                      }
                      className="ml-auto text-xs"
                    />
                    <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                      {t({ zh: '移除', en: 'Remove' })}
                    </Button>
                  </div>
                  {canRecompress ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor="dqx-image-preset" className="text-ink-3">
                        {t({ zh: '图片重压', en: 'Re-encode' })}
                      </label>
                      <Select
                        id="dqx-image-preset"
                        name="dqx-image-preset"
                        aria-label={t({ zh: '图片重压', en: 'Re-encode image' })}
                        value={preset}
                        onChange={(event) => setPreset(event.target.value as ImagePresetId)}
                        wrapperClassName="w-[176px]"
                      >
                        {IMAGE_PRESETS.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.id === 'off'
                              ? t({ zh: '原图（帧数最多）', en: 'Original (most frames)' })
                              : `${t(IMAGE_PRESET_LABELS[item.id])} · ${item.maxWidth}px`}
                          </option>
                        ))}
                      </Select>
                      {encoded ? (
                        <span className="font-mono text-[11px] text-ink-2">
                          {formatBytes(encoded.fromBytes, 0)} → {formatBytes(encoded.toBytes, 0)}
                          {encoded.fromBytes > 0 ? `（−${Math.round((1 - encoded.toBytes / encoded.fromBytes) * 100)}%）` : ''}
                          {' · '}
                          {encoded.note}
                        </span>
                      ) : encodeNote ? (
                        <span className="text-[11px] text-ink-3">{encodeNote}</span>
                      ) : null}
                    </div>
                  ) : file.handle?.type === 'image/gif' ? (
                    <p className="text-[11px] leading-5 text-ink-3">
                      {t({
                        zh: 'GIF 重压会丢掉动画帧，按原图字节发送。',
                        en: 'Re-encoding a GIF would drop its animation frames, so it goes out byte-for-byte.',
                      })}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
          {compressionHint ? <p className="text-[11px] leading-5 text-ink-3">{t(compressionHint)}</p> : null}
        </Panel>

        <Panel
          title={t({ zh: '发码设置', en: 'Playback settings' })}
          subtitle={t({ zh: '容量越大帧数越少，但对相机要求越高', en: 'Larger frames mean fewer scans but demand a better camera' })}
          bodyClassName="p-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-ink-3">{t({ zh: '单帧容量', en: 'Frame capacity' })}</label>
              <Segmented<Capacity>
                size="sm"
                className="mt-1.5"
                value={capacity}
                onChange={setCapacity}
                ariaLabel={t({ zh: '单帧容量', en: 'Frame capacity' })}
                options={[
                  { value: 'safe', label: t({ zh: '稳妥', en: 'Safe' }) },
                  { value: 'standard', label: t({ zh: '标准', en: 'Standard' }) },
                  { value: 'max', label: t({ zh: '极限', en: 'Max' }) },
                ]}
              />
              <p className="mt-1 text-[11px] leading-5 text-ink-3">
                {capacity === 'max'
                  ? t({
                      zh: `每模块需 ≥${minModulePx}px：行内窄屏会自动切出更疏的帧，点「放映」才吃得到极限吞吐`,
                      en: `Needs ≥${minModulePx}px per module: a narrow panel splits sparser frames on its own — hit Present to actually reach Max throughput`,
                    })
                  : capacity === 'safe'
                    ? t({ zh: `每模块 ≥${minModulePx}px：隔一两米也能扫，代价是帧数最多`, en: `≥${minModulePx}px per module: scannable from a meter or two, at the cost of the most frames` })
                    : t({ zh: `每模块 ≥${minModulePx}px：对着屏幕扫的日常平衡档`, en: `≥${minModulePx}px per module: the everyday balance for scanning a screen` })}
              </p>
            </div>
            <div>
              <label htmlFor="dqx-ecc" className="text-xs text-ink-3">
                {t({ zh: '容错级别', en: 'Error correction' })}
              </label>
              <Select
                id="dqx-ecc"
                value={ecc}
                onChange={(event) => setEcc(event.target.value as QrEcc)}
                wrapperClassName="mt-1.5 w-full"
              >
                {(['L', 'M', 'Q', 'H'] as const).map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[11px] leading-5 text-ink-3">
                {t({ zh: 'L 容量最大；屏幕干净时推荐 L/M', en: 'L carries the most data; prefer L/M on a clean screen' })}
              </p>
            </div>
            <div>
              <label htmlFor="dqx-fps" className="text-xs text-ink-3">
                {t({ zh: '播放速度', en: 'Playback speed' })}
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="dqx-fps"
                  type="range"
                  min={0.5}
                  max={8}
                  step={0.5}
                  value={fps}
                  onChange={(event) => setFps(Number(event.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
                <span className="w-16 shrink-0 text-right font-mono text-xs text-ink-2">{fps} fps</span>
              </div>
            </div>
            <div className="flex items-end gap-4 pb-1">
              <Checkbox checked={loop} onChange={setLoop} label={t({ zh: '循环播放', en: 'Loop' })} className="text-xs" />
            </div>
          </div>
          <p className="mt-3 border-t border-dashed border-line pt-2.5 text-[11px] leading-5 text-ink-3">
            {t({
              zh: '每帧装多少字节由码实际显示的那一步宽度自动决定：屏幕越小切得越细。要少扫几帧就点「放映」，把码放大到接近全屏（会重开一个新会话）。',
              en: 'Bytes per frame follow the width the code is actually shown at — a smaller stage splits finer. Hit Present to grow the code to near-full-screen and send fewer frames (this starts a new session).',
            })}
          </p>
        </Panel>

        {payload.error ? <ToolAlert tone="warning" title={payload.error} /> : null}
        {!prepared && payload.bytes.length > 0 ? (
          <ToolAlert
            tone="error"
            title={t({ zh: '这一步太窄，装不下任何一帧', en: 'This stage is too narrow to fit even one frame' })}
            hint={t({
              zh: `舞台只有 ${Math.round(stageWidth)}px，而每模块 ≥${minModulePx}px 的要求把帧文本挤没了：把容量档降到「标准/极限」、容错降到 L，或点「放映」换个更宽的舞台。`,
              en: `The stage is only ${Math.round(stageWidth)}px, so the ≥${minModulePx}px-per-module rule leaves no room for payload: drop to the Standard/Max tier, use L error correction, or press Present for a wider stage.`,
            })}
          />
        ) : null}
        {prepared && overFrameCap ? (
          <ToolAlert
            tone="error"
            title={t({
              zh: `帧数 ${total} 超过接收端上限 ${DQX_LIMITS.maxTotalFrames}，这些码一帧都不会被收下`,
              en: `${total} frames exceed the receiver's limit of ${DQX_LIMITS.maxTotalFrames} — not one frame would be accepted`,
            })}
            hint={t({
              zh: `每帧 ${formatBytes(prepared.frameBytes, 0)}，一轮最多载 ${formatBytes(prepared.frameBytes * DQX_LIMITS.maxTotalFrames, 0)}。按效果排序：①图片用上面「图片重压」换小；②点「放映」，舞台涨到约 ${Math.round(presentStage)}px，本档每帧可吃满 ${CAPACITY_BOUNDS[capacity][1]}B；③容量档换「极限」（上限 ${CAPACITY_BOUNDS.max[1]}B/帧）；④仍不够就拆成几次会话，或直接「下载载荷」用 U 盘带走。`,
              en: `At ${formatBytes(prepared.frameBytes, 0)} per frame one pass carries at most ${formatBytes(prepared.frameBytes * DQX_LIMITS.maxTotalFrames, 0)}. In order of impact: 1) re-encode the image above; 2) press Present — the stage grows to about ${Math.round(presentStage)}px and this tier fills up to ${CAPACITY_BOUNDS[capacity][1]}B per frame; 3) switch to the Max tier (${CAPACITY_BOUNDS.max[1]}B/frame); 4) split into several sessions, or take Download payload and carry it on a USB stick.`,
            })}
          />
        ) : null}
      </div>

      <Panel
        title={t({ zh: '二维码播放', en: 'QR playback' })}
        subtitle={
          prepared
            ? t({ zh: `会话 ${sid} · 第 ${index + 1}/${total} 帧`, en: `Session ${sid} · frame ${index + 1}/${total}` })
            : t({ zh: '准备好内容后自动生成帧序列', en: 'Frames appear once content is ready' })
        }
        bodyClassName="p-4"
        footer={
          prepared ? (
            <StatsBar
              items={[
                { label: t({ zh: '帧数', en: 'Frames' }), value: total },
                { label: t({ zh: '每帧字节', en: 'B/frame' }), value: formatBytes(prepared.frameBytes, 0) },
                { label: t({ zh: '载荷', en: 'Payload' }), value: formatBytes(payload.bytes.length, 0) },
                { label: t({ zh: '版本', en: 'Version' }), value: prepared.version ? `V${prepared.version}` : '-' },
                { label: t({ zh: '模块', en: 'Module' }), value: scan ? `${scan.modulePx.toFixed(2)}px` : '-' },
                {
                  label: t({ zh: '预计耗时', en: 'Est. time' }),
                  // 越界的话一轮根本扫不完，估时就没有意义，只标「拦住」
                  value: overFrameCap
                    ? t({ zh: '已被上限拦住', en: 'blocked by cap' })
                    : estimatedSeconds >= 60
                      ? t({
                          zh: `${Math.floor(estimatedSeconds / 60)} 分 ${Math.round(estimatedSeconds % 60)} 秒`,
                          en: `${Math.floor(estimatedSeconds / 60)}m ${Math.round(estimatedSeconds % 60)}s`,
                        })
                      : t({
                          zh: `${estimatedSeconds.toFixed(1)} 秒`,
                          en: `${estimatedSeconds.toFixed(1)}s`,
                        }),
                },
              ]}
            />
          ) : undefined
        }
      >
        {prepared ? (
          <div className="space-y-3">
            {currentMatrix ? (
              <div className="flex justify-center rounded-xl border border-line bg-white p-2">
                <QrStage
                  matrix={currentMatrix}
                  stageWidth={inlineStage}
                  className="block rounded-lg"
                  label={t({ zh: '当前二维码帧', en: 'Current QR frame' })}
                />
              </div>
            ) : null}
            {scan && !scan.ok ? (
              <ToolAlert
                tone="warning"
                title={t({
                  zh: `每模块只有 ${scan.modulePx.toFixed(2)}px，手机很难扫出来`,
                  en: `Only ${scan.modulePx.toFixed(2)}px per module — a phone can barely resolve it`,
                })}
                hint={t({
                  zh: `当前档位要求每模块 ≥${minModulePx}px：点「放映」把码放大，或降低容量档/容错级别重切帧。`,
                  en: `This tier wants ≥${minModulePx}px per module: press Present to enlarge the code, or lower the capacity tier / error correction to re-split the frames.`,
                })}
              />
            ) : null}
            <FrameControls
              index={index}
              total={total}
              playing={playing}
              onIndex={setIndex}
              onPlaying={setPlaying}
              playBlocked={overFrameCap}
              extra={
                <>
                  <Button variant="secondary" size="sm" onClick={() => setPresenting(true)}>
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t({ zh: '放映', en: 'Present' })}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={startOver}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    {t({ zh: '新会话', en: 'New session' })}
                  </Button>
                </>
              }
            />
            <p className="text-center text-[11px] text-ink-3">
              {t({ zh: '⌘/Ctrl + ←/→ 也可逐帧步进；对端摄像头对准屏幕上最大的那张码即可自动收集', en: '⌘/Ctrl + ←/→ also steps frames; point the peer camera at the largest copy of the code' })}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-line pt-3">
              <CopyButton text={manifest} label={t({ zh: '复制帧清单', en: 'Copy frames' })} />
              <DownloadButton
                filename={`dqx-${sid}-frames.txt`}
                content={manifest}
                label={t({ zh: '帧清单 .txt', en: 'Frame list' })}
              />
              <Button variant="secondary" size="sm" onClick={() => void exportPngs()} disabled={pngBusy}>
                {pngBusy ? t({ zh: '导出 PNG…', en: 'Exporting PNGs…' }) : t({ zh: '下载全部帧 PNG', en: 'Download all PNGs' })}
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadPayload}>
                {t({ zh: '下载载荷 .bin', en: 'Download payload' })}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-6 text-center" style={{ minHeight: 320 }}>
            <Play className="h-8 w-8 text-ink-3" aria-hidden="true" />
            <p className="text-sm font-medium text-ink">{t({ zh: '等待内容', en: 'Waiting for content' })}</p>
            <p className="max-w-sm text-xs leading-5 text-ink-3">
              {t({
                zh: '粘贴文本或选择文件后，这里会显示第一帧二维码；点「播放」开始逐帧发送。',
                en: 'Paste text or pick a file and the first frame appears here; hit Play to start sending.',
              })}
            </p>
          </div>
        )}
      </Panel>

      <Modal
        open={presenting}
        onClose={() => setPresenting(false)}
        title={t({ zh: `放映中 · 第 ${index + 1}/${total} 帧`, en: `Presenting · frame ${index + 1}/${total}` })}
        description={
          scan
            ? t({
                zh: `会话 ${sid} · 舞台 ${Math.round(stageWidth)}px · 每模块 ${scan.modulePx.toFixed(2)}px`,
                en: `Session ${sid} · ${Math.round(stageWidth)}px stage · ${scan.modulePx.toFixed(2)}px per module`,
              })
            : t({ zh: `会话 ${sid}`, en: `Session ${sid}` })
        }
        className="max-w-[min(90vw,90vh)]"
        bodyClassName="p-3"
      >
        {currentMatrix ? (
          <div className="space-y-3">
            <div className="flex justify-center rounded-xl bg-white p-2">
              <QrStage
                matrix={currentMatrix}
                stageWidth={stageWidth}
                className="block rounded-lg"
                label={t({ zh: '放映中的二维码帧', en: 'Presented QR frame' })}
              />
            </div>
            <FrameControls
              index={index}
              total={total}
              playing={playing}
              onIndex={setIndex}
              onPlaying={setPlaying}
              playBlocked={overFrameCap}
              extra={
                <Button variant="ghost" size="sm" onClick={() => setPresenting(false)}>
                  {t({ zh: '退出放映', en: 'Exit presentation' })}
                </Button>
              }
            />
            <p className="text-center text-[11px] leading-5 text-ink-3">
              {t({
                zh: 'Esc 退出放映，⌘/Ctrl + ←/→ 逐帧步进。舞台变宽后每帧装得更多，帧序列会重切并开一个新会话，接收端会跟着收新帧。',
                en: 'Esc exits, ⌘/Ctrl + ←/→ steps. A wider stage carries more per frame, so frames are re-split under a new session and the peer starts collecting the new ones.',
              })}
            </p>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-ink-3">
            {t({ zh: '还没有可放映的二维码：先准备内容。', en: 'Nothing to present yet: prepare the content first.' })}
          </p>
        )}
      </Modal>
    </div>
  );
}
