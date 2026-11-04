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
import { tl } from '@/i18n/locale';
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
  gzipBytes,
  makeSessionId,
  splitFrames,
  tuneFrameBytes,
} from '@/lib/qr-transfer';

type SourceKind = 'text' | 'file';
type Capacity = 'safe' | 'standard' | 'max';

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
  extra,
}: {
  index: number;
  total: number;
  playing: boolean;
  onIndex: (next: number) => void;
  onPlaying: (next: boolean) => void;
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <Button variant="secondary" size="sm" onClick={() => onIndex((index - 1 + total) % total)} aria-label={t({ zh: '上一帧', en: 'Previous frame' })}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button variant={playing ? 'secondary' : 'primary'} size="sm" onClick={() => onPlaying(!playing)}>
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

export function SendPanel({ active }: { active: boolean }) {
  const { t } = useI18n();
  const [source, setSource] = useState<SourceKind>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [gzip, setGzip] = useState(true);
  const [capacity, setCapacity] = useState<Capacity>('standard');
  const [ecc, setEcc] = useState<QrEcc>('M');
  const [presenting, setPresenting] = useState(false);
  const stageWidth = useStageWidth(presenting);
  const inlineStage = useStageWidth(false);
  const minModulePx = TIER_MIN_MODULE_PX[capacity];
  const [fps, setFps] = useState(2);
  const [loop, setLoop] = useState(true);
  const [sid, setSid] = useState(() => makeSessionId());
  const [payload, setPayload] = useState<{ bytes: Uint8Array; error: string | null }>({ bytes: new Uint8Array(0), error: null });
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pngBusy, setPngBusy] = useState(false);

  const textBytes = useMemo(() => new TextEncoder().encode(text), [text]);

  // —— 载荷：文本/文件 → 字节（可选 gzip） ——
  useEffect(() => {
    let cancelled = false;
    const raw = source === 'text' ? textBytes : (file?.bytes ?? new Uint8Array(0));
    if (raw.length === 0) {
      setPayload({ bytes: new Uint8Array(0), error: null });
      return undefined;
    }
    if (!gzip) {
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
  }, [source, textBytes, file, gzip]);

  const fileName = source === 'text' ? (text ? 'text-utf8.txt' : undefined) : file?.name;

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
        rawBytes: source === 'text' ? textBytes.length : file?.bytes.length,
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
  }, [payload, sid, capacity, minModulePx, ecc, fileName, source, textBytes, file, gzip, stageWidth]);

  const frames = prepared?.frames ?? [];
  const total = frames.length;

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
    const timer = window.setInterval(() => {
      setIndex((current) => {
        if (current + 1 < total) return current + 1;
        if (loop) return 0;
        setPlaying(false);
        return current;
      });
    }, Math.max(125, 1000 / fps));
    return () => window.clearInterval(timer);
  }, [playing, active, total, fps, loop]);

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
      setFile({ name: picked.name, bytes: new Uint8Array(buffer) });
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
                      label={t({ zh: 'Gzip 压缩（JSON 可省 60-80% 帧数）', en: 'Gzip (JSON typically saves 60-80% of frames)' })}
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
                  zh: '或点击选择 · 建议 < 200 KB；任何二进制都按字节原样切帧',
                  en: 'Or click to choose · under ~200 KB recommended; any binary is chunked byte-for-byte',
                })}
                onFiles={onFiles}
              />
              {file ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/40 px-3 py-2 text-xs text-ink-2">
                  <FileText className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-ink-3">{formatBytes(file.bytes.length, 0)}</span>
                  <Checkbox
                    checked={gzip}
                    onChange={setGzip}
                    label={t({ zh: 'Gzip 压缩', en: 'Gzip' })}
                    className="ml-auto text-xs"
                  />
                  <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                    {t({ zh: '移除', en: 'Remove' })}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
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
                  label: t({ zh: '预计', en: 'Est.' }),
                  value: `${estimatedSeconds >= 60 ? `${Math.floor(estimatedSeconds / 60)}m${Math.round(estimatedSeconds % 60)}s` : `${estimatedSeconds.toFixed(1)}s`}`,
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
