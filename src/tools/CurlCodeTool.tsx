import { useMemo, useState } from 'react';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { Textarea } from '@/components/ui/Textarea';
import { ActionBar, CopyButton, SampleButton, ClearButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { toToolError } from '@/lib/errors';
import { CURL_LANGS, curlToCode, type CurlLang } from '@/lib/curl';

const SAMPLE_CURL = `curl 'https://api.github.com/repos/octocat/Hello-World' \\
  -H 'Accept: application/vnd.github+json' \\
  -H 'Authorization: Bearer ghp_exampletoken'`;

export default function CurlCodeTool() {
  const { t } = useI18n();
  const [input, setInput] = useState(SAMPLE_CURL);
  const [lang, setLang] = useState<CurlLang>('python');
  const debounced = useDebouncedValue(input, 250);

  const result = useMemo(() => {
    if (!debounced.trim()) return { code: '', error: null as Localized | null };
    try {
      return { code: curlToCode(debounced, lang), error: null as Localized | null };
    } catch (caught) {
      return { code: '', error: toToolError(caught).localized };
    }
  }, [debounced, lang]);

  const langLabel = CURL_LANGS.find((l) => l.id === lang)?.label ?? '';

  return (
    <div className="space-y-4">
      <ActionBar>
        <Segmented
          value={lang}
          onChange={setLang}
          ariaLabel={t({ zh: '目标语言', en: 'Target language' })}
          options={CURL_LANGS.map((item) => ({ value: item.id, label: item.label }))}
        />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton onClick={() => setInput(SAMPLE_CURL)} />
          <ClearButton onClick={() => setInput('')} />
          <CopyButton text={result.code} label={{ zh: '复制代码', en: 'Copy code' }} />
        </div>
      </ActionBar>

      {result.error ? <ToolAlert tone="error" title={result.error} hint={{ zh: '支持 -X/-H/-d/-u/-A/-e/-b/-G 等常见选项', en: 'Supports common options such as -X/-H/-d/-u/-A/-e/-b/-G' }} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t({ zh: 'curl 命令', en: 'curl command' })} bodyClassName="p-0">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            mono
            rows={14}
            spellCheck={false}
            className="h-full min-h-[300px] resize-none rounded-none border-0 text-[12px]"
            placeholder={t({ zh: '粘贴 curl 命令，支持多行（\\ 续行）…', en: 'Paste a curl command; multi-line supported (\\ line continuation)…' })}
            aria-label={t({ zh: 'curl 命令', en: 'curl command' })}
          />
        </Panel>

        <Panel title={t({ zh: `${langLabel} 代码`, en: `${langLabel} code` })} subtitle={t({ zh: '从 Chrome DevTools「Copy as cURL」导出后可直接粘贴', en: 'Paste directly after exporting via "Copy as cURL" in Chrome DevTools' })} bodyClassName="p-0">
          {result.code ? (
            <pre className="h-full min-h-[300px] overflow-auto rounded-none bg-code-bg p-4 font-mono text-[12px] leading-6 text-ink">
              {result.code}
            </pre>
          ) : (
            <div className="flex min-h-[300px] items-center justify-center text-xs text-ink-3">
              {t({ zh: '输入 curl 命令后自动生成', en: 'Enter a curl command to generate code' })}
            </div>
          )}
        </Panel>
      </div>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '支持常用选项：-X/-H/-d（含 --data-raw / --data-binary）/-u/-A/-e/-b/-G/--url；-s -L -k --compressed 等开关会被忽略。', en: 'Supported options: -X/-H/-d (including --data-raw / --data-binary)/-u/-A/-e/-b/-G/--url; flags such as -s -L -k --compressed are ignored.' })}
      </p>
    </div>
  );
}
