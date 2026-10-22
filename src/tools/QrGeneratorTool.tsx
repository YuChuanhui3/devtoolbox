import { useMemo, useState } from 'react';
import {
  Download,
  Loader2,
  QrCode,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import {
  ActionBar,
  ClearButton,
  DownloadButton,
  SampleButton,
} from '@/components/tool/ToolActions';
import { InputPanel, StatsBar } from '@/components/tool/EditorPanels';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { SAMPLE_URL } from '@/data/samples';
import { downloadBlob } from '@/lib/download';
import { toToolError, type ToolError } from '@/lib/errors';
import { formatBytes } from '@/lib/number';
import {
  buildQrSvg,
  canvasToPngBlob,
  createQrMatrix,
  normalizeQrSize,
  QR_DEFAULT_STYLE,
  QR_ECC_OPTIONS,
  QR_SIZE_OPTIONS,
  qrDownloadName,
  renderQrToCanvas,
  utf8ByteLength,
  type QrEcc,
  type QrStyle,
} from '@/lib/qr';

interface QrResult {
  matrix: ReturnType<typeof createQrMatrix> | null;
  svg: string;
  error: ToolError | null;
}

export default function QrGeneratorTool() {
  const { t } = useI18n();
  const toast = useToast();
  const [input, setInput] = useState('');
  const [style, setStyle] = useState<QrStyle>(QR_DEFAULT_STYLE);
  const [pngBusy, setPngBusy] = useState(false);

  const result = useMemo<QrResult>(() => {
    if (!input.trim()) return { matrix: null, svg: '', error: null };
    try {
      const matrix = createQrMatrix(input, style.ecc);
      return { matrix, svg: buildQrSvg(matrix, style), error: null };
    } catch (error) {
      return { matrix: null, svg: '', error: toToolError(error) };
    }
  }, [input, style]);

  const { matrix, svg, error } = result;
  const bytes = useMemo(() => utf8ByteLength(input), [input]);
  const dense = matrix !== null && matrix.version >= 20;
  const eccHint = t(QR_ECC_OPTIONS.find((option) => option.value === style.ecc)!.description);

  const updateStyle = <K extends keyof QrStyle>(key: K, value: QrStyle[K]) => {
    setStyle((current) => ({ ...current, [key]: value }));
  };

  const clear = () => {
    setInput('');
    setPngBusy(false);
  };

  const downloadPng = async () => {
    if (!matrix || pngBusy) return;
    setPngBusy(true);
    try {
      const canvas = renderQrToCanvas(matrix, style);
      const blob = await canvasToPngBlob(canvas);
      downloadBlob(qrDownloadName(style.size, 'png'), blob);
      toast.success(t({ zh: '已开始下载 PNG', en: 'PNG download started' }));
    } catch (downloadError) {
      toast.error(t(toToolError(downloadError).localized));
    } finally {
      setPngBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <ActionBar>
        <SampleButton onClick={() => setInput(SAMPLE_URL)} label={t({ zh: '示例链接', en: 'Sample link' })} />
        <ClearButton onClick={clear} disabled={!input && !error} />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <DownloadButton
            filename={qrDownloadName(style.size, 'svg')}
            content={svg}
            mime="image/svg+xml;charset=utf-8"
            label={t({ zh: '下载 SVG', en: 'Download SVG' })}
            disabled={!matrix}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void downloadPng()}
            disabled={!matrix || pngBusy}
          >
            {pngBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {pngBusy ? t({ zh: '生成 PNG…', en: 'Generating PNG…' }) : t({ zh: '下载 PNG', en: 'Download PNG' })}
          </Button>
        </div>
      </ActionBar>

      {error ? <ToolAlert tone="error" title={error.localized} hint={error.hint} /> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <div className="h-[360px]">
            <InputPanel
              label={t({ zh: '文本或 URL', en: 'Text or URL' })}
              value={input}
              onChange={setInput}
              placeholder={t({
                zh: '输入文本、链接、Wi-Fi 配置或任意需要编码的内容…',
                en: 'Enter text, a link, Wi-Fi settings, or anything to encode…',
              })}
              minHeight={220}
              footer={
                <StatsBar
                  items={[
                    { label: t({ zh: '字符', en: 'Chars' }), value: input.length },
                    { label: 'UTF-8', value: formatBytes(bytes, 0) },
                    {
                      label: t({ zh: '版本', en: 'Version' }),
                      value: matrix
                        ? `V${matrix.version}`
                        : error
                          ? t({ zh: '超出容量', en: 'Over capacity' })
                          : '-',
                    },
                  ]}
                />
              }
            />
          </div>

          <Panel
            title={t({ zh: '生成参数', en: 'Generation settings' })}
            subtitle={t({ zh: '调整尺寸、容错级别与颜色', en: 'Adjust size, error correction, and colors' })}
            actions={<Badge tone="accent">{t({ zh: '实时生成', en: 'Live' })}</Badge>}
            bodyClassName="p-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="qr-size" className="text-xs text-ink-3">
                  {t({ zh: '尺寸', en: 'Size' })}
                </label>
                <Select
                  id="qr-size"
                  value={style.size}
                  onChange={(event) => updateStyle('size', Number(event.target.value))}
                  wrapperClassName="mt-1.5 w-full"
                >
                  {QR_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} × {size} px
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label htmlFor="qr-ecc" className="text-xs text-ink-3">
                  {t({ zh: '容错级别', en: 'Error correction' })}
                </label>
                <Select
                  id="qr-ecc"
                  value={style.ecc}
                  onChange={(event) => updateStyle('ecc', event.target.value as QrEcc)}
                  wrapperClassName="mt-1.5 w-full"
                >
                  {QR_ECC_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-[11px] leading-5 text-ink-3">{eccHint}</p>
              </div>

              <div>
                <label htmlFor="qr-foreground" className="text-xs text-ink-3">
                  {t({ zh: '前景色', en: 'Foreground color' })}
                </label>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-surface px-2 py-1.5">
                  <input
                    id="qr-foreground"
                    type="color"
                    value={style.foreground}
                    onChange={(event) => updateStyle('foreground', event.target.value)}
                    className="h-7 w-9 cursor-pointer rounded-md border border-line bg-transparent p-0.5"
                  />
                  <span className="font-mono text-xs uppercase text-ink-2">
                    {style.foreground}
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="qr-background" className="text-xs text-ink-3">
                  {t({ zh: '背景色', en: 'Background color' })}
                </label>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-surface px-2 py-1.5">
                  <input
                    id="qr-background"
                    type="color"
                    value={style.background}
                    onChange={(event) => updateStyle('background', event.target.value)}
                    className="h-7 w-9 cursor-pointer rounded-md border border-line bg-transparent p-0.5"
                  />
                  <span className="font-mono text-xs uppercase text-ink-2">
                    {style.background}
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-4 text-[11px] leading-5 text-ink-3">
              {t({
                zh: '前景色应明显深于背景色，并保留四周静区（白边），否则扫码设备可能无法识别。颜色仅影响外观，不改变编码内容。',
                en: 'Make the foreground clearly darker than the background and keep the quiet zone (white border), otherwise scanners may fail to read it. Colors only change appearance, not the encoded content.',
              })}
            </p>
          </Panel>
        </div>

        <Panel
          title={t({ zh: '二维码预览', en: 'QR code preview' })}
          subtitle={
            matrix
              ? t({
                  zh: `${matrix.moduleCount} × ${matrix.moduleCount} 模块 · 容错 ${style.ecc}`,
                  en: `${matrix.moduleCount} × ${matrix.moduleCount} modules · ${style.ecc} error correction`,
                })
              : t({ zh: '输入内容后自动生成', en: 'Generated automatically once you enter content' })
          }
          actions={<Badge tone="success">{t({ zh: '本地生成', en: 'Generated locally' })}</Badge>}
          bodyClassName="p-4"
          footer={
            matrix ? (
              <StatsBar
                items={[
                  { label: t({ zh: '尺寸', en: 'Size' }), value: `${normalizeQrSize(style.size)} px` },
                  { label: t({ zh: '版本', en: 'Version' }), value: `V${matrix.version}` },
                  { label: 'UTF-8', value: formatBytes(matrix.byteLength, 0) },
                ]}
              />
            ) : undefined
          }
        >
          {matrix ? (
            <div className="space-y-4">
              <div
                className="mx-auto w-full max-w-[320px] overflow-hidden rounded-xl border border-line [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />

              {dense ? (
                <ToolAlert
                  tone="warning"
                  title={t({ zh: '内容较密，二维码版本较高', en: 'Dense content, high QR version' })}
                  hint={t({
                    zh: '建议缩短内容、增大尺寸，或切换到 L 级容错以提升扫描成功率。',
                    en: 'Shorten the content, increase the size, or switch to L error correction for more reliable scans.',
                  })}
                />
              ) : (
                <p className="text-center text-[11px] leading-5 text-ink-3">
                  {t({
                    zh: '下载 PNG 会按所选尺寸输出；SVG 为矢量图，可无损放大用于印刷。',
                    en: 'PNG downloads use the selected size; SVG is vector and scales losslessly for print.',
                  })}
                </p>
              )}
            </div>
          ) : error ? (
            <div
              className="flex flex-col items-center justify-center gap-2 px-6 text-center"
              style={{ minHeight: 360 }}
            >
              <TriangleAlert className="h-7 w-7 text-danger" aria-hidden="true" />
              <p className="text-sm font-medium text-ink">{t({ zh: '无法生成二维码', en: 'Unable to generate the QR code' })}</p>
              <p className="max-w-sm text-xs leading-5 text-ink-3">
                {t({
                  zh: '请根据上方提示缩短内容或调整容错级别后重试。',
                  en: 'Follow the hint above to shorten the content or change the error correction level, then retry.',
                })}
              </p>
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-2 px-6 text-center"
              style={{ minHeight: 360 }}
            >
              <QrCode className="h-8 w-8 text-ink-3" aria-hidden="true" />
              <p className="text-sm font-medium text-ink">{t({ zh: '输入内容后在此预览', en: 'Enter content to preview it here' })}</p>
              <p className="max-w-sm text-xs leading-5 text-ink-3">
                {t({
                  zh: '支持文本、URL、Wi-Fi 配置等，生成过程完全在本地完成。',
                  en: 'Text, URLs, and Wi-Fi settings are supported; generation runs entirely locally.',
                })}
              </p>
            </div>
          )}
        </Panel>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-[11px] leading-5 text-ink-3">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden="true" />
        {t({
          zh: '二维码内容仅在本机浏览器内编码，不会上传服务器，也不会写入工具草稿。二维码容量有限，内容过长时请缩短文本或改用短链接。',
          en: 'QR content is encoded only in your local browser, never uploaded or saved as a tool draft. Capacity is limited; shorten the text or use a short link when it is too long.',
        })}
      </div>
    </div>
  );
}
