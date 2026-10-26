import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
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
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useI18n } from '@/i18n/I18nProvider';
import { toToolError } from '@/lib/errors';
import { highlightJson } from '@/lib/json';
import type { QueryFlags } from '@/lib/url';
import {
  convertFormat,
  FORMAT_ORDER,
  FORMATS,
  type ConvertOptions,
  type FormatId,
} from '@/lib/formats';
import { countTextStats } from '@/lib/text';
import type { ToolkitPanelProps } from './types';

const CSV_DELIMITERS: Array<{ value: string; zh: string; en: string }> = [
  { value: ',', zh: '逗号', en: 'Comma' },
  { value: ';', zh: '分号', en: 'Semicolon' },
  { value: '\t', zh: '制表符', en: 'Tab' },
  { value: '|', zh: '竖线', en: 'Pipe' },
];

export function ConverterPanel({ input, setInput }: ToolkitPanelProps) {
  const { t } = useI18n();
  const io = useToolIO();
  const [from, setFrom] = useState<FormatId>('json');
  const [to, setTo] = useState<FormatId>('yaml');
  const [indent, setIndent] = useState<'2' | '4'>('2');
  const [rootName, setRootName] = useState('root');
  const [sortKeys, setSortKeys] = useState(false);
  const [csvDelimiter, setCsvDelimiter] = useState(',');
  const [csvHasHeader, setCsvHasHeader] = useState(true);
  const [expandDots, setExpandDots] = useState(true);
  const [queryFlags, setQueryFlags] = useState<QueryFlags>({
    encode: true,
    parseArrays: true,
    coerceTypes: true,
    bracketArrays: false,
  });

  const options: ConvertOptions = useMemo(
    () => ({
      indent: Number(indent),
      rootName,
      sortKeys,
      csvDelimiter,
      csvHasHeader,
      expandDots,
      queryFlags,
    }),
    [indent, rootName, sortKeys, csvDelimiter, csvHasHeader, expandDots, queryFlags],
  );

  const fromSpec = FORMATS[from];
  const toSpec = FORMATS[to];

  const debouncedInput = useDebouncedValue(input, 250);
  const { setOutput, setError } = io;

  useEffect(() => {
    if (!debouncedInput.trim()) {
      setOutput('');
      setError(null);
      return;
    }
    try {
      setOutput(convertFormat(debouncedInput, from, to, options));
      setError(null);
    } catch (caught) {
      setError(toToolError(caught));
      setOutput('');
    }
  }, [debouncedInput, from, to, options, setOutput, setError]);

  const updateQueryFlag = (key: keyof QueryFlags) => (value: boolean) =>
    setQueryFlags((current) => ({ ...current, [key]: value }));

  const formatChoices = FORMAT_ORDER.map((id) => ({ value: id, label: FORMATS[id].label }));

  const showIndent = to === 'json' || to === 'yaml';
  const showSortKeys = to === 'json' || to === 'yaml' || to === 'properties';
  const involvesQuery = from === 'query' || to === 'query';

  const highlighted = useMemo(
    () => (io.output && to === 'json' ? highlightJson(io.output) : undefined),
    [io.output, to],
  );
  const inputStats = useMemo(() => countTextStats(input), [input]);
  const outputStats = useMemo(() => countTextStats(io.output), [io.output]);

  const handleSwap = () => {
    if (io.output) setInput(io.output);
    setFrom(to);
    setTo(from);
  };

  const handleClear = () => {
    setInput('');
    io.setOutput('');
    io.setError(null);
    io.setNotice(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 shrink-0 text-xs font-medium text-ink-3">
            {t({ zh: '输入格式', en: 'From' })}
          </span>
          <Segmented<FormatId>
            value={from}
            onChange={setFrom}
            ariaLabel={t({ zh: '输入格式', en: 'Input format' })}
            size="sm"
            options={formatChoices}
          />
        </div>
        <div className="my-1.5 flex items-center gap-2 pl-[4.5rem] text-ink-3">
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-[11px]">{t({ zh: '转换为', en: 'converts to' })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 shrink-0 text-xs font-medium text-ink-3">
            {t({ zh: '输出格式', en: 'To' })}
          </span>
          <Segmented<FormatId>
            value={to}
            onChange={setTo}
            ariaLabel={t({ zh: '输出格式', en: 'Output format' })}
            size="sm"
            options={formatChoices}
          />
        </div>
      </div>

      <ActionBar>
        <span className="px-1 text-xs text-ink-3">
          {t({ zh: '输入即实时转换（共享输入区内容按所选格式解析）', en: 'Live conversion as you type (the shared input is parsed in the chosen format)' })}
        </span>

        <span className="mx-1 hidden h-4 w-px bg-line sm:block" />

        <span className="mx-1 hidden h-4 w-px bg-line sm:block" />

        <Button variant="secondary" size="sm" onClick={handleSwap} disabled={!io.output}>
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '交换方向', en: 'Swap direction' })}
        </Button>

        {showIndent ? (
          <Segmented<'2' | '4'>
            value={indent}
            onChange={setIndent}
            ariaLabel={t({ zh: '缩进', en: 'Indent' })}
            size="sm"
            options={[
              { value: '2', label: t({ zh: '2 空格', en: '2 spaces' }) },
              { value: '4', label: t({ zh: '4 空格', en: '4 spaces' }) },
            ]}
          />
        ) : null}
        {to === 'xml' ? (
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-3">
            {t({ zh: '根节点', en: 'Root tag' })}
            <Input
              value={rootName}
              onChange={(event) => setRootName(event.target.value)}
              aria-label={t({ zh: 'XML 根节点名称', en: 'XML root tag name' })}
              className="h-8 w-24 text-xs"
            />
          </label>
        ) : null}
        {from === 'csv' ? (
          <>
            <Segmented<string>
              value={csvDelimiter}
              onChange={setCsvDelimiter}
              ariaLabel={t({ zh: 'CSV 分隔符', en: 'CSV delimiter' })}
              size="sm"
              options={CSV_DELIMITERS.map((item) => ({
                value: item.value,
                label: t({ zh: item.zh, en: item.en }),
              }))}
            />
            <Checkbox
              checked={csvHasHeader}
              onChange={setCsvHasHeader}
              label={t({ zh: '首行为表头', en: 'First row is header' })}
              className="text-xs"
            />
          </>
        ) : null}
        {from === 'properties' ? (
          <Checkbox
            checked={expandDots}
            onChange={setExpandDots}
            label={t({ zh: '展开 a.b / a[0] 为层级结构', en: 'Expand a.b / a[0] into nested structure' })}
            className="text-xs"
          />
        ) : null}
        {showSortKeys ? (
          <Checkbox
            checked={sortKeys}
            onChange={setSortKeys}
            label={t({ zh: '按键名排序', en: 'Sort keys' })}
            className="text-xs"
          />
        ) : null}
        {involvesQuery ? (
          <>
            <Checkbox
              checked={queryFlags.encode}
              onChange={updateQueryFlag('encode')}
              label={t({ zh: 'URL 编码', en: 'URL encode' })}
              className="text-xs"
            />
            <Checkbox
              checked={queryFlags.parseArrays}
              onChange={updateQueryFlag('parseArrays')}
              label={t({ zh: '重复参数转数组', en: 'Repeated params to arrays' })}
              className="text-xs"
            />
            <Checkbox
              checked={queryFlags.coerceTypes}
              onChange={updateQueryFlag('coerceTypes')}
              label={t({ zh: '自动转数字 / 布尔', en: 'Coerce numbers / booleans' })}
              className="text-xs"
            />
            <Checkbox
              checked={queryFlags.bracketArrays}
              onChange={updateQueryFlag('bracketArrays')}
              label={t({ zh: '数组使用 [] 语法', en: 'Use [] syntax for arrays' })}
              className="text-xs"
            />
          </>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton onClick={() => setInput(fromSpec.sample)} />
          <ClearButton onClick={handleClear} />
          <CopyButton text={io.output} label={t({ zh: '复制结果', en: 'Copy result' })} />
          <DownloadButton
            filename={toSpec.filename}
            content={io.output}
            mime={toSpec.mime}
          />
        </div>
      </ActionBar>

      {io.error ? <ToolAlert tone="error" title={io.error.localized} hint={io.error.hint} /> : null}
      {io.notice ? <ToolAlert tone="success" title={io.notice} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          label={t({ zh: `${fromSpec.label} 输入（共享输入区）`, en: `${fromSpec.label} input (shared)` })}
          value={input}
          onChange={setInput}
          placeholder={fromSpec.inputPlaceholder}
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
          label={t({ zh: `${toSpec.label} 结果`, en: `${toSpec.label} result` })}
          value={io.output}
          html={highlighted}
          emptyText={{ zh: '输入内容后实时转换', en: 'Converted output appears as you type' }}
          actions={<CopyIconButton text={io.output} label={t({ zh: `复制${toSpec.label}`, en: `Copy ${toSpec.label}` })} />}
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

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '六种格式任意方向互转，输入即实时转换。XML 只按标签名建立层级、忽略属性；转 CSV 需要数组数据；同格式转换即格式化与规范化。',
          en: 'Convert freely among the six formats in any direction with live output. XML builds hierarchy from tag names only and ignores attributes; CSV output requires array data; same-format conversion formats and normalizes.',
        })}
      </p>
    </div>
  );
}
