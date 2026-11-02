import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
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
  canvasToPngBlob,
  createQrMatrix,
  isQrCapacityError,
  normalizeQrSize,
  renderQrToCanvas,
  QR_DEFAULT_STYLE,
  type QrEcc,
} from '@/lib/qr';
import {
  gzipBytes,
  makeSessionId,
  splitFrames,
  tuneFrameBytes,
} from '@/lib/qr-transfer';

type SourceKind = 'text' | 'file';
type Capacity = 'safe' | 'standard' | 'max';

/** 各容量档的二分上界（载荷字节/帧）；实际还受「显示尺寸下模块 ≥4px」封顶。 */
const CAPACITY_BOUNDS: Record<Capacity, [number, number]> = {
  safe: [60, 800],
  standard: [60, 1500],
  max: [60, 2400],
};

interface Prepared {
  frames: string[];
  frameBytes: number;
  version: number;
}

export function SendPanel({ active }: { active: boolean }) {
  const { t } = useI18n();
  const [source, setSource] = useState<SourceKind>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [gzip, setGzip] = useState(true);
  const [capacity, setCapacity] = useState<Capacity>('standard');
  const [ecc, setEcc] = useState<QrEcc>('M');
  const [displaySize, setDisplaySize] = useState(512);
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
      const probe = `DQX1:${sid}${metaProbe}:${position}:${'A'.repeat(Math.ceil((bytes / 3) * 4))}:01234567`;
      try {
        // 显示尺寸下模块不足 4px 时，相机与 zxing 都会开始漏检——容量要为此让路
        const matrix = createQrMatrix(probe, ecc);
        return matrix.moduleCount + 8 <= Math.floor(normalizeQrSize(displaySize) / 4);
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
      version = createQrMatrix(split.frames[split.frames.length - 1], ecc).version;
    } catch {
      version = 0;
    }
    return { frames: split.frames, frameBytes: split.frameBytes, version };
  }, [payload, sid, capacity, ecc, fileName, source, textBytes, file, gzip, displaySize]);

  const frames = prepared?.frames ?? [];
  const total = frames.length;

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

  const display = useMemo(() => {
    if (!currentMatrix) return null;
    return renderQrToCanvas(currentMatrix, { ...QR_DEFAULT_STYLE, size: displaySize });
  }, [currentMatrix, displaySize]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvasRef.current;
    if (!target || !display) return;
    target.width = display.width;
    target.height = display.height;
    const context = target.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, target.width, target.height);
    context.drawImage(display, 0, 0);
  }, [display]);

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
        const canvas = renderQrToCanvas(createQrMatrix(frames[i], ecc), { ...QR_DEFAULT_STYLE, size: displaySize });
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
                  ? t({ zh: '允许到 V40 密度：请调大显示尺寸并保证屏幕清晰', en: 'Up to V40 density: raise the display size and keep the screen sharp' })
                  : capacity === 'safe'
                    ? t({ zh: '小容量多帧：手机隔一两米也能扫', en: 'Smaller frames: scannable from a meter or two' })
                    : t({ zh: '日常屏幕/相机的平衡选择，帧数更少', en: 'A balanced choice for typical screens, with fewer frames' })}
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
              <label htmlFor="dqx-size" className="flex items-end gap-1.5 text-xs text-ink-3">
                {t({ zh: '显示尺寸', en: 'Display' })}
                <Select
                  id="dqx-size"
                  value={displaySize}
                  onChange={(event) => setDisplaySize(Number(event.target.value))}
                  className="h-8 text-xs"
                  wrapperClassName="w-24"
                >
                  {[256, 512, 1024].map((size) => (
                    <option key={size} value={size}>
                      {size}px
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          </div>
        </Panel>

        {payload.error ? <ToolAlert tone="warning" title={payload.error} /> : null}
        {!prepared && payload.bytes.length > 0 ? (
          <ToolAlert
            tone="error"
            title={t({ zh: '当前容量档无法成帧', en: 'No frame fits the current capacity tier' })}
            hint={t({
              zh: '帧头过长或容错过高：请换「极限」容量或 L/M 容错。',
              en: 'Frame header too long or ECC too high: switch to Max capacity or L/M error correction.',
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
            <canvas
              ref={canvasRef}
              className="mx-auto block w-full max-w-[320px] rounded-xl border border-line bg-white"
              aria-label={t({ zh: '当前二维码帧', en: 'Current QR frame' })}
            />
            <div className="flex items-center justify-center gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => setIndex((i) => (i - 1 + total) % total)} aria-label={t({ zh: '上一帧', en: 'Previous frame' })}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant={playing ? 'secondary' : 'primary'} size="sm" onClick={() => setPlaying((p) => !p)}>
                {playing ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                {playing ? t({ zh: '暂停', en: 'Pause' }) : t({ zh: '播放', en: 'Play' })}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setIndex((i) => (i + 1) % total)} aria-label={t({ zh: '下一帧', en: 'Next frame' })}>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="sm" onClick={startOver}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '新会话', en: 'New session' })}
              </Button>
            </div>
            <p className="text-center text-[11px] text-ink-3">
              {t({ zh: '⌘/Ctrl + ←/→ 也可逐帧步进；对端摄像头对准屏幕即可自动收集', en: '⌘/Ctrl + ←/→ also steps frames; just point the other camera at the screen' })}
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
    </div>
  );
}
