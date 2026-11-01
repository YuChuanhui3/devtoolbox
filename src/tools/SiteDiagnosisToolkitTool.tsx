import { useState } from 'react';
import { Globe, Link2, ListChecks, Network, Radar, Rows3 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { useToolContext } from '@/components/tool/ToolContext';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { DnsPanel } from './site-diagnosis-toolkit/DnsPanel';
import { HeadersPanel } from './site-diagnosis-toolkit/HeadersPanel';
import { LinksPanel } from './site-diagnosis-toolkit/LinksPanel';
import { NsPanel } from './site-diagnosis-toolkit/NsPanel';
import { SeoPanel } from './site-diagnosis-toolkit/SeoPanel';
import { WebcheckPanel } from './site-diagnosis-toolkit/WebcheckPanel';

type SiteDiagnosisMode = 'dns' | 'ns' | 'links' | 'seo' | 'headers' | 'webcheck';

export default function SiteDiagnosisToolkitTool() {
  const { t } = useI18n();
  const toolContext = useToolContext();
  const [mode, setMode] = useToolkitMode<SiteDiagnosisMode>(['dns', 'ns', 'links', 'seo', 'headers', 'webcheck'], 'dns');
  const [urlTextState, setUrlTextState] = useState(() => toolContext?.initialInput ?? '');

  const { markDirty } = useDraftAutosave(
    () => urlTextState || null,
    [urlTextState],
    () => setUrlTextState(''),
  );

  const setUrlText = (value: string) => {
    markDirty();
    setUrlTextState(value);
  };

  const panelProps = { url: urlTextState, setUrl: setUrlText };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <Input
          value={urlTextState}
          onChange={(e) => setUrlText(e.target.value)}
          placeholder={t({
            zh: '共享网址或域名，如 https://example.com…',
            en: 'Shared URL or domain, e.g. https://example.com…',
          })}
          mono
          className="pl-9"
          aria-label={t({ zh: '共享网址输入', en: 'Shared URL input' })}
        />
      </div>

      <div className="flex justify-center">
        <Segmented<SiteDiagnosisMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '网站诊断模式', en: 'Site diagnosis mode' })}
          options={[
            {
              value: 'dns',
              label: t({ zh: 'DNS 记录', en: 'DNS' }),
              icon: <Network className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'ns',
              label: t({ zh: 'NS 查询', en: 'NS' }),
              icon: <Globe className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'links',
              label: t({ zh: '链接抓取', en: 'Links' }),
              icon: <Link2 className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'seo',
              label: t({ zh: 'SEO 检查', en: 'SEO' }),
              icon: <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'headers',
              label: t({ zh: '响应头', en: 'Headers' }),
              icon: <Rows3 className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'webcheck',
              label: t({ zh: '综合体检', en: 'Checkup' }),
              icon: <Radar className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <div className={mode === 'dns' ? 'contents' : 'hidden'}>
        <DnsPanel {...panelProps} active={mode === 'dns'} />
      </div>
      <div className={mode === 'ns' ? 'contents' : 'hidden'}>
        <NsPanel {...panelProps} active={mode === 'ns'} />
      </div>
      <div className={mode === 'links' ? 'contents' : 'hidden'}>
        <LinksPanel {...panelProps} active={mode === 'links'} />
      </div>
      <div className={mode === 'seo' ? 'contents' : 'hidden'}>
        <SeoPanel {...panelProps} active={mode === 'seo'} />
      </div>
      <div className={mode === 'headers' ? 'contents' : 'hidden'}>
        <HeadersPanel {...panelProps} active={mode === 'headers'} />
      </div>
      <div className={mode === 'webcheck' ? 'contents' : 'hidden'}>
        <WebcheckPanel {...panelProps} active={mode === 'webcheck'} />
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '六种站点诊断共享同一份网址：填写一次，即可查 DNS 记录、NS 与注册信息、抓取站内链接、检查 SEO、分析响应头或做网络综合体检 · 切换模式不会丢失各自的查询结果',
          en: 'Six site diagnostics share one URL: fill it once, then check DNS records, NS and registration data, crawl on-site links, run SEO checks, analyze response headers, or do a full network checkup · switching modes keeps each panel\'s results',
        })}
      </p>
    </div>
  );
}
