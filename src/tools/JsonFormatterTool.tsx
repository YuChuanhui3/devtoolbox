import { useMemo, useState } from 'react';
import { Braces, CheckCircle2, Code2, ListTree, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Segmented } from '@/components/ui/Segmented';
import { InputPanel, OutputPanel, StatsBar } from '@/components/tool/EditorPanels';
import { JsonTree } from '@/components/tool/JsonTree';
import { ActionBar, ClearButton, CopyButton, CopyIconButton, DownloadButton, SampleButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useToolIO } from '@/hooks/useToolIO';
import { useHotkey } from '@/hooks/useHotkey';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { ToolError } from '@/lib/errors';
import {
  escapeJsonString,
  formatJson,
  highlightJson,
  jsonTypeOf,
  minifyJson,
  parseJson,
  unescapeJsonString,
  unwrapJsonStrings,
  validateJson,
  type JsonValidation,
} from '@/lib/json';
import { decodeUnicode, escapeUnicode } from '@/lib/unicode';
import { countTextStats } from '@/lib/text';
import { SAMPLE_JSON } from '@/data/samples';

type ViewMode = 'text' | 'tree';
type ResultKind = 'format' | 'escape' | 'unescape' | 'unicode-encode' | 'unicode-decode';

const RESULT_META: Record<
  ResultKind,
  { label: L10n; filename: string; mime: string; emptyText: L10n }
> = {
  format: {
    label: { zh: '格式化结果', en: 'Formatted result' },
    filename: 'formatted.json',
    mime: 'application/json;charset=utf-8',
    emptyText: { zh: '点击「格式化」或「压缩」查看结果', en: 'Click Format or Minify to see the result' },
  },
  escape: {
    label: { zh: 'JSON 转义结果', en: 'JSON escape result' },
    filename: 'json-escaped.txt',
    mime: 'text/plain;charset=utf-8',
    emptyText: {
      zh: '点击「JSON 转义」生成可嵌入字符串的转义文本',
      en: 'Click Escape to produce text that can be embedded in a string',
    },
  },
  unescape: {
    label: { zh: '去转义结果', en: 'Unescaped result' },
    filename: 'json-unescaped.txt',
    mime: 'text/plain;charset=utf-8',
    emptyText: { zh: '点击「去转义」还原字符串中的转义内容', en: 'Click Unescape to restore escaped string content' },
  },
  'unicode-encode': {
    label: { zh: 'Unicode 转义结果', en: 'Unicode escape result' },
    filename: 'unicode-escaped.json',
    mime: 'application/json;charset=utf-8',
    emptyText: {
      zh: '点击「中文 → Unicode」将非 ASCII 字符转为 \\uXXXX',
      en: 'Click Text → Unicode to convert non-ASCII characters to \\uXXXX',
    },
  },
  'unicode-decode': {
    label: { zh: 'Unicode 还原结果', en: 'Unicode decode result' },
    filename: 'unicode-decoded.json',
    mime: 'application/json;charset=utf-8',
    emptyText: { zh: '点击「Unicode → 中文」还原 \\uXXXX 转义', en: 'Click Unicode → Text to decode \\uXXXX escapes' },
  },
};

export default function JsonFormatterTool() {
  const { t } = useI18n();
  const io = useToolIO();
  const [indent, setIndent] = useState<'2' | '4'>('2');
  const [sortKeys, setSortKeys] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('text');
  const [validation, setValidation] = useState<JsonValidation | null>(null);
  const [resultKind, setResultKind] = useState<ResultKind>('format');
  const [outerQuotes, setOuterQuotes] = useState(true);
  const [uppercaseUnicode, setUppercaseUnicode] = useState(false);

  const resultMeta = RESULT_META[resultKind];

  const runFormat = () => {
    setValidation(null);
    setResultKind('format');
    const escaped = io.input.trim().startsWith('"');
    void io.run((input) => formatJson(input, Number(indent), sortKeys), {
      success: escaped
        ? t({ zh: '检测到转义后的 JSON 字符串，已自动去转义并格式化', en: 'Escaped JSON string detected; unescaped and formatted automatically' })
        : t({ zh: '格式化完成', en: 'Formatted' }),
    });
  };

  const runMinify = () => {
    setValidation(null);
    setResultKind('format');
    const escaped = io.input.trim().startsWith('"');
    void io.run((input) => minifyJson(input), {
      success: escaped
        ? t({ zh: '检测到转义后的 JSON 字符串，已自动去转义并压缩', en: 'Escaped JSON string detected; unescaped and minified automatically' })
        : t({ zh: '压缩完成', en: 'Minified' }),
    });
  };

  const runValidate = () => {
    const result = validateJson(io.input);
    setValidation(result);
    if (result.valid) {
      setValidation({ ...result, message: { zh: '✅ JSON 格式合法', en: '✅ Valid JSON' } });
    }
  };

  const runEscape = () => {
    setValidation(null);
    setResultKind('escape');
    setViewMode('text');
    void io.run((input) => escapeJsonString(input, { outerQuotes }), {
      success: t({ zh: 'JSON 转义完成', en: 'Escaped' }),
    });
  };

  const runUnescape = () => {
    setValidation(null);
    setResultKind('unescape');
    setViewMode('text');
    void io.run(unescapeJsonString, { success: t({ zh: '去转义完成', en: 'Unescaped' }) });
  };

  const runUnicodeEncode = () => {
    setValidation(null);
    setResultKind('unicode-encode');
    setViewMode('text');
    void io.run((input) => escapeUnicode(input, { escapeAll: false, uppercase: uppercaseUnicode }), {
      success: t({ zh: '已转换为 Unicode 转义', en: 'Converted to Unicode escapes' }),
    });
  };

  const runUnicodeDecode = () => {
    setValidation(null);
    setResultKind('unicode-decode');
    setViewMode('text');
    void io.run((input) => decodeUnicode(input, { nonAsciiOnly: true, jsonOnly: true }), {
      success: t({ zh: 'Unicode 已还原为中文', en: 'Unicode decoded back to text' }),
    });
  };

  useHotkey({ key: 'Enter', metaOrCtrl: true }, () => runFormat());

  const inputStats = useMemo(() => countTextStats(io.input), [io.input]);
  const outputStats = useMemo(() => countTextStats(io.output), [io.output]);
  const outputType = useMemo(() => {
    if (!io.output) return null;
    try {
      return jsonTypeOf(JSON.parse(io.output));
    } catch {
      return null;
    }
  }, [io.output]);

  const highlighted = useMemo(
    () => (io.output && outputType ? highlightJson(io.output) : ''),
    [io.output, outputType],
  );

  const treeResult = useMemo(() => {
    // 树形视图只在 viewMode === 'tree' 时渲染；默认的文本视图下每次按键都重解析整篇 JSON 纯属浪费。
    if (viewMode !== 'tree') return { hasValue: false, value: undefined, message: { zh: '', en: '' } };
    const source = io.output.trim() ? io.output : io.input;
    if (!source.trim()) {
      return {
        hasValue: false,
        value: undefined,
        message: { zh: '输入合法的 JSON 后显示树形视图', en: 'Enter valid JSON to show the tree view' },
      };
    }
    try {
      return { hasValue: true, value: unwrapJsonStrings(parseJson(source)).value, message: { zh: '', en: '' } };
    } catch (error) {
      return {
        hasValue: false,
        value: undefined,
        message:
          error instanceof ToolError
            ? error.localized
            : { zh: 'JSON 解析失败', en: 'JSON parsing failed' },
      };
    }
  }, [viewMode, io.input, io.output]);

  return (
    <div className="space-y-4">
      <ActionBar>
        <Button variant="primary" onClick={runFormat} disabled={io.isRunning}>
          <Braces className="h-4 w-4" aria-hidden="true" />
          {t({ zh: '格式化', en: 'Format' })}
        </Button>
        <Button variant="secondary" onClick={runMinify} disabled={io.isRunning}>
          <Minimize2 className="h-4 w-4" aria-hidden="true" />
          {t({ zh: '压缩', en: 'Minify' })}
        </Button>
        <Button variant="secondary" onClick={runValidate} disabled={io.isRunning}>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {t({ zh: '校验', en: 'Validate' })}
        </Button>

        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />

        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          {t({ zh: '缩进', en: 'Indent' })}
          <Select
            value={indent}
            onChange={(event) => setIndent(event.target.value as '2' | '4')}
            aria-label={t({ zh: '缩进方式', en: 'Indent style' })}
            className="h-8 text-xs"
            wrapperClassName="w-24"
          >
            <option value="2">{t({ zh: '2 空格', en: '2 spaces' })}</option>
            <option value="4">{t({ zh: '4 空格', en: '4 spaces' })}</option>
          </Select>
        </label>

        <Checkbox
          checked={sortKeys}
          onChange={setSortKeys}
          label={t({ zh: '按键名排序', en: 'Sort keys' })}
          className="text-xs"
        />

        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />

        <Segmented<ViewMode>
          value={viewMode}
          onChange={setViewMode}
          ariaLabel={t({ zh: '结果展示方式', en: 'Result view' })}
          options={[
            { value: 'text', label: t({ zh: '文本', en: 'Text' }), icon: <Code2 className="h-3.5 w-3.5" aria-hidden="true" /> },
            { value: 'tree', label: t({ zh: '树形', en: 'Tree' }), icon: <ListTree className="h-3.5 w-3.5" aria-hidden="true" /> },
          ]}
        />

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton
            onClick={() => {
              io.reset(SAMPLE_JSON);
              setValidation(null);
              setResultKind('format');
              try {
                io.setOutput(formatJson(SAMPLE_JSON, Number(indent), sortKeys));
              } catch {
                /* 示例始终合法 */
              }
            }}
          />
          <ClearButton
            onClick={() => {
              io.clear();
              setValidation(null);
            }}
          />
          <CopyButton text={io.output} label={t({ zh: '复制结果', en: 'Copy result' })} />
          <DownloadButton
            filename={resultMeta.filename}
            content={io.output}
            mime={resultMeta.mime}
          />
        </div>
      </ActionBar>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-card border border-line bg-surface-2/40 px-3 py-2">
        <span className="text-[11px] font-semibold rounded-lg bg-accent-soft px-1.5 py-0.5 text-accent-strong">
          {t({ zh: '字符串', en: 'Strings' })}
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={runEscape}
          disabled={io.isRunning}
          title={t({ zh: '将文本转换为可嵌入 JSON 字符串的转义形式', en: 'Escape text so it can be embedded in a JSON string' })}
        >
          {t({ zh: 'JSON 转义', en: 'Escape' })}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={runUnescape}
          disabled={io.isRunning}
          title={t({ zh: '把 JSON 字符串字面量还原为普通文本', en: 'Turn a JSON string literal back into plain text' })}
        >
          {t({ zh: '去转义', en: 'Unescape' })}
        </Button>
        <Checkbox
          checked={outerQuotes}
          onChange={setOuterQuotes}
          label={t({ zh: '包含外层引号', en: 'Include outer quotes' })}
          className="text-xs"
        />

        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />

        <span className="text-[11px] font-semibold rounded-lg bg-accent-soft px-1.5 py-0.5 text-accent-strong">Unicode</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={runUnicodeEncode}
          disabled={io.isRunning}
          title={t({ zh: '仅转义非 ASCII 字符，保留 JSON 语法', en: 'Escape non-ASCII characters only, keeping JSON valid' })}
        >
          {t({ zh: '中文 → Unicode', en: 'Text → Unicode' })}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={runUnicodeDecode}
          disabled={io.isRunning}
          title={t({ zh: '仅还原非 ASCII 码点，保留 JSON 结构转义', en: 'Decode non-ASCII code points only, keeping JSON escapes intact' })}
        >
          {t({ zh: 'Unicode → 中文', en: 'Unicode → Text' })}
        </Button>
        <Checkbox
          checked={uppercaseUnicode}
          onChange={setUppercaseUnicode}
          label={t({ zh: '大写十六进制', en: 'Uppercase hex' })}
          className="text-xs"
        />
      </div>

      {io.error ? <ToolAlert tone="error" title={io.error.localized} hint={io.error.hint} /> : null}
      {validation ? (
        <ToolAlert
          tone={validation.valid ? 'success' : 'error'}
          title={validation.message}
          hint={validation.hint}
        />
      ) : null}
      {io.notice ? <ToolAlert tone="success" title={io.notice} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          label={t({ zh: '输入内容', en: 'Input' })}
          value={io.input}
          onChange={(value) => {
            io.setInput(value);
            setValidation(null);
          }}
          placeholder={t({ zh: '粘贴 JSON、转义字符串或其他待处理文本，例如 {"name":"qwen"}', en: 'Paste JSON, an escaped string, or other text, e.g. {"name":"qwen"}' })}
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '行数', en: 'Lines' }), value: inputStats.lines },
                { label: t({ zh: '字符', en: 'Chars' }), value: inputStats.chars },
              ]}
            />
          }
        />
        {viewMode === 'tree' ? (
          <Panel
            title={t({ zh: '树形视图', en: 'Tree view' })}
            subtitle={t({ zh: '只读浏览；点击箭头展开或折叠', en: 'Read-only; click the arrows to expand or collapse' })}
            actions={<CopyIconButton text={io.output || io.input} label={t({ zh: '复制 JSON', en: 'Copy JSON' })} />}
            footer={
              <StatsBar
                items={[
                  { label: t({ zh: '行数', en: 'Lines' }), value: outputStats.lines },
                  { label: t({ zh: '字符', en: 'Chars' }), value: outputStats.chars },
                  ...(outputType ? [{ label: t({ zh: '类型', en: 'Type' }), value: outputType }] : []),
                ]}
              />
            }
            noPadding
            className="h-full"
          >
            {treeResult.hasValue ? (
              <JsonTree value={treeResult.value} />
            ) : (
              <div
                className="flex items-center justify-center px-4 py-6 text-center text-xs leading-5 text-ink-3"
                style={{ minHeight: 240 }}
              >
                {t(treeResult.message)}
              </div>
            )}
          </Panel>
        ) : (
          <OutputPanel
            label={resultMeta.label}
            value={io.output}
            html={highlighted}
            emptyText={resultMeta.emptyText}
            actions={<CopyIconButton text={io.output} label={t({ zh: '复制结果', en: 'Copy result' })} />}
            footer={
              <StatsBar
                items={[
                  { label: t({ zh: '行数', en: 'Lines' }), value: outputStats.lines },
                  { label: t({ zh: '字符', en: 'Chars' }), value: outputStats.chars },
                  ...(outputType ? [{ label: t({ zh: '类型', en: 'Type' }), value: outputType }] : []),
                ]}
              />
            }
          />
        )}
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '支持 ⌘ / Ctrl + Enter 快速格式化 · 错误会定位到具体行列 · Unicode 转换仅处理非 ASCII 字符，保持 JSON 语法合法',
          en: '⌘ / Ctrl + Enter formats instantly · errors point to the exact line and column · Unicode conversion touches non-ASCII characters only and keeps JSON valid',
        })}
      </p>
    </div>
  );
}
