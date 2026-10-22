import { useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { InputPanel } from '@/components/tool/EditorPanels';
import { ActionBar, ClearButton, CopyButton, CopyIconButton, DownloadButton, SampleButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { parseUrl, type ParsedUrl } from '@/lib/url';
import { toToolError, type ToolError } from '@/lib/errors';
import { useI18n } from '@/i18n/I18nProvider';
import { SAMPLE_URL } from '@/data/samples';

function FieldRow({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <span className="w-24 shrink-0 text-xs text-ink-3">{label}</span>
      <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-5 text-ink">
        {value || <span className="text-ink-3">{t({ zh: '（空）', en: '(empty)' })}</span>}
      </code>
      <CopyIconButton text={value} label={t({ zh: `复制${label}`, en: `Copy ${label}` })} />
    </div>
  );
}

export default function UrlParserTool() {
  const { t } = useI18n();
  const [input, setInput] = useState(SAMPLE_URL);
  const debounced = useDebouncedValue(input, 150);

  const parsed = useMemo<{ data: ParsedUrl | null; error: ToolError | null }>(() => {
    if (!debounced.trim()) return { data: null, error: null };
    try {
      return { data: parseUrl(debounced), error: null };
    } catch (caught) {
      return { data: null, error: toToolError(caught) };
    }
  }, [debounced]);

  const jsonContent = useMemo(() => {
    if (!parsed.data) return '';
    const {
      href,
      protocol,
      username,
      password,
      hostname,
      port,
      host,
      pathname,
      search,
      hash,
      origin,
      query,
    } = parsed.data;
    return JSON.stringify(
      { href, protocol, username, password, hostname, port, host, pathname, search, hash, origin, query },
      null,
      2,
    );
  }, [parsed.data]);

  return (
    <div className="space-y-4">
      <ActionBar>
        <span className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-3">
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '输入后自动解析', en: 'Parses automatically as you type' })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton onClick={() => setInput(SAMPLE_URL)} />
          <ClearButton onClick={() => setInput('')} />
          <CopyButton text={jsonContent} label={{ zh: '复制 JSON', en: 'Copy JSON' }} />
          <DownloadButton filename="url.json" content={jsonContent} mime="application/json;charset=utf-8" />
        </div>
      </ActionBar>

      {parsed.error ? <ToolAlert tone="error" title={parsed.error.localized} hint={parsed.error.hint} /> : null}
      {parsed.data?.assumedProtocol ? (
        <ToolAlert
          tone="info"
          title={{ zh: '已自动补全 https:// 协议', en: 'https:// scheme added automatically' }}
          hint={{ zh: '输入未包含协议时，默认按 HTTPS 解析。', en: 'Inputs without a scheme are parsed as HTTPS by default.' }}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <InputPanel
          label={{ zh: 'URL 地址', en: 'URL' }}
          value={input}
          onChange={setInput}
          placeholder="https://www.example.com/path?name=demo#section"
          minHeight={220}
        />

        <div className="space-y-4">
          <Panel title={t({ zh: '解析字段', en: 'Parsed fields' })} bodyClassName="p-0">
            {parsed.data ? (
              <>
                <FieldRow label="protocol" value={parsed.data.protocol} />
                <FieldRow label="hostname" value={parsed.data.hostname} />
                <FieldRow label="port" value={parsed.data.port} />
                <FieldRow label="pathname" value={parsed.data.pathname} />
                <FieldRow label="search" value={parsed.data.search} />
                <FieldRow label="hash" value={parsed.data.hash} />
                <FieldRow label="origin" value={parsed.data.origin} />
                {parsed.data.username ? <FieldRow label="username" value={parsed.data.username} /> : null}
                {parsed.data.password ? <FieldRow label="password" value={parsed.data.password} /> : null}
              </>
            ) : (
              <div className="flex min-h-[220px] items-center justify-center px-4 text-xs text-ink-3">
                {t({ zh: '输入完整 URL 后展示各组成部分', en: 'Enter a full URL to see its components' })}
              </div>
            )}
          </Panel>

          <Panel
            title={t({ zh: '查询参数', en: 'Query parameters' })}
            subtitle={
              parsed.data
                ? t({ zh: `${parsed.data.query.length} 个参数`, en: `${parsed.data.query.length} parameters` })
                : t({ zh: '解析后展示', en: 'Shown after parsing' })
            }
            bodyClassName="p-0"
          >
            {parsed.data && parsed.data.query.length > 0 ? (
              <ul className="divide-y divide-line">
                {parsed.data.query.map((entry, index) => (
                  <li key={`${entry.key}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                    <code className="w-1/3 shrink-0 break-all font-mono text-[12px] text-accent-strong">
                      {entry.key}
                    </code>
                    <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink-2">
                      {entry.value}
                    </code>
                    <CopyIconButton text={entry.value} label={t({ zh: `复制参数 ${entry.key}`, en: `Copy parameter ${entry.key}` })} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex min-h-[96px] items-center justify-center text-xs text-ink-3">
                {t({ zh: 'URL 中没有查询参数', en: 'The URL has no query parameters' })}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: '查询参数值会自动进行 URL 解码展示，原始 search 字段保留编码后的形式。',
          en: 'Query parameter values are URL-decoded for display; the raw search field keeps the encoded form.',
        })}
      </p>
    </div>
  );
}
