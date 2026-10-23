import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { ActionBar, CopyButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { FETCH_MODES, grabHtml, type FetchMode } from '@/lib/net';
import { extractLinks, type LinkInfo } from '@/lib/htmlinspect';

type Filter = 'all' | 'internal' | 'external';

/** lib 中 FETCH_MODES 的中文名在此覆盖为双语，其余标签保持原样。 */
const fetchModeLabel = (item: { id: FetchMode; label: string }): Localized =>
  item.id === 'direct' ? { zh: '直连', en: 'Direct' } : item.label;

function LinkTable({ links }: { links: LinkInfo[] }) {
  const { t } = useI18n();
  if (links.length === 0) {
    return <div className="px-4 py-8 text-center text-xs text-ink-3">{t({ zh: '没有匹配的链接', en: 'No matching links' })}</div>;
  }
  return (
    <ul className="divide-y divide-line">
      {links.map((link, index) => (
        <li key={`${link.absolute}-${index}`} className="flex items-start gap-3 px-4 py-2.5">
          <span
            className={
              link.internal
                ? 'mt-0.5 shrink-0 rounded-lg bg-ok-soft px-1.5 py-0.5 text-[10px] text-ok'
                : 'mt-0.5 shrink-0 rounded-lg bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent-strong'
            }
          >
            {link.internal ? t({ zh: '同域', en: 'Internal' }) : t({ zh: '外域', en: 'External' })}
          </span>
          <div className="min-w-0 flex-1">
            <code className="block break-all font-mono text-[12px] text-ink">{link.absolute}</code>
            {link.text ? (
              <p className="mt-0.5 truncate text-xs text-ink-3" title={link.text}>
                {link.text}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function SiteLinksTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<FetchMode>('allorigins');
  const [url, setUrl] = useState('https://example.com');
  const [links, setLinks] = useState<{ internal: LinkInfo[]; external: LinkInfo[]; skipped: number } | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<Localized | null>(null);
  const [hint, setHint] = useState<Localized | undefined>();
  const [loading, setLoading] = useState(false);

  const scan = async () => {
    const target = url.trim();
    if (!target) return;
    setLoading(true);
    setError(null);
    setLinks(null);
    try {
      const html = await grabHtml(target, mode);
      const resolved = target.startsWith('http') ? target : `https://${target}`;
      setLinks(extractLinks(html, resolved));
    } catch (caught) {
      const err = toToolError(caught);
      setError(err.localized);
      setHint(err.hint);
    } finally {
      setLoading(false);
    }
  };

  const displayed = links
    ? filter === 'internal'
      ? links.internal
      : filter === 'external'
        ? links.external
        : [...links.internal, ...links.external]
    : [];

  const allText = links
    ? [
        t({ zh: `# 同域链接 ${links.internal.length} 条`, en: `# ${links.internal.length} internal links` }),
        ...links.internal.map((l) => l.absolute),
        '',
        t({ zh: `# 外域链接 ${links.external.length} 条`, en: `# ${links.external.length} external links` }),
        ...links.external.map((l) => l.absolute),
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
            if (event.key === 'Enter') void scan();
          }}
          placeholder="https://www.example.com"
          mono
          className="h-9 min-w-64 flex-1 text-xs"
          aria-label={t({ zh: '目标网址', en: 'Target URL' })}
        />
        <Button variant="primary" onClick={() => void scan()} disabled={loading}>
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          {loading ? t({ zh: '抓取解析中…', en: 'Fetching…' }) : t({ zh: '查询链接', en: 'Scan links' })}
        </Button>
      </div>

      {error ? <ToolAlert tone="error" title={error} hint={hint} /> : null}

      {links ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Panel title={t({ zh: '同域链接', en: 'Internal links' })} bodyClassName="p-4 text-center">
              <div className="text-2xl font-semibold text-accent-strong">{links.internal.length}</div>
            </Panel>
            <Panel title={t({ zh: '外域链接', en: 'External links' })} bodyClassName="p-4 text-center">
              <div className="text-2xl font-semibold text-ink">{links.external.length}</div>
            </Panel>
            <Panel title={t({ zh: '已跳过', en: 'Skipped' })} bodyClassName="p-4 text-center">
              <div className="text-2xl font-semibold text-ink-3">{links.skipped}</div>
              <p className="mt-1 text-[11px] text-ink-3">{t({ zh: 'javascript / mailto / 锚点等', en: 'javascript / mailto / anchors, etc.' })}</p>
            </Panel>
          </div>

          <ActionBar>
            <Segmented
              value={filter}
              onChange={setFilter}
              ariaLabel={t({ zh: '链接筛选', en: 'Link filter' })}
              options={[
                { value: 'all', label: t({ zh: `全部 ${links.internal.length + links.external.length}`, en: `All ${links.internal.length + links.external.length}` }) },
                { value: 'internal', label: t({ zh: `同域 ${links.internal.length}`, en: `Internal ${links.internal.length}` }) },
                { value: 'external', label: t({ zh: `外域 ${links.external.length}`, en: `External ${links.external.length}` }) },
              ]}
            />
            <div className="ml-auto">
              <CopyButton text={allText} label={{ zh: '复制全部链接', en: 'Copy all links' }} />
            </div>
          </ActionBar>

          <Panel title={t({ zh: '链接列表', en: 'Link list' })} subtitle={t({ zh: '按绝对地址去重', en: 'Deduplicated by absolute URL' })} bodyClassName="p-0">
            <div className="max-h-[480px] overflow-auto">
              <LinkTable links={displayed} />
            </div>
          </Panel>
        </>
      ) : null}

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '通过公共 CORS 代理抓取页面 HTML 后在本地解析 <a> 标签；重度依赖 JS 渲染的站点可能取不到动态插入的链接。', en: 'Page HTML is fetched via a public CORS proxy and <a> tags are parsed locally. JS-heavy sites may have dynamically inserted links that are not captured.' })}
      </p>
    </div>
  );
}
