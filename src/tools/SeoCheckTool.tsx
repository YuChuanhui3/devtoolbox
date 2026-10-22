import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { ActionBar, CopyButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { FETCH_MODES, grabHtml, type FetchMode } from '@/lib/net';
import { extractSeo, type SeoReport } from '@/lib/htmlinspect';

/** lib 中 FETCH_MODES 的中文名在此覆盖为双语，其余标签保持原样。 */
const fetchModeLabel = (item: { id: FetchMode; label: string }): Localized =>
  item.id === 'direct' ? { zh: '直连', en: 'Direct' } : item.label;

function InfoRow({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <span className="w-28 shrink-0 text-xs text-ink-3">{label}</span>
      <span className={`min-w-0 flex-1 break-all text-sm ${tone === 'warn' ? 'text-warn' : 'text-ink'}`}>
        {value || <span className="text-ink-3">{t({ zh: '未设置', en: 'Not set' })}</span>}
      </span>
    </div>
  );
}

function buildDiagnosis(report: SeoReport): L10n[] {
  const issues: L10n[] = [];
  if (!report.title) issues.push({ zh: '缺少 title 标签', en: 'Missing title tag' });
  else if (report.titleLength > 60) issues.push({ zh: `title 长度 ${report.titleLength} 字符，建议控制在 60 以内`, en: `title is ${report.titleLength} characters; keep it under 60` });
  if (!report.description) issues.push({ zh: '缺少 meta description', en: 'Missing meta description' });
  else if (report.description.length > 160) issues.push({ zh: `description 长度 ${report.description.length} 字符，建议控制在 160 以内`, en: `description is ${report.description.length} characters; keep it under 160` });
  if (report.h1.length === 0) issues.push({ zh: '缺少 H1 标题', en: 'Missing H1 heading' });
  else if (report.h1.length > 1) issues.push({ zh: `存在 ${report.h1.length} 个 H1，建议保留 1 个`, en: `${report.h1.length} H1 headings found; keep only 1` });
  if (!report.canonical) issues.push({ zh: '缺少 canonical 链接', en: 'Missing canonical link' });
  if (!report.lang) issues.push({ zh: 'html 标签缺少 lang 属性', en: 'html tag missing lang attribute' });
  if (report.imageTotal > 0 && report.imagesWithoutAlt === report.imageTotal) issues.push({ zh: '所有图片均缺少 alt 属性', en: 'All images are missing alt attributes' });
  if (Object.keys(report.og).length === 0) issues.push({ zh: '缺少 Open Graph 标签', en: 'Missing Open Graph tags' });
  if (/noindex/i.test(report.robotsMeta)) issues.push({ zh: `robots meta 包含 noindex：${report.robotsMeta}`, en: `robots meta contains noindex: ${report.robotsMeta}` });
  return issues;
}

export default function SeoCheckTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<FetchMode>('allorigins');
  const [url, setUrl] = useState('https://example.com');
  const [report, setReport] = useState<SeoReport | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [error, setError] = useState<Localized | null>(null);
  const [hint, setHint] = useState<Localized | undefined>();
  const [loading, setLoading] = useState(false);

  const check = async () => {
    const target = url.trim();
    if (!target) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const resolved = target.startsWith('http') ? target : `https://${target}`;
      const html = await grabHtml(resolved, mode);
      setReport(extractSeo(html, resolved));
      setSourceUrl(resolved);
    } catch (caught) {
      const err = toToolError(caught);
      setError(err.localized);
      setHint(err.hint);
    } finally {
      setLoading(false);
    }
  };

  const issues = report ? buildDiagnosis(report) : [];

  const summaryText = report
    ? [
        `URL: ${sourceUrl}`,
        `title: ${report.title}`,
        `description: ${report.description}`,
        `keywords: ${report.keywords}`,
        `canonical: ${report.canonical}`,
        `lang: ${report.lang}`,
        `charset: ${report.charset}`,
        `robots: ${report.robotsMeta}`,
        `H1: ${report.h1.join(' / ')}`,
        t({ zh: `H2 数量: ${report.h2Count}`, en: `H2 count: ${report.h2Count}` }),
        t({ zh: `图片: ${report.imageTotal}（缺 alt ${report.imagesWithoutAlt}）`, en: `Images: ${report.imageTotal} (${report.imagesWithoutAlt} missing alt)` }),
        t({ zh: `链接: 同域 ${report.linkInternal} / 外域 ${report.linkExternal}`, en: `Links: ${report.linkInternal} internal / ${report.linkExternal} external` }),
        '',
        t({ zh: '诊断问题:', en: 'Issues:' }),
        ...(issues.length ? issues.map((item) => `- ${t(item)}`) : [t({ zh: '无', en: 'None' })]),
      ].join('\n')
    : '';

  return (
    <div className="space-y-4">
      <Segmented
        value={mode}
        onChange={setMode}
        ariaLabel={t({ zh: '抓取通道', en: 'Fetch channel' })}
        options={FETCH_MODES.map((item) => ({ value: item.id, label: t(fetchModeLabel(item)) }))}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void check();
          }}
          placeholder="https://www.example.com"
          mono
          className="h-9 min-w-64 flex-1 text-xs"
          aria-label={t({ zh: '目标网址', en: 'Target URL' })}
        />
        <Button variant="primary" onClick={() => void check()} disabled={loading}>
          <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
          {loading ? t({ zh: '抓取分析中…', en: 'Analyzing…' }) : t({ zh: '开始查询', en: 'Run check' })}
        </Button>
      </div>

      {error ? <ToolAlert tone="error" title={error} hint={hint} /> : null}

      {report ? (
        <>
          {issues.length > 0 ? (
            <ToolAlert tone="warning" title={t({ zh: `发现 ${issues.length} 个可优化项`, en: `${issues.length} improvement opportunity(ies) found` })}>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                {issues.map((item, index) => (
                  <li key={index}>{t(item)}</li>
                ))}
              </ul>
            </ToolAlert>
          ) : (
            <ToolAlert tone="success" title={t({ zh: '未发现常见 SEO 问题', en: 'No common SEO issues found' })} />
          )}

          <ActionBar>
            <span className="px-1 text-xs text-ink-3">{sourceUrl}</span>
            <div className="ml-auto">
              <CopyButton text={summaryText} label={{ zh: '复制报告', en: 'Copy report' }} />
            </div>
          </ActionBar>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t({ zh: '基础标签', en: 'Basic tags' })} bodyClassName="p-0">
              <InfoRow label="title" value={report.title} tone={report.title ? undefined : 'warn'} />
              <InfoRow label="description" value={report.description} tone={report.description ? undefined : 'warn'} />
              <InfoRow label="keywords" value={report.keywords} />
              <InfoRow label="canonical" value={report.canonical} />
              <InfoRow label="lang" value={report.lang} />
              <InfoRow label="charset" value={report.charset} />
              <InfoRow label="robots meta" value={report.robotsMeta} />
              <InfoRow label="viewport" value={report.viewport} />
            </Panel>

            <div className="space-y-4">
              <Panel title={t({ zh: '内容统计', en: 'Content stats' })} bodyClassName="p-0">
                <InfoRow label="H1" value={report.h1.join(' / ')} />
                <InfoRow label={t({ zh: 'H2 数量', en: 'H2 count' })} value={String(report.h2Count)} />
                <InfoRow
                  label={t({ zh: '图片', en: 'Images' })}
                  value={t({ zh: `${report.imageTotal} 张${report.imageTotal ? `，${report.imagesWithoutAlt} 张缺少 alt` : ''}`, en: `${report.imageTotal} total${report.imageTotal ? `, ${report.imagesWithoutAlt} missing alt` : ''}` })}
                />
                <InfoRow
                  label={t({ zh: '链接', en: 'Links' })}
                  value={t({ zh: `同域 ${report.linkInternal} · 外域 ${report.linkExternal}`, en: `${report.linkInternal} internal · ${report.linkExternal} external` })}
                />
              </Panel>

              <Panel title={t({ zh: '社交分享标签', en: 'Social sharing tags' })} bodyClassName="p-0">
                {Object.keys(report.og).length === 0 && Object.keys(report.twitter).length === 0 ? (
                  <div className="px-4 py-4 text-xs text-ink-3">{t({ zh: '未检测到 Open Graph / Twitter Card 标签', en: 'No Open Graph / Twitter Card tags detected' })}</div>
                ) : (
                  <>
                    {Object.entries(report.og).map(([key, value]) => (
                      <InfoRow key={`og-${key}`} label={`og:${key}`} value={value} />
                    ))}
                    {Object.entries(report.twitter).map(([key, value]) => (
                      <InfoRow key={`tw-${key}`} label={`twitter:${key}`} value={value} />
                    ))}
                  </>
                )}
              </Panel>
            </div>
          </div>
        </>
      ) : null}

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '结果基于服务端返回的初始 HTML；由 JavaScript 动态渲染的内容不在检测范围内。', en: 'Results are based on the initial HTML from the server; JavaScript-rendered content is not covered.' })}
      </p>
    </div>
  );
}
