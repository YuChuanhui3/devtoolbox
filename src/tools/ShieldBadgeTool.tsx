import { useState } from 'react';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { CopyButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import {
  BADGE_COLORS,
  BADGE_STYLES,
  badgeHtml,
  badgeMarkdown,
  buildBadgeSvg,
  buildBadgeUrl,
  type BadgeStyle,
} from '@/lib/badge';

function OutputRow({ label, value }: { label: L10n; value: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 last:border-b-0">
      <span className="w-20 shrink-0 text-xs text-ink-3">{t(label)}</span>
      <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-5 text-ink">{value}</code>
      <CopyButton text={value} label={{ zh: `复制${label.zh}`, en: `Copy ${label.en}` }} size="sm" />
    </div>
  );
}

export default function ShieldBadgeTool() {
  const { t } = useI18n();
  const [label, setLabel] = useState('build');
  const [message, setMessage] = useState('passing');
  const [color, setColor] = useState('brightgreen');
  const [style, setStyle] = useState<BadgeStyle>('flat');
  const [logo, setLogo] = useState('');
  const [link, setLink] = useState('');

  const result = (() => {
    try {
      const options = {
        label,
        message,
        color,
        style,
        ...(logo.trim() ? { logo: logo.trim() } : {}),
        ...(link.trim() ? { link: link.trim() } : {}),
      };
      return {
        svg: buildBadgeSvg(options),
        url: buildBadgeUrl(options),
        markdown: badgeMarkdown(options),
        html: badgeHtml(options),
        error: null as Localized | null,
      };
    } catch (caught) {
      return { svg: '', url: '', markdown: '', html: '', error: toToolError(caught).localized };
    }
  })();

  const colorOptions = ['custom', ...Object.keys(BADGE_COLORS)];
  const isPreset = colorOptions.includes(color.toLowerCase());

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Panel title={t({ zh: 'Badge 参数', en: 'Badge parameters' })}>
          <div className="space-y-3">
            <label className="block text-xs text-ink-3">
              {t({ zh: '左侧文本（label）', en: 'Left text (label)' })}
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="build" className="mt-1.5" />
            </label>
            <label className="block text-xs text-ink-3">
              {t({ zh: '右侧文本（message）', en: 'Right text (message)' })}
              <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="passing" className="mt-1.5" />
            </label>
            <label className="block text-xs text-ink-3">
              {t({ zh: '颜色', en: 'Color' })}
              <Select
                value={isPreset ? color : 'custom'}
                onChange={(e) => setColor(e.target.value === 'custom' ? '' : e.target.value)}
                className="mt-1.5"
              >
                {colorOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </Select>
            </label>
            {!isPreset || color === 'custom' ? (
              <label className="block text-xs text-ink-3">
                {t({ zh: '自定义十六进制', en: 'Custom hex' })}
                <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="4CAF50" className="mt-1.5 font-mono" />
              </label>
            ) : null}
            <label className="block text-xs text-ink-3">
              {t({ zh: '样式', en: 'Style' })}
              <Select value={style} onChange={(e) => setStyle(e.target.value as BadgeStyle)} className="mt-1.5">
                {BADGE_STYLES.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </Select>
            </label>
            <label className="block text-xs text-ink-3">
              {t({ zh: 'Logo（shields simple-icons 名称，可选）', en: 'Logo (shields simple-icons name, optional)' })}
              <Input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="github" className="mt-1.5" />
            </label>
            <label className="block text-xs text-ink-3">
              {t({ zh: '跳转链接（可选）', en: 'Link (optional)' })}
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://github.com/…" className="mt-1.5" />
            </label>
          </div>
        </Panel>

        <div className="space-y-4">
          {result.error ? <ToolAlert tone="error" title={result.error} /> : null}

          <Panel title={t({ zh: '本地预览', en: 'Local preview' })} subtitle={t({ zh: '预览在浏览器内渲染，不请求外部服务', en: 'Rendered in the browser; no external requests' })}>
            <div className="flex min-h-[120px] items-center justify-center rounded-xl bg-surface-2/50 p-4">
              {result.svg ? (
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`}
                  alt={`${label}: ${message}`}
                  className="max-w-full"
                />
              ) : (
                <span className="text-xs text-ink-3">{t({ zh: '修正参数后显示预览', en: 'Fix the parameters to see the preview' })}</span>
              )}
            </div>
          </Panel>

          <Panel title={t({ zh: '生成代码', en: 'Generated code' })} bodyClassName="p-0">
            <OutputRow label={{ zh: 'shields URL', en: 'shields URL' }} value={result.url} />
            <OutputRow label={{ zh: 'Markdown', en: 'Markdown' }} value={result.markdown} />
            <OutputRow label={{ zh: 'HTML', en: 'HTML' }} value={result.html} />
            <OutputRow label={{ zh: 'SVG 源码', en: 'SVG source' }} value={result.svg} />
          </Panel>
        </div>
      </div>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '预览由本地 SVG 绘制；生成的 img.shields.io 链接在页面引用时由 shields.io 渲染，样式保持一致。', en: 'The preview is drawn from local SVG; the generated img.shields.io link renders via shields.io when referenced, keeping the same style.' })}
      </p>
    </div>
  );
}
