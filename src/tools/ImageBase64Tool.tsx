import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Image as ImageIcon,
  ImageOff,
  Loader2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { IconButton } from '@/components/ui/IconButton';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import {
  ActionBar,
  ClearButton,
  CopyButton,
  CopyIconButton,
  DownloadButton,
} from '@/components/tool/ToolActions';
import { ImageDropzone } from '@/components/tool/ImageDropzone';
import { InputPanel, OutputPanel, StatsBar } from '@/components/tool/EditorPanels';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { ToolError, toToolError } from '@/lib/errors';
import { formatBytes } from '@/lib/number';
import { downloadBlob, safeFilename } from '@/lib/download';
import { formatLabelForMime, loadImage, validateImageFile } from '@/lib/image';
import {
  buildBase64Output,
  imageExtensionForMime,
  LARGE_BASE64_PREVIEW,
  LARGE_BASE64_THRESHOLD,
  parseBase64Image,
  readImageFile,
} from '@/lib/imageBase64';

type Mode = 'encode' | 'decode';

interface EncodeSource {
  file: File;
  previewUrl: string;
  base64: string;
  mime: string;
  width: number;
  height: number;
}

interface DecodedImage {
  base64: string;
  bytes: Uint8Array;
  dataUri: string;
  mime: string;
  width: number;
  height: number;
}

function fileBaseName(name: string): string {
  return safeFilename(name.replace(/\.[^.]+$/, ''), 'image');
}

function MetaItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className={mono ? 'truncate font-mono text-xs text-ink' : 'truncate text-xs font-medium text-ink'}>
        {value}
      </dd>
    </div>
  );
}

export default function ImageBase64Tool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('encode');
  const [includeDataUri, setIncludeDataUri] = useState(true);
  const [singleLine, setSingleLine] = useState(false);

  const [source, setSource] = useState<EncodeSource | null>(null);
  const [encodeError, setEncodeError] = useState<ToolError | null>(null);
  const [encodeProgress, setEncodeProgress] = useState<number | null>(null);
  const [showFullOutput, setShowFullOutput] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const encodeRequestRef = useRef(0);

  const [base64Input, setBase64Input] = useState('');
  const [decoded, setDecoded] = useState<DecodedImage | null>(null);
  const [decodeError, setDecodeError] = useState<ToolError | null>(null);
  const [decodeBusy, setDecodeBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const file = Array.from(fileList)[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (validation) {
      setEncodeError(validation);
      return;
    }

    const requestId = encodeRequestRef.current + 1;
    encodeRequestRef.current = requestId;
    setEncodeError(null);
    setEncodeProgress(0);
    setShowFullOutput(false);

    const previewUrl = URL.createObjectURL(file);
    try {
      const [read, image] = await Promise.all([
        readImageFile(file, (percent) => {
          if (encodeRequestRef.current === requestId) setEncodeProgress(percent);
        }),
        loadImage(file),
      ]);
      const width = image.width;
      const height = image.height;
      if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
        image.close();
      }
      if (encodeRequestRef.current !== requestId) {
        URL.revokeObjectURL(previewUrl);
        return;
      }

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = previewUrl;
      setSource({
        file,
        previewUrl,
        base64: read.base64,
        mime: read.mime,
        width,
        height,
      });
      setEncodeProgress(null);
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      if (encodeRequestRef.current !== requestId) return;
      setEncodeError(toToolError(error));
      setEncodeProgress(null);
    }
  }, [t]);

  useEffect(() => {
    if (mode !== 'encode') return;
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find(
        (item) => item.kind === 'file' && item.type.startsWith('image/'),
      );
      const file = imageItem?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void handleFiles([file]);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [mode, handleFiles]);
  useEffect(() => {
    const raw = base64Input.trim();
    if (!raw) {
      setDecoded(null);
      setDecodeError(null);
      setDecodeBusy(false);
      return;
    }

    let cancelled = false;
    setDecodeBusy(true);
    setDecodeError(null);

    const timer = window.setTimeout(() => {
      try {
        const parsed = parseBase64Image(raw);
        const image = new Image();
        image.onload = () => {
          if (cancelled) return;
          setDecoded({
            base64: parsed.base64,
            bytes: parsed.bytes,
            dataUri: parsed.dataUri,
            mime: parsed.mime,
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
          setDecodeBusy(false);
        };
        image.onerror = () => {
          if (cancelled) return;
          setDecoded(null);
          setDecodeError(
            new ToolError(
              { zh: '图片预览失败', en: 'Image preview failed' },
              {
                zh: 'Base64 数据可能损坏，浏览器无法解码该图片。',
                en: 'The Base64 data may be corrupted; the browser cannot decode this image.',
              },
            ),
          );
          setDecodeBusy(false);
        };
        image.src = parsed.dataUri;
      } catch (error) {
        if (cancelled) return;
        setDecoded(null);
        setDecodeError(toToolError(error));
        setDecodeBusy(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [base64Input]);

  const clearEncode = () => {
    encodeRequestRef.current += 1;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setSource(null);
    setEncodeError(null);
    setEncodeProgress(null);
    setShowFullOutput(false);
  };

  const clearDecode = () => {
    setBase64Input('');
    setDecoded(null);
    setDecodeError(null);
    setDecodeBusy(false);
  };

  const output = useMemo(
    () =>
      source
        ? buildBase64Output(source.base64, source.mime, { includeDataUri, singleLine })
        : '',
    [source, includeDataUri, singleLine],
  );

  const inflation =
    source && source.file.size > 0
      ? Math.round(((output.length - source.file.size) / source.file.size) * 100)
      : 0;
  const isLargeOutput = output.length > LARGE_BASE64_THRESHOLD;
  const displayOutput =
    isLargeOutput && !showFullOutput
      ? `${output.slice(0, LARGE_BASE64_PREVIEW)}\n\n${t({
          zh: `… 已折叠 ${output.length - LARGE_BASE64_PREVIEW} 个字符`,
          en: `… ${output.length - LARGE_BASE64_PREVIEW} characters collapsed`,
        })}`
      : output;
  const encodeFilename = source
    ? `${fileBaseName(source.file.name)}-base64.txt`
    : 'image-base64.txt';
  const decodedFilename = decoded
    ? `decoded-image.${imageExtensionForMime(decoded.mime)}`
    : 'decoded-image.png';

  const downloadDecoded = () => {
    if (!decoded) return;
    downloadBlob(
      decodedFilename,
      new Blob([decoded.bytes.buffer as ArrayBuffer], { type: decoded.mime }),
    );
  };

  return (
    <div className="space-y-4">
      <ActionBar>
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '转换方向', en: 'Conversion direction' })}
          options={[
            { value: 'encode', label: t({ zh: '图片 → Base64', en: 'Image → Base64' }) },
            { value: 'decode', label: t({ zh: 'Base64 → 图片', en: 'Base64 → Image' }) },
          ]}
        />

        {mode === 'encode' ? (
          <>
            <Checkbox
              checked={includeDataUri}
              onChange={setIncludeDataUri}
              label={t({ zh: '包含 Data URI 前缀', en: 'Include Data URI prefix' })}
              className="text-xs"
            />
            <Checkbox
              checked={singleLine}
              onChange={setSingleLine}
              label={t({ zh: '单行输出', en: 'Single-line output' })}
              className="text-xs"
            />
          </>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {mode === 'encode' ? (
            <>
              <ClearButton
                onClick={clearEncode}
                disabled={!source && !encodeError && encodeProgress === null}
              />
              <CopyButton
                text={output}
                label={includeDataUri ? t({ zh: '复制 Data URL', en: 'Copy Data URL' }) : t({ zh: '复制 Base64', en: 'Copy Base64' })}
              />
              <DownloadButton
                filename={encodeFilename}
                content={output}
                mime="text/plain;charset=utf-8"
                label={t({ zh: '下载 .txt', en: 'Download .txt' })}
                disabled={!output}
              />
            </>
          ) : (
            <>
              <ClearButton onClick={clearDecode} disabled={!base64Input} />
              <CopyButton text={decoded?.dataUri ?? ''} label={t({ zh: '复制 Data URL', en: 'Copy Data URL' })} />
              <Button
                variant="secondary"
                size="sm"
                onClick={downloadDecoded}
                disabled={!decoded}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '下载图片', en: 'Download image' })}
              </Button>
            </>
          )}
        </div>
      </ActionBar>

      {mode === 'encode' && encodeError ? (
        <ToolAlert tone="error" title={encodeError.localized} hint={encodeError.hint} />
      ) : null}
      {mode === 'decode' && decodeError ? (
        <ToolAlert tone="error" title={decodeError.localized} hint={decodeError.hint} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {mode === 'encode' ? (
          <>
            <Panel
              title={t({ zh: '图片输入', en: 'Image input' })}
              subtitle={t({ zh: '文件仅在浏览器本地读取', en: 'Files are read locally in the browser' })}
              actions={<Badge tone="success">{t({ zh: '本地处理', en: 'Local processing' })}</Badge>}
              bodyClassName="p-4"
            >
              <ImageDropzone
                onFiles={(files) => void handleFiles(files)}
                multiple={false}
                title={t({ zh: '拖拽图片到这里，或点击选择', en: 'Drop an image here, or click to choose' })}
                hint={t({
                  zh: 'JPG / PNG / WebP / GIF / BMP · 单张不超过 20MB · 支持 Ctrl / Cmd + V 粘贴',
                  en: 'JPG / PNG / WebP / GIF / BMP · up to 20MB each · paste with Ctrl / Cmd + V',
                })}
              />

              {encodeProgress !== null ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-ink-3">
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      {t({ zh: '正在读取并编码', en: 'Reading and encoding' })}
                    </span>
                    <span className="font-mono tabular-nums">{encodeProgress}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-300"
                      style={{ width: `${encodeProgress}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {source ? (
                <div className="mt-4 rounded-xl border border-line bg-surface-2/40 p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface">
                      <img
                        src={source.previewUrl}
                        alt={source.file.name}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink" title={source.file.name}>
                        {source.file.name}
                      </p>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                        <MetaItem label={t({ zh: '格式', en: 'Format' })} value={formatLabelForMime(source.mime)} />
                        <MetaItem label={t({ zh: '大小', en: 'Size' })} value={formatBytes(source.file.size)} />
                        <MetaItem label={t({ zh: '尺寸', en: 'Dimensions' })} value={`${source.width} × ${source.height}`} />
                        <MetaItem
                          label="Base64"
                          value={formatBytes(output.length)}
                          mono
                        />
                      </dl>
                    </div>
                    <IconButton
                      label={t({ zh: '移除图片', en: 'Remove image' })}
                      size="sm"
                      tone="danger"
                      onClick={clearEncode}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-center text-[11px] text-ink-3">
                  {t({ zh: '图片会在本地自动编码，无需点击转换', en: 'Images are encoded locally and automatically; no convert button needed' })}
                </p>
              )}
            </Panel>

            <div className="h-[min(60vh,480px)] min-h-[360px]">
              <OutputPanel
                label={t({ zh: 'Base64 输出', en: 'Base64 output' })}
                value={displayOutput}
                emptyText={t({ zh: '上传图片后在这里生成 Base64 或 Data URL', en: 'Upload an image to generate Base64 or a Data URL here' })}
                minHeight={360}
                actions={
                  <>
                    {isLargeOutput ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowFullOutput((value) => !value)}
                      >
                        {showFullOutput ? t({ zh: '收起', en: 'Collapse' }) : t({ zh: '展开全部', en: 'Expand all' })}
                      </Button>
                    ) : null}
                    <CopyIconButton
                      text={output}
                      label={includeDataUri ? t({ zh: '复制 Data URL', en: 'Copy Data URL' }) : t({ zh: '复制 Base64', en: 'Copy Base64' })}
                    />
                  </>
                }
                footer={
                  <StatsBar
                    items={[
                      { label: t({ zh: '原始大小', en: 'Original size' }), value: source ? formatBytes(source.file.size) : '-' },
                      { label: t({ zh: 'Base64 大小', en: 'Base64 size' }), value: source ? formatBytes(output.length) : '-' },
                      {
                        label: t({ zh: '膨胀率', en: 'Inflation' }),
                        value: source ? `${inflation > 0 ? '+' : ''}${inflation}%` : '-',
                      },
                    ]}
                  />
                }
              />
            </div>
          </>
        ) : (
          <>
            <InputPanel
              label={t({ zh: 'Base64 输入', en: 'Base64 input' })}
              value={base64Input}
              onChange={setBase64Input}
              placeholder="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
              minHeight={360}
              footer={
                <StatsBar
                  items={[
                    { label: t({ zh: '字符', en: 'Chars' }), value: base64Input.length },
                    {
                      label: t({ zh: '行数', en: 'Lines' }),
                      value: base64Input ? base64Input.split('\n').length : 0,
                    },
                    {
                      label: t({ zh: '解析', en: 'Parse' }),
                      value: decodeBusy
                        ? t({ zh: '进行中', en: 'Running' })
                        : decoded
                          ? t({ zh: '成功', en: 'Success' })
                          : decodeError
                            ? t({ zh: '失败', en: 'Failed' })
                            : t({ zh: '等待输入', en: 'Waiting for input' }),
                    },
                  ]}
                />
              }
            />

            <Panel
              title={t({ zh: '图片预览', en: 'Image preview' })}
              subtitle={decoded ? `${decoded.width} × ${decoded.height}` : t({ zh: '粘贴后自动解析', en: 'Parsed automatically after paste' })}
              actions={
                decodeBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-accent" aria-label={t({ zh: '正在解析', en: 'Parsing' })} />
                ) : decoded ? (
                  <Badge tone="success">{t({ zh: '解析成功', en: 'Parsed' })}</Badge>
                ) : decodeError ? (
                  <Badge tone="danger">{t({ zh: '解析失败', en: 'Parse failed' })}</Badge>
                ) : null
              }
              bodyClassName="p-4"
            >
              {decoded ? (
                <div className="space-y-4">
                  <div
                    className="flex items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2/40 p-3"
                    style={{ minHeight: 240 }}
                  >
                    <img
                      src={decoded.dataUri}
                      alt={t({ zh: 'Base64 解码预览', en: 'Base64 decode preview' })}
                      className="max-h-[320px] max-w-full object-contain"
                    />
                  </div>
                  <dl className="grid grid-cols-2 gap-3">
                    <MetaItem label={t({ zh: '文件名', en: 'Filename' })} value={decodedFilename} mono />
                    <MetaItem label={t({ zh: '格式', en: 'Format' })} value={formatLabelForMime(decoded.mime)} />
                    <MetaItem label={t({ zh: '大小', en: 'Size' })} value={formatBytes(decoded.bytes.length)} />
                    <MetaItem label={t({ zh: '尺寸', en: 'Dimensions' })} value={`${decoded.width} × ${decoded.height}`} />
                  </dl>
                  <StatsBar
                    items={[
                      { label: t({ zh: 'Base64 字符', en: 'Base64 chars' }), value: decoded.base64.length },
                      { label: 'Data URI', value: formatBytes(decoded.dataUri.length) },
                    ]}
                  />
                </div>
              ) : decodeBusy ? (
                <div
                  className="flex flex-col items-center justify-center gap-2 px-6 text-center"
                  style={{ minHeight: 360 }}
                >
                  <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
                  <p className="text-sm font-medium text-ink">{t({ zh: '正在解析 Base64…', en: 'Parsing Base64…' })}</p>
                  <p className="text-xs text-ink-3">{t({ zh: '大图片可能需要几秒钟，请稍候。', en: 'Large images may take a few seconds. Please wait.' })}</p>
                </div>
              ) : decodeError ? (
                <div
                  className="flex flex-col items-center justify-center gap-2 px-6 text-center"
                  style={{ minHeight: 360 }}
                >
                  <ImageOff className="h-7 w-7 text-danger" aria-hidden="true" />
                  <p className="text-sm font-medium text-ink">{t({ zh: '无法解析图片', en: 'Unable to parse the image' })}</p>
                  <p className="max-w-sm text-xs leading-5 text-ink-3">
                    {t({
                      zh: '请检查 Base64 是否完整，内容应来自 JPG / PNG / WebP / GIF / BMP 图片。输入内容不会被清空。',
                      en: 'Check that the Base64 is complete and comes from a JPG / PNG / WebP / GIF / BMP image. Your input is not cleared.',
                    })}
                  </p>
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center gap-2 px-6 text-center"
                  style={{ minHeight: 360 }}
                >
                  <ImageIcon className="h-7 w-7 text-ink-3" aria-hidden="true" />
                  <p className="text-sm font-medium text-ink">{t({ zh: '粘贴 Base64 后在此预览', en: 'Paste Base64 to preview it here' })}</p>
                  <p className="max-w-sm text-xs leading-5 text-ink-3">
                    {t({
                      zh: '支持 Data URL 或纯 Base64，空格、换行与前缀会自动清理。',
                      en: 'Data URLs and raw Base64 both work; spaces, line breaks, and prefixes are cleaned automatically.',
                    })}
                  </p>
                </div>
              )}
            </Panel>
          </>
        )}
      </div>

      {mode === 'encode' && isLargeOutput ? (
        <p className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-[11px] leading-5 text-ink-3">
          {t({
            zh: `输出共 ${output.length} 个字符，超过 10 万字符，当前仅预览前 ${LARGE_BASE64_PREVIEW} 个字符；复制与下载仍包含完整内容。`,
            en: `The output is ${output.length} characters, over 100,000, so only the first ${LARGE_BASE64_PREVIEW} are previewed. Copy and download still include the full content.`,
          })}
        </p>
      ) : null}

      <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-[11px] leading-5 text-ink-3">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden="true" />
        {t({
          zh: '图片与 Base64 仅在本机浏览器内处理，不会上传服务器，也不会写入工具草稿。Base64 会使数据体积增加约 33%。',
          en: 'Images and Base64 are processed only in your local browser, never uploaded or saved as a tool draft. Base64 increases data size by about 33%.',
        })}
      </div>
    </div>
  );
}
