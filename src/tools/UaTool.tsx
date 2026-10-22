import { useMemo, useState } from 'react';
import { UAParser } from 'ua-parser-js';
import { MonitorSmartphone } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { InputPanel } from '@/components/tool/EditorPanels';
import { ActionBar, ClearButton, CopyButton, CopyIconButton, SampleButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { SAMPLE_UA } from '@/data/samples';

function FieldRow({ label, value }: { label: Localized; value: Localized }) {
  const { t } = useI18n();
  const labelValue = t(label);
  const text = t(value);
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <span className="w-20 shrink-0 text-xs text-ink-3">{labelValue}</span>
      <span className="min-w-0 flex-1 break-all text-sm text-ink">{text}</span>
      <CopyIconButton text={text} label={t({ zh: `复制${labelValue}`, en: `Copy ${labelValue}` })} />
    </div>
  );
}

export default function UaTool() {
  const { t } = useI18n();
  const [input, setInput] = useState(SAMPLE_UA);
  const debounced = useDebouncedValue(input, 200);

  const parsed = useMemo(() => {
    if (!debounced.trim()) return { data: null, error: null as Localized | null };
    try {
      const result = new UAParser(debounced).getResult();
      return { data: result, error: null };
    } catch (caught) {
      return { data: null, error: toToolError(caught).localized };
    }
  }, [debounced]);

  const summary = parsed.data
    ? [
        {
          label: { zh: '浏览器', en: 'Browser' } as Localized,
          value: [parsed.data.browser.name, parsed.data.browser.version].filter(Boolean).join(' ') || { zh: '未知', en: 'Unknown' },
        },
        { label: { zh: '引擎', en: 'Engine' }, value: [parsed.data.engine.name, parsed.data.engine.version].filter(Boolean).join(' ') || { zh: '未知', en: 'Unknown' } },
        { label: { zh: '操作系统', en: 'OS' }, value: [parsed.data.os.name, parsed.data.os.version].filter(Boolean).join(' ') || { zh: '未知', en: 'Unknown' } },
        { label: { zh: '设备类型', en: 'Device type' }, value: parsed.data.device.type || { zh: '桌面设备（未识别）', en: 'Desktop (unrecognized)' } },
        { label: { zh: '设备厂商', en: 'Device vendor' }, value: parsed.data.device.vendor || { zh: '未知', en: 'Unknown' } },
        { label: { zh: '设备型号', en: 'Device model' }, value: parsed.data.device.model || { zh: '未知', en: 'Unknown' } },
        { label: { zh: 'CPU 架构', en: 'CPU architecture' }, value: parsed.data.cpu.architecture || { zh: '未知', en: 'Unknown' } },
      ]
    : [];

  return (
    <div className="space-y-4">
      <ActionBar>
        <span className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-3">
          <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '输入后自动解析', en: 'Parses automatically as you type' })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setInput(navigator.userAgent)}
            className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink-2 transition-colors hover:border-accent/40 hover:text-accent-strong"
          >
            {t({ zh: '解析当前浏览器', en: 'Parse current browser' })}
          </button>
          <SampleButton onClick={() => setInput(SAMPLE_UA)} />
          <ClearButton onClick={() => setInput('')} />
          <CopyButton
            text={summary.map((item) => `${t(item.label)}: ${t(item.value)}`).join('\n')}
            label={{ zh: '复制结果', en: 'Copy results' }}
          />
        </div>
      </ActionBar>

      {parsed.error ? <ToolAlert tone="error" title={parsed.error} /> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <InputPanel
          label="User-Agent"
          value={input}
          onChange={setInput}
          placeholder={{ zh: '粘贴 User-Agent 字符串…', en: 'Paste a User-Agent string…' }}
          minHeight={220}
        />

        <div className="space-y-4">
          <Panel
            title={t({ zh: '解析结果', en: 'Parsed result' })}
            subtitle={parsed.data ? t({ zh: '基于 ua-parser-js', en: 'Powered by ua-parser-js' }) : t({ zh: '等待输入', en: 'Waiting for input' })}
            bodyClassName="p-0"
          >
            {parsed.data ? (
              summary.map((item, index) => <FieldRow key={index} label={item.label} value={item.value} />)
            ) : (
              <div className="flex min-h-[220px] items-center justify-center px-4 text-xs text-ink-3">
                {t({ zh: '输入 UA 后展示浏览器、系统与设备信息', en: 'Enter a UA to see browser, OS, and device details' })}
              </div>
            )}
          </Panel>

          {parsed.data ? (
            <Panel title={t({ zh: '原始 UA', en: 'Raw UA' })} bodyClassName="p-4">
              <code className="block break-all font-mono text-[11px] leading-5 text-ink-3">{parsed.data.ua}</code>
            </Panel>
          ) : null}
        </div>
      </div>

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: 'UA 解析基于字符串特征匹配，结果可能因浏览器伪装或新版本而变化。',
          en: 'UA parsing relies on string pattern matching; results may vary with browser spoofing or new versions.',
        })}
      </p>
    </div>
  );
}
