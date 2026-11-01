import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileCode2, Loader2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
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
import type { L10n } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { highlightCode } from '@/lib/highlight';
import {
  DEFAULT_HTML_CLEAN_OPTIONS,
  escapeHtmlEntities,
  htmlToText,
  unescapeHtmlEntities,
  type HtmlCleanOptions,
} from '@/lib/htmlkit';
import {
  canMinify,
  FORMAT_EXTENSION,
  FORMAT_HIGHLIGHT_LANGUAGE,
  FORMAT_LANGUAGES,
  FORMAT_LANGUAGE_LABEL,
  formatCode,
  minifyCode,
  type FormatLanguage,
} from '@/lib/codeformat';
import { countTextStats } from '@/lib/text';
import {
  SAMPLE_FORMAT_JSON,
  SAMPLE_FORMAT_MD,
  SAMPLE_FORMAT_TS,
  SAMPLE_FORMAT_YAML,
  SAMPLE_WEB_CSS,
  SAMPLE_WEB_HTML,
  SAMPLE_WEB_JS,
} from '@/data/samples';
import type { CodeFormatPanelProps } from './types';

/** HTML 除格式化外还内置实体转义与标签清理两个子功能。 */
type HtmlTask = 'format' | 'entities' | 'cleaner';
type EntityMode = 'escape' | 'unescape';

const SAMPLES: Record<FormatLanguage, string> = {
  html: SAMPLE_WEB_HTML,
  css: SAMPLE_WEB_CSS,
  js: SAMPLE_WEB_JS,
  ts: SAMPLE_FORMAT_TS,
  json: SAMPLE_FORMAT_JSON,
  yaml: SAMPLE_FORMAT_YAML,
  markdown: SAMPLE_FORMAT_MD,
};

const PLACEHOLDERS: Record<FormatLanguage, string> = {
  html: '<div class="card">Hello DevToolbox</div>',
  css: '.card { color: #2196f3; }',
  js: 'const answer = 42;',
  ts: 'interface User { id: number }',
  json: '{"user_id": 1001, "tags": ["a", "b"]}',
  yaml: 'tools:\n  - id: json-toolkit',
  markdown: '# 标题\n\n- 列表项',
};

const HTML_TASK_LABEL: Record<HtmlTask, L10n> = {
  format: { zh: '格式化 / 压缩', en: 'Format / Minify' },
  entities: { zh: '实体转义', en: 'Entities' },
  cleaner: { zh: '标签清理', en: 'Strip tags' },
};

const HTML_TASKS: HtmlTask[] = ['format', 'entities', 'cleaner'];

/** HTML 子功能写在 URL 的 ?sub= 上，旧链接 /tools/html-entities 能直达对应子功能。 */
function useHtmlTask(): [HtmlTask, (next: HtmlTask) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('sub');
  const task = (HTML_TASKS.find((item) => item === requested) ?? 'format') as HtmlTask;

  const setTask = useCallback(
    (next: HtmlTask) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          if (next === 'format') params.delete('sub');
          else params.set('sub', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return [task, setTask];
}

export function WebPanel({ value, onValueChange, active }: CodeFormatPanelProps) {
  const { t } = useI18n();
  // 共享输入面板：输入文本由父组件持有，本实例不再恢复初值、不回写草稿。
  const io = useToolIO('', { draftless: true });
  const [language, setLanguage] = useState<FormatLanguage>('html');
  const [indent, setIndent] = useState<'2' | '4'>('2');
  const [action, setAction] = useState<'format' | 'minify'>('format');
  const [errorLine, setErrorLine] = useState<number | null>(null);

  const [htmlTask, setHtmlTask] = useHtmlTask();
  const [entityMode, setEntityMode] = useState<EntityMode>('escape');
  const [escapeNonAscii, setEscapeNonAscii] = useState(false);
  const [cleanOptions, setCleanOptions] = useState<HtmlCleanOptions>(DEFAULT_HTML_CLEAN_OPTIONS);

  const isHtml = language === 'html';
  const minifyEnabled = canMinify(language) && (!isHtml || htmlTask === 'format');

  const htmlOutput = useMemo(() => {
    if (!isHtml || htmlTask === 'format') return null;
    if (htmlTask === 'entities') {
      return entityMode === 'escape'
        ? escapeHtmlEntities(value, escapeNonAscii)
        : unescapeHtmlEntities(value);
    }
    return htmlToText(value, cleanOptions);
  }, [cleanOptions, entityMode, escapeNonAscii, htmlTask, isHtml, value]);

  const runAction = (nextAction: 'format' | 'minify', source?: string) => {
    setErrorLine(null);
    setAction(nextAction);

    const handler = async (input: string) => {
      try {
        return nextAction === 'format'
          ? await formatCode(language, input, Number(indent))
          : await minifyCode(language, input);
      } catch (error) {
        setErrorLine(toToolError(error).location?.line ?? null);
        throw error;
      }
    };

    const options = {
      success: t(nextAction === 'format'
        ? { zh: '格式化完成', en: 'Formatted' }
        : { zh: '压缩完成', en: 'Minified' }),
    };
    void io.runWithValue(handler, source ?? value, options);
  };

  const changeInput = (next: string) => {
    onValueChange(next);
    io.setError(null);
    io.setNotice(null);
  };

  const changeLanguage = (next: FormatLanguage) => {
    if (io.isRunning || next === language) return;
    setLanguage(next);
    setAction('format');
    setErrorLine(null);
    io.setError(null);
    io.setNotice(null);
    io.setOutput('');
  };

  const changeHtmlTask = (next: HtmlTask) => {
    setHtmlTask(next);
    setErrorLine(null);
    io.setError(null);
    io.setNotice(null);
    if (next !== 'format') io.setOutput('');
  };

  useHotkey({ key: 'Enter', metaOrCtrl: true, enabled: active }, () => runAction('format'));

  const highlighted = useMemo(
    () =>
      io.output && (htmlOutput === null || htmlTask === 'format')
        ? highlightCode(io.output, FORMAT_HIGHLIGHT_LANGUAGE[language])
        : '',
    [htmlOutput, htmlTask, io.output, language],
  );

  const inputStats = useMemo(() => countTextStats(value), [value]);
  const shownOutput = htmlOutput ?? io.output;
  const outputStats = useMemo(() => countTextStats(shownOutput), [shownOutput]);
  const errorLineText = errorLine ? (value.split('\n')[errorLine - 1] ?? '') : '';
  const resultLabel: L10n =
    htmlOutput !== null
      ? htmlTask === 'entities'
        ? entityMode === 'escape'
          ? { zh: '转义结果', en: 'Escaped output' }
          : { zh: '还原结果', en: 'Unescaped output' }
        : { zh: '纯文本结果', en: 'Plain text output' }
      : action === 'format'
        ? { zh: '格式化结果', en: 'Formatted output' }
        : { zh: '压缩结果', en: 'Minified output' };
  const languageLabel = FORMAT_LANGUAGE_LABEL[language];
  const outputExtension = htmlOutput !== null ? 'txt' : FORMAT_EXTENSION[language];
  const canRunMinify = minifyEnabled && htmlOutput === null;

  return (
    <div className="space-y-4">
      <ActionBar>
        {htmlOutput === null ? (
          <Button
            variant="primary"
            onClick={() => runAction('format')}
            disabled={io.isRunning}
          >
            {io.isRunning && action === 'format' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileCode2 className="h-4 w-4" aria-hidden="true" />
            )}
            {io.isRunning && action === 'format' ? t({ zh: '处理中…', en: 'Working…' }) : t({ zh: '格式化', en: 'Format' })}
          </Button>
        ) : null}
        {canRunMinify ? (
          <Button
            variant="secondary"
            onClick={() => runAction('minify')}
            disabled={io.isRunning}
          >
            {io.isRunning && action === 'minify' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Minimize2 className="h-4 w-4" aria-hidden="true" />
            )}
            {io.isRunning && action === 'minify' ? t({ zh: '处理中…', en: 'Working…' }) : t({ zh: '压缩', en: 'Minify' })}
          </Button>
        ) : null}

        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />

        <Segmented<FormatLanguage>
          value={language}
          onChange={changeLanguage}
          size="sm"
          ariaLabel={t({ zh: '代码语言', en: 'Code language' })}
          options={FORMAT_LANGUAGES.map((item) => ({
            value: item,
            label: FORMAT_LANGUAGE_LABEL[item],
          }))}
        />

        {isHtml ? (
          <Segmented<HtmlTask>
            value={htmlTask}
            onChange={changeHtmlTask}
            size="sm"
            ariaLabel={t({ zh: 'HTML 子功能', en: 'HTML sub-feature' })}
            options={( ['format', 'entities', 'cleaner'] as HtmlTask[]).map((item) => ({
              value: item,
              label: t(HTML_TASK_LABEL[item]),
            }))}
          />
        ) : null}

        {htmlTask === 'entities' && isHtml ? (
          <>
            <Segmented<EntityMode>
              value={entityMode}
              onChange={setEntityMode}
              size="sm"
              ariaLabel={t({ zh: 'HTML 实体模式', en: 'HTML entity mode' })}
              options={[
                { value: 'escape', label: t({ zh: '转义', en: 'Escape' }) },
                { value: 'unescape', label: t({ zh: '反转义', en: 'Unescape' }) },
              ]}
            />
            {entityMode === 'escape' ? (
              <Checkbox
                checked={escapeNonAscii}
                onChange={setEscapeNonAscii}
                label={t({ zh: '中文转数字实体', en: 'Encode non-ASCII as numeric entities' })}
                className="text-xs"
              />
            ) : null}
          </>
        ) : null}

        {htmlTask === 'cleaner' && isHtml ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Checkbox
              checked={cleanOptions.keepLineBreaks}
              onChange={(next) => setCleanOptions((prev) => ({ ...prev, keepLineBreaks: next }))}
              label={t({ zh: '保留换行', en: 'Keep line breaks' })}
              className="text-xs"
            />
            <Checkbox
              checked={cleanOptions.collapseWhitespace}
              onChange={(next) => setCleanOptions((prev) => ({ ...prev, collapseWhitespace: next }))}
              label={t({ zh: '合并多余空格', en: 'Collapse whitespace' })}
              className="text-xs"
            />
            <Checkbox
              checked={cleanOptions.keepLinks}
              onChange={(next) => setCleanOptions((prev) => ({ ...prev, keepLinks: next }))}
              label={t({ zh: '保留链接地址', en: 'Keep link URLs' })}
              className="text-xs"
            />
          </div>
        ) : null}

        {htmlOutput === null ? (
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            {t({ zh: '缩进', en: 'Indent' })}
            <Select
              value={indent}
              onChange={(event) => setIndent(event.target.value as '2' | '4')}
              aria-label={t({ zh: '缩进宽度', en: 'Indent width' })}
              className="h-8 text-xs"
              wrapperClassName="w-24"
            >
              <option value="2">{t({ zh: '2 空格', en: '2 spaces' })}</option>
              <option value="4">{t({ zh: '4 空格', en: '4 spaces' })}</option>
            </Select>
          </label>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton
            onClick={() => {
              changeInput(SAMPLES[language]);
              if (htmlOutput === null) runAction('format', SAMPLES[language]);
            }}
          />
          <ClearButton
            onClick={() => {
              changeInput('');
              io.setOutput('');
              setErrorLine(null);
            }}
          />
          <CopyButton text={shownOutput} label={{ zh: '复制结果', en: 'Copy result' }} />
          <DownloadButton
            filename={`${htmlOutput !== null ? (htmlTask === 'entities' ? (entityMode === 'escape' ? 'html-escaped' : 'html-unescaped') : 'html-text') : action === 'format' ? 'formatted' : 'minified'}.${outputExtension}`}
            content={shownOutput}
            mime="text/plain;charset=utf-8"
          />
        </div>
      </ActionBar>

      {io.error ? <ToolAlert tone="error" title={io.error.localized} hint={io.error.hint} /> : null}
      {io.notice ? <ToolAlert tone="success" title={io.notice} /> : null}

      {errorLine ? (
        <div className="rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-2.5 font-mono text-xs text-danger">
          <div className="mb-1 text-[11px] font-medium">{t({ zh: `错误位置：第 ${errorLine} 行`, en: `Error location: line ${errorLine}` })}</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all">
            <span className="underline decoration-danger decoration-wavy underline-offset-4">
              {errorLineText || ' '}
            </span>
          </pre>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          label={{ zh: `${languageLabel} 源码`, en: `${languageLabel} source` }}
          value={value}
          onChange={changeInput}
          placeholder={PLACEHOLDERS[language]}
          minHeight={360}
          showLineNumbers
          errorLine={errorLine}
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '行数', en: 'Lines' }), value: inputStats.lines },
                { label: t({ zh: '字符', en: 'Chars' }), value: inputStats.chars },
                { label: t({ zh: '语言', en: 'Language' }), value: languageLabel },
              ]}
            />
          }
        />
        <OutputPanel
          label={resultLabel}
          value={shownOutput}
          html={highlighted}
          emptyText={t(
            htmlOutput !== null
              ? { zh: '输入内容后实时查看结果', en: 'Results appear here as you type' }
              : canRunMinify
                ? { zh: `点击「格式化」或「压缩」查看 ${languageLabel} 结果`, en: `Click Format or Minify to see the ${languageLabel} result` }
                : { zh: `点击「格式化」查看 ${languageLabel} 结果`, en: `Click Format to see the ${languageLabel} result` },
          )}
          minHeight={360}
          showLineNumbers
          actions={<CopyIconButton text={shownOutput} label={t({ zh: `复制${t(resultLabel)}`, en: `Copy ${t(resultLabel)}` })} />}
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '行数', en: 'Lines' }), value: outputStats.lines },
                { label: t({ zh: '字符', en: 'Chars' }), value: outputStats.chars },
                { label: t({ zh: '缩进', en: 'Indent' }), value: htmlOutput !== null ? t({ zh: '实时', en: 'Live' }) : action === 'format' ? t({ zh: `${indent} 空格`, en: `${indent} spaces` }) : t({ zh: '已压缩', en: 'Minified' }) },
              ]}
            />
          }
        />
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: 'HTML / CSS 使用 js-beautify，JavaScript 使用 Terser 校验与压缩，TypeScript / JSON / YAML / Markdown 使用按需加载的 Prettier · HTML 内置实体转义与标签清理 · 支持 ⌘ / Ctrl + Enter 快速格式化',
          en: 'HTML / CSS use js-beautify, JavaScript uses Terser for validation and minification, and TypeScript / JSON / YAML / Markdown use Prettier loaded on demand · HTML ships entity escaping and tag stripping · Format quickly with ⌘ / Ctrl + Enter',
        })}
      </p>
    </div>
  );
}
