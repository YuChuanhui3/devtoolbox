import { useMemo, useState } from 'react';
import { Palette } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { ActionBar, CopyIconButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { convertColor } from '@/lib/color';

const PRESETS = ['#2196F3', '#0F172A', '#F43F5E', '#22C55E', '#F59E0B', '#8B5CF6', '#06B6D4', '#111827'];

export default function ColorTool() {
  const { t } = useI18n();
  const [input, setInput] = useState('#2196F3');

  const result = useMemo(() => convertColor(input), [input]);

  const rows = useMemo(() => {
    if (!result) return [];
    return [
      { label: 'HEX', value: result.hex },
      { label: 'RGB', value: result.rgb },
      { label: 'HSL', value: result.hsl },
      { label: 'R', value: String(result.rgba.r) },
      { label: 'G', value: String(result.rgba.g) },
      { label: 'B', value: String(result.rgba.b) },
      { label: 'Alpha', value: String(Number(result.rgba.a.toFixed(3))) },
    ];
  }, [result]);

  return (
    <div className="space-y-4">
      <ActionBar>
        <span className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-3">
          <Palette className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '支持 HEX、RGB、RGBA、HSL、HSLA 与 CSS 颜色名', en: 'Supports HEX, RGB, RGBA, HSL, HSLA, and CSS color names' })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={t({ zh: `使用颜色 ${preset}`, en: `Use color ${preset}` })}
              onClick={() => setInput(preset)}
              className="h-6 w-6 rounded-full border border-line-strong shadow-sm transition-transform duration-300 hover:-translate-y-0.5"
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>
      </ActionBar>

      {!result && input.trim() ? (
        <ToolAlert
          tone="error"
          title={{ zh: '无法识别该颜色', en: 'Unrecognized color' }}
          hint={{ zh: '请输入 #RGB、#RRGGBB、rgb(…) 、hsl(…) 或 CSS 颜色名，例如 #2196F3。', en: 'Enter #RGB, #RRGGBB, rgb(…), hsl(…), or a CSS color name, e.g. #2196F3.' }}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title={t({ zh: '颜色输入', en: 'Color input' })} bodyClassName="space-y-4 p-4">
          <div
            className="relative flex h-48 items-end justify-between overflow-hidden rounded-2xl border border-line p-4 shadow-inner"
            style={{ backgroundColor: result?.hex ?? '#e5e7eb' }}
          >
            <span
              className="rounded-full bg-black/25 px-2.5 py-1 font-mono text-[11px] text-white backdrop-blur-sm"
            >
              {result?.hex ?? t({ zh: '无法预览', en: 'No preview' })}
            </span>
            {result ? (
              <span className="rounded-full bg-white/80 px-2.5 py-1 font-mono text-[11px] text-slate-800 backdrop-blur-sm">
                {result.rgba.r}, {result.rgba.g}, {result.rgba.b}
                {result.rgba.a < 1 ? `, ${Number(result.rgba.a.toFixed(2))}` : ''}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="color"
              value={result ? result.hex.slice(0, 7) : '#2196f3'}
              onChange={(event) => setInput(event.target.value)}
              aria-label={t({ zh: '选择颜色', en: 'Pick a color' })}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-xl border border-line bg-surface p-1"
            />
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t({ zh: '#2196F3 或 rgb(33, 150, 243)', en: '#2196F3 or rgb(33, 150, 243)' })}
              aria-label={t({ zh: '颜色值', en: 'Color value' })}
              mono
              className="min-w-0 flex-1"
            />
          </div>

          <p className="text-[11px] leading-5 text-ink-3">
            {t({
              zh: '颜色选择器会使用 HEX 值回填输入框；透明度请直接输入 rgba / hsla。',
              en: 'The color picker writes a HEX value back into the input; type rgba / hsla directly for alpha.',
            })}
          </p>
        </Panel>

        <Panel
          title={t({ zh: '颜色值', en: 'Color values' })}
          subtitle={result ? t({ zh: '点击右侧复制对应格式', en: 'Click the buttons on the right to copy each format' }) : t({ zh: '输入颜色后展示', en: 'Shown once you enter a color' })}
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-line">
            {rows.length === 0 ? (
              <li className="flex min-h-[240px] items-center justify-center text-xs text-ink-3">
                {t({ zh: '输入颜色后展示 HEX / RGB / HSL 值', en: 'HEX / RGB / HSL values appear once you enter a color' })}
              </li>
            ) : (
              rows.map((row) => (
                <li key={row.label} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-14 shrink-0 text-xs font-medium text-ink-3">{row.label}</span>
                  <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink">{row.value}</code>
                  <CopyIconButton text={row.value} label={t({ zh: `复制 ${row.label}`, en: `Copy ${row.label}` })} />
                </li>
              ))
            )}
          </ul>
        </Panel>
      </div>

      {result ? (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-3 shadow-card">
          <span className="text-xs text-ink-3">{t({ zh: 'CSS 示例', en: 'CSS example' })}</span>
          <code className="rounded-lg bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink-2">
            color: {result.rgb};
          </code>
          <code className="rounded-lg bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink-2">
            background: {result.hex};
          </code>
        </div>
      ) : null}
    </div>
  );
}
