import { useMemo, useState } from 'react';
import { Rows3 } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { InputPanel, OutputPanel, StatsBar } from '@/components/tool/EditorPanels';
import { ActionBar, ClearButton, CopyButton, CopyIconButton, DownloadButton, SampleButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { countLines, countTextStats, splitLines } from '@/lib/text';
import { errorHint } from '@/lib/errors';
import { SAMPLE_MULTILINE } from '@/data/samples';

interface Options {
  trim: boolean;
  removeEmpty: boolean;
  removeDuplicates: boolean;
  prefix: string;
  suffix: string;
  addLineNumbers: boolean;
  lineStart: string;
  lineSeparator: string;
  quote: boolean;
  quoteChar: string;
  escapeQuotes: boolean;
  join: boolean;
  joinSeparator: string;
  find: string;
  replace: string;
  useRegex: boolean;
}

const DEFAULT: Options = {
  trim: true,
  removeEmpty: true,
  removeDuplicates: false,
  prefix: '',
  suffix: '',
  addLineNumbers: false,
  lineStart: '1',
  lineSeparator: '. ',
  quote: false,
  quoteChar: '"',
  escapeQuotes: true,
  join: false,
  joinSeparator: ', ',
  find: '',
  replace: '',
  useRegex: false,
};

function processText(input: string, options: Options): { output: string; error: Localized | null } {
  let lines = splitLines(input);
  let regex: RegExp | null = null;

  if (options.find) {
    try {
      regex = options.useRegex ? new RegExp(options.find, 'g') : null;
    } catch (error) {
      return { output: '', error: errorHint(error, { zh: '正则表达式不正确', en: 'Invalid regular expression' }) };
    }
  }

  if (options.trim) lines = lines.map((line) => line.trim());
  if (options.removeEmpty) lines = lines.filter((line) => line.trim() !== '');
  if (options.removeDuplicates) {
    const seen = new Set<string>();
    lines = lines.filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
  }

  if (options.find) {
    lines = lines.map((line) =>
      regex ? line.replace(regex, options.replace) : line.split(options.find).join(options.replace),
    );
  }

  if (options.prefix) lines = lines.map((line) => `${options.prefix}${line}`);
  if (options.suffix) lines = lines.map((line) => `${line}${options.suffix}`);

  if (options.addLineNumbers) {
    const start = Number(options.lineStart) || 1;
    lines = lines.map((line, index) => `${start + index}${options.lineSeparator}${line}`);
  }

  if (options.quote) {
    const escapePattern = new RegExp(options.quoteChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    lines = lines.map((line) => {
      const content = options.escapeQuotes
        ? line.replace(/\\/g, '\\\\').replace(escapePattern, `\\${options.quoteChar}`)
        : line;
      return `${options.quoteChar}${content}${options.quoteChar}`;
    });
  }

  return {
    output: options.join ? lines.join(options.joinSeparator) : lines.join('\n'),
    error: null,
  };
}

export default function MultiLineTool() {
  const { t } = useI18n();
  const [input, setInput] = useState(SAMPLE_MULTILINE);
  const [options, setOptions] = useState<Options>(DEFAULT);

  const processed = useMemo(() => processText(input, options), [input, options]);
  const inputStats = useMemo(() => countTextStats(input), [input]);
  const outputStats = useMemo(() => countTextStats(processed.output), [processed.output]);

  const update = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-4">
      <ActionBar>
        <span className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-3">
          <Rows3 className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '实时处理，按顺序应用所有选项', en: 'Live processing; options applied in order' })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton onClick={() => setInput(SAMPLE_MULTILINE)} />
          <ClearButton onClick={() => setInput('')} />
          <CopyButton text={processed.output} label={{ zh: '复制结果', en: 'Copy result' }} />
          <DownloadButton filename="multiline.txt" content={processed.output} />
        </div>
      </ActionBar>

      {processed.error ? (
        <ToolAlert tone="error" title={{ zh: '正则表达式不正确', en: 'Invalid regular expression' }} hint={processed.error} />
      ) : null}

      <Panel title={t({ zh: '处理选项', en: 'Processing options' })} bodyClassName="grid gap-4 p-4 lg:grid-cols-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-2">{t({ zh: '基础处理', en: 'Basic processing' })}</p>
          <Checkbox checked={options.trim} onChange={(value) => update('trim', value)} label={t({ zh: '去除每行前后空格', en: 'Trim each line' })} />
          <Checkbox checked={options.removeEmpty} onChange={(value) => update('removeEmpty', value)} label={t({ zh: '删除空行', en: 'Delete empty lines' })} />
          <Checkbox checked={options.removeDuplicates} onChange={(value) => update('removeDuplicates', value)} label={t({ zh: '删除重复行', en: 'Delete duplicate lines' })} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-2">{t({ zh: '前后缀与行号', en: 'Prefix / suffix and line numbers' })}</p>
          <div className="flex items-center gap-2">
            <Input
              value={options.prefix}
              onChange={(event) => update('prefix', event.target.value)}
              placeholder={t({ zh: '行前缀', en: 'Line prefix' })}
              aria-label={t({ zh: '行前缀', en: 'Line prefix' })}
              className="h-8 text-xs"
            />
            <Input
              value={options.suffix}
              onChange={(event) => update('suffix', event.target.value)}
              placeholder={t({ zh: '行后缀', en: 'Line suffix' })}
              aria-label={t({ zh: '行后缀', en: 'Line suffix' })}
              className="h-8 text-xs"
            />
          </div>
          <Checkbox
            checked={options.addLineNumbers}
            onChange={(value) => update('addLineNumbers', value)}
            label={t({ zh: '添加行号', en: 'Add line numbers' })}
          />
          {options.addLineNumbers ? (
            <div className="flex items-center gap-2">
              <Input
                value={options.lineStart}
                onChange={(event) => update('lineStart', event.target.value)}
                aria-label={t({ zh: '起始行号', en: 'Start number' })}
                inputMode="numeric"
                className="h-8 w-16 text-xs"
              />
              <Input
                value={options.lineSeparator}
                onChange={(event) => update('lineSeparator', event.target.value)}
                aria-label={t({ zh: '行号分隔符', en: 'Number separator' })}
                placeholder=". "
                className="h-8 w-16 text-xs"
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-2">{t({ zh: '引号与连接', en: 'Quoting and joining' })}</p>
          <div className="flex items-center gap-2">
            <Checkbox checked={options.quote} onChange={(value) => update('quote', value)} label={t({ zh: '引号包裹', en: 'Wrap in quotes' })} />
            {options.quote ? (
              <Select
                value={options.quoteChar}
                onChange={(event) => update('quoteChar', event.target.value)}
                aria-label={t({ zh: '引号类型', en: 'Quote type' })}
                className="h-8 text-xs"
                wrapperClassName="w-20"
              >
                <option value={'"'}>{t({ zh: '双引号', en: 'Double' })}</option>
                <option value="'">{t({ zh: '单引号', en: 'Single' })}</option>
                <option value="`">{t({ zh: '反引号', en: 'Backtick' })}</option>
              </Select>
            ) : null}
          </div>
          {options.quote ? (
            <Checkbox
              checked={options.escapeQuotes}
              onChange={(value) => update('escapeQuotes', value)}
              label={t({ zh: '转义内部引号', en: 'Escape inner quotes' })}
            />
          ) : null}
          <div className="flex items-center gap-2">
            <Checkbox checked={options.join} onChange={(value) => update('join', value)} label={t({ zh: '合并为一行', en: 'Join into one line' })} />
            {options.join ? (
              <Input
                value={options.joinSeparator}
                onChange={(event) => update('joinSeparator', event.target.value)}
                aria-label={t({ zh: '连接分隔符', en: 'Join separator' })}
                className="h-8 w-20 text-xs"
              />
            ) : null}
          </div>
        </div>

        <div className="space-y-2 lg:col-span-3">
          <p className="text-xs font-medium text-ink-2">{t({ zh: '批量替换', en: 'Batch replace' })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={options.find}
              onChange={(event) => update('find', event.target.value)}
              placeholder={t({ zh: '查找内容', en: 'Find' })}
              aria-label={t({ zh: '查找内容', en: 'Find' })}
              className="h-8 min-w-40 flex-1 text-xs"
            />
            <Input
              value={options.replace}
              onChange={(event) => update('replace', event.target.value)}
              placeholder={t({ zh: '替换为', en: 'Replace with' })}
              aria-label={t({ zh: '替换内容', en: 'Replacement' })}
              className="h-8 min-w-40 flex-1 text-xs"
            />
            <Checkbox
              checked={options.useRegex}
              onChange={(value) => update('useRegex', value)}
              label={t({ zh: '正则匹配', en: 'Regex match' })}
              className="text-xs"
            />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          label={{ zh: '原始文本', en: 'Source text' }}
          value={input}
          onChange={setInput}
          placeholder={{ zh: '每行一条内容…', en: 'One item per line…' }}
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '行数', en: 'Lines' }), value: inputStats.lines },
                { label: t({ zh: '字符', en: 'Characters' }), value: inputStats.chars },
              ]}
            />
          }
        />
        <OutputPanel
          label={{ zh: '处理结果', en: 'Processed output' }}
          value={processed.output}
          actions={<CopyIconButton text={processed.output} label={{ zh: '复制处理结果', en: 'Copy output' }} />}
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '行数', en: 'Lines' }), value: countLines(processed.output) },
                { label: t({ zh: '字符', en: 'Characters' }), value: outputStats.chars },
              ]}
            />
          }
        />
      </div>
    </div>
  );
}
