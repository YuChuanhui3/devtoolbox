import { useMemo, useState } from 'react';
import { JSONPath } from 'jsonpath-plus';
import { Play, SearchCode } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { InputPanel, OutputPanel, StatsBar } from '@/components/tool/EditorPanels';
import {
  ActionBar,
  ClearButton,
  CopyButton,
  CopyIconButton,
  DownloadButton,
  SampleButton,
} from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useToolIO } from '@/hooks/useToolIO';
import { useHotkey } from '@/hooks/useHotkey';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { ToolError, errorHint } from '@/lib/errors';
import { highlightJson, parseJson } from '@/lib/json';
import { countTextStats } from '@/lib/text';
import { SAMPLE_JSONPATH, SAMPLE_JSONPATH_INPUT } from '@/data/samples';
import type { ToolkitPanelProps } from './types';

const EXAMPLES = ['$', '$.data.list[*].name', '$.data.list[0]', '$.data.list[*].score'];

export function JsonPathPanel({ input, setInput, active }: ToolkitPanelProps) {
  const { t } = useI18n();
  const io = useToolIO();
  const [path, setPath] = useState(SAMPLE_JSONPATH);
  const [warning, setWarning] = useState<Localized | null>(null);

  const runQuery = async () => {
    setWarning(null);
    let emptyResult = false;

    await io.runWithValue(
      (value) => {
        const data = parseJson(value);
        if (!path.trim()) {
          throw new ToolError(
            { zh: '请输入 JSONPath 表达式', en: 'Enter a JSONPath expression' },
            { zh: '例如 $.data.list[*].name', en: 'For example, $.data.list[*].name' },
          );
        }
        let matches: unknown[];
        try {
          matches = JSONPath({ path: path.trim(), json: data as object, wrap: true });
        } catch (error) {
          throw new ToolError(
            { zh: 'JSONPath 表达式不正确', en: 'Invalid JSONPath expression' },
            errorHint(error, { zh: '请检查路径语法。', en: 'Check the path syntax.' }),
          );
        }
        emptyResult = matches.length === 0;
        return JSON.stringify(matches, null, 2);
      },
      input,
      { success: t({ zh: '查询完成', en: 'Query finished' }) },
    );

    if (emptyResult) {
      setWarning({
        zh: '查询结果为空，请检查路径是否匹配当前 JSON 结构。',
        en: 'The query returned no results; check that the path matches this JSON structure.',
      });
    }
  };

  useHotkey({ key: 'Enter', metaOrCtrl: true, enabled: active }, () => {
    void runQuery();
  });

  const highlighted = useMemo(() => (io.output ? highlightJson(io.output) : ''), [io.output]);
  const inputStats = useMemo(() => countTextStats(input), [input]);
  const outputStats = useMemo(() => countTextStats(io.output), [io.output]);

  const clearAll = () => {
    setInput('');
    io.setOutput('');
    io.setError(null);
    io.setNotice(null);
    setWarning(null);
  };

  return (
    <div className="space-y-4">
      <ActionBar>
        <div className="relative min-w-[220px] flex-1">
          <SearchCode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder={t({ zh: 'JSONPath 表达式，例如 $.data.list[*].name', en: 'JSONPath expression, e.g. $.data.list[*].name' })}
            aria-label={t({ zh: 'JSONPath 表达式', en: 'JSONPath expression' })}
            mono
            className="pl-9"
          />
        </div>
        <Button variant="primary" onClick={() => void runQuery()} disabled={io.isRunning}>
          <Play className="h-4 w-4" aria-hidden="true" />
          {io.isRunning ? t({ zh: '查询中…', en: 'Querying…' }) : t({ zh: '查询', en: 'Query' })}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton
            onClick={() => {
              setInput(SAMPLE_JSONPATH_INPUT);
              setPath(SAMPLE_JSONPATH);
              setWarning(null);
              void io.runWithValue(
                (value) => JSON.stringify(JSONPath({ path: SAMPLE_JSONPATH, json: parseJson(value) as object, wrap: true }), null, 2),
                SAMPLE_JSONPATH_INPUT,
              );
            }}
          />
          <ClearButton onClick={clearAll} />
          <CopyButton text={io.output} label={t({ zh: '复制结果', en: 'Copy result' })} />
          <DownloadButton filename="jsonpath-result.json" content={io.output} mime="application/json;charset=utf-8" />
        </div>
      </ActionBar>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
        <span>{t({ zh: '常用路径：', en: 'Common paths:' })}</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setPath(example)}
            className="rounded-full border border-line bg-surface-2 px-2 py-1 font-mono text-[10px] text-ink-2 transition-colors hover:border-accent/40 hover:text-accent-strong"
          >
            {example}
          </button>
        ))}
      </div>

      {io.error ? <ToolAlert tone="error" title={io.error.localized} hint={io.error.hint} /> : null}
      {warning ? (
        <ToolAlert
          tone="warning"
          title={warning}
          hint={t({ zh: '可用 $ 查看根节点，或用 $.key[*] 遍历数组。', en: 'Use $ for the root node, or $.key[*] to walk an array.' })}
        />
      ) : null}
      {io.notice ? <ToolAlert tone="success" title={io.notice} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          label={t({ zh: 'JSON 输入', en: 'JSON input' })}
          value={input}
          onChange={setInput}
          placeholder={t({ zh: '粘贴 JSON 内容…', en: 'Paste JSON content…' })}
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '行数', en: 'Lines' }), value: inputStats.lines },
                { label: t({ zh: '字符', en: 'Chars' }), value: inputStats.chars },
              ]}
            />
          }
        />
        <OutputPanel
          label={t({ zh: '查询结果', en: 'Query result' })}
          value={io.output}
          html={highlighted}
          emptyText={t({ zh: '点击「查询」查看 JSONPath 匹配结果', en: 'Click Query to see JSONPath matches' })}
          actions={<CopyIconButton text={io.output} label={t({ zh: '复制查询结果', en: 'Copy query result' })} />}
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '行数', en: 'Lines' }), value: outputStats.lines },
                { label: t({ zh: '字符', en: 'Chars' }), value: outputStats.chars },
              ]}
            />
          }
        />
      </div>

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: '支持通配符 *、数组索引、递归下降 ..、过滤表达式等常见 JSONPath 语法',
          en: 'Supports common JSONPath syntax: wildcards *, array indexes, recursive descent .., and filter expressions',
        })}
      </p>
    </div>
  );
}
