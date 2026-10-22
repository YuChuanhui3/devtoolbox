import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { CopyIconButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { toToolError } from '@/lib/errors';
import { calcPpi } from '@/lib/ppi';

export default function PpiCalcTool() {
  const { t } = useI18n();
  const [width, setWidth] = useState('2560');
  const [height, setHeight] = useState('1440');
  const [diagonal, setDiagonal] = useState('27');

  const computed = useMemo(() => {
    try {
      return { result: calcPpi(Number(width), Number(height), Number(diagonal)), error: null };
    } catch (error) {
      return { result: null, error: toToolError(error).message };
    }
  }, [width, height, diagonal]);

  const rows = computed.result
    ? [
        { label: t({ zh: '像素密度 PPI', en: 'Pixel density PPI' }), value: `${computed.result.ppi} px/inch` },
        { label: t({ zh: '像素密度 PPM', en: 'Pixel density PPM' }), value: `${computed.result.ppm} px/m` },
        {
          label: t({ zh: '可视区宽 × 高', en: 'Viewable width × height' }),
          value: t({
            zh: `${computed.result.physicalWidthInches} × ${computed.result.physicalHeightInches} 英寸`,
            en: `${computed.result.physicalWidthInches} × ${computed.result.physicalHeightInches} inches`,
          }),
        },
        { label: t({ zh: '宽高比', en: 'Aspect ratio' }), value: computed.result.aspectRatio },
        { label: t({ zh: '密度分级', en: 'Density tier' }), value: t(computed.result.densityLabel) },
      ]
    : [];

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: '输入屏幕参数', en: 'Enter screen parameters' })}
        subtitle={t({ zh: '填入分辨率（像素）与屏幕对角线尺寸（英寸）即可实时计算', en: 'Enter resolution (pixels) and diagonal size (inches) for a live calculation' })}
        bodyClassName="space-y-3 p-4"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs text-ink-3">
            {t({ zh: '宽度（px）', en: 'Width (px)' })}
            <Input
              value={width}
              onChange={(event) => setWidth(event.target.value)}
              inputMode="numeric"
              className="mt-1 font-mono"
              aria-label={t({ zh: '屏幕宽度像素', en: 'Screen width in pixels' })}
            />
          </label>
          <label className="block text-xs text-ink-3">
            {t({ zh: '高度（px）', en: 'Height (px)' })}
            <Input
              value={height}
              onChange={(event) => setHeight(event.target.value)}
              inputMode="numeric"
              className="mt-1 font-mono"
              aria-label={t({ zh: '屏幕高度像素', en: 'Screen height in pixels' })}
            />
          </label>
          <label className="block text-xs text-ink-3">
            {t({ zh: '对角线（英寸）', en: 'Diagonal (inches)' })}
            <Input
              value={diagonal}
              onChange={(event) => setDiagonal(event.target.value)}
              inputMode="decimal"
              className="mt-1 font-mono"
              aria-label={t({ zh: '屏幕对角线英寸', en: 'Screen diagonal in inches' })}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { name: '24" 1080p', w: 1920, h: 1080, d: 24 },
            { name: '27" 2K', w: 2560, h: 1440, d: 27 },
            { name: '27" 4K', w: 3840, h: 2160, d: 27 },
            { name: 'iPhone 15 Pro', w: 1179, h: 2556, d: 6.1 },
            { name: 'MacBook 14"', w: 3024, h: 1964, d: 14.2 },
          ].map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-ink-2 hover:border-accent hover:text-accent-strong"
              onClick={() => {
                setWidth(String(preset.w));
                setHeight(String(preset.h));
                setDiagonal(String(preset.d));
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
        {computed.error ? <ToolAlert tone="error" title={computed.error} /> : null}
      </Panel>

      <Panel
        title={t({ zh: '计算结果', en: 'Results' })}
        subtitle={computed.result ? t({ zh: 'PPI = √(宽² + 高²) ÷ 对角线', en: 'PPI = √(width² + height²) ÷ diagonal' }) : t({ zh: '输入合法参数后自动计算', en: 'Calculates automatically once inputs are valid' })}
        bodyClassName="p-0"
      >
        {computed.result ? (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center gap-3 px-4 py-3">
                <span className="w-32 shrink-0 text-xs text-ink-3">{row.label}</span>
                <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-ink">{row.value}</code>
                <CopyIconButton text={row.value} label={t({ zh: `复制${row.label}`, en: `Copy ${row.label}` })} />
              </li>
            ))}
            <li className="px-4 py-3 text-xs leading-5 text-ink-3">{t(computed.result.densityHint)}</li>
          </ul>
        ) : (
          <div className="flex min-h-[160px] items-center justify-center px-4 text-xs text-ink-3">
            {computed.error ?? t({ zh: '结果将在这里显示', en: 'Results will appear here' })}
          </div>
        )}
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: '距离 factor 参考：PPI ≥ 300 时 25cm 目视约等于视网膜屏；数据仅在本地计算。',
          en: 'Viewing-distance factor reference: at PPI ≥ 300, a 25cm viewing distance is roughly a retina display; data is computed locally.',
        })}
      </p>
    </div>
  );
}
