import { useMemo, useState } from 'react';
import { FileCode2, Loader2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
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
import { countTextStats } from '@/lib/text';
import {
  formatWebCode,
  minifyWebCode,
  WEB_EXTENSION,
  WEB_HIGHLIGHT_LANGUAGE,
  WEB_LANGUAGE_LABEL,
  type WebAction,
  type WebLanguage,
} from '@/lib/webformat';
import { SAMPLE_WEB_CSS, SAMPLE_WEB_HTML, SAMPLE_WEB_JS } from '@/data/samples';

const SAMPLES: Record<WebLanguage, string> = {
  html: SAMPLE_WEB_HTML,
  css: SAMPLE_WEB_CSS,
  js: SAMPLE_WEB_JS,
};

const PLACEHOLDERS: Record<WebLanguage, string> = {
  html: '<div class="card">Hello DevToolbox</div>',
  css: '.card { color: #2196f3; }',
  js: 'const answer = 42;',
};

export default function WebFormatterTool() {
  const { t } = useI18n();
  const io = useToolIO();
  const [language, setLanguage] = useState<WebLanguage>('html');
  const [indent, setIndent] = useState<'2' | '4'>('2');
  const [action, setAction] = useState<WebAction>('format');
  const [errorLine, setErrorLine] = useState<number | null>(null);

  const runAction = (nextAction: WebAction, source?: string) => {
    setErrorLine(null);
    setAction(nextAction);

    const handler = async (input: string) => {
      try {
        return nextAction === 'format'
          ? await formatWebCode(language, input, Number(indent))
          : await minifyWebCode(language, input);
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
    if (source !== undefined) {
      void io.runWithValue(handler, source, options);
    } else {
      void io.run(handler, options);
    }
  };

  const changeLanguage = (next: WebLanguage) => {
    if (io.isRunning || next === language) return;
    setLanguage(next);
    setAction('format');
    setErrorLine(null);
    io.setInput(io.input);
    io.setOutput('');
  };

  useHotkey({ key: 'Enter', metaOrCtrl: true }, () => runAction('format'));

  const highlighted = useMemo(
    () => (io.output ? highlightCode(io.output, WEB_HIGHLIGHT_LANGUAGE[language]) : ''),
    [io.output, language],
  );

  const inputStats = useMemo(() => countTextStats(io.input), [io.input]);
  const outputStats = useMemo(() => countTextStats(io.output), [io.output]);
  const errorLineText = errorLine ? (io.input.split('\n')[errorLine - 1] ?? '') : '';
  const resultLabel: L10n = action === 'format' ? { zh: '格式化结果', en: 'Formatted output' } : { zh: '压缩结果', en: 'Minified output' };
  const languageLabel = WEB_LANGUAGE_LABEL[language];

  return (
    <div className="space-y-4">
      <ActionBar>
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

        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />

        <Segmented<WebLanguage>
          value={language}
          onChange={changeLanguage}
          ariaLabel={t({ zh: '代码语言', en: 'Code language' })}
          options={[
            { value: 'html', label: 'HTML' },
            { value: 'css', label: 'CSS' },
            { value: 'js', label: 'JavaScript' },
          ]}
        />

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

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton
            onClick={() => {
              io.reset(SAMPLES[language]);
              runAction('format', SAMPLES[language]);
            }}
          />
          <ClearButton
            onClick={() => {
              io.clear();
              setErrorLine(null);
            }}
          />
          <CopyButton text={io.output} label={{ zh: '复制结果', en: 'Copy result' }} />
          <DownloadButton
            filename={`${action === 'format' ? 'formatted' : 'minified'}.${WEB_EXTENSION[language]}`}
            content={io.output}
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
          value={io.input}
          onChange={io.setInput}
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
          value={io.output}
          html={highlighted}
          emptyText={t({ zh: `点击「格式化」或「压缩」查看 ${languageLabel} 结果`, en: `Click Format or Minify to see the ${languageLabel} result` })}
          minHeight={360}
          showLineNumbers
          actions={<CopyIconButton text={io.output} label={t({ zh: `复制${t(resultLabel)}`, en: `Copy ${t(resultLabel)}` })} />}
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '行数', en: 'Lines' }), value: outputStats.lines },
                { label: t({ zh: '字符', en: 'Chars' }), value: outputStats.chars },
                { label: t({ zh: '缩进', en: 'Indent' }), value: action === 'format' ? t({ zh: `${indent} 空格`, en: `${indent} spaces` }) : t({ zh: '已压缩', en: 'Minified' }) },
              ]}
            />
          }
        />
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: 'HTML / CSS 使用 js-beautify，JavaScript 使用 Terser 校验与压缩，压缩不会混淆变量名 · 支持 ⌘ / Ctrl + Enter 快速格式化',
          en: 'HTML / CSS use js-beautify; JavaScript uses Terser for validation and minification, without mangling variable names · Format quickly with ⌘ / Ctrl + Enter',
        })}
      </p>
    </div>
  );
}
