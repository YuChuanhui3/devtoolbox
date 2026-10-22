import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileCode2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Select } from '@/components/ui/Select';
import { InputPanel, StatsBar } from '@/components/tool/EditorPanels';
import {
  ActionBar,
  ClearButton,
  CopyButton,
  CopyIconButton,
  DownloadButton,
  SampleButton,
} from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useToolIO } from '@/hooks/useToolIO';
import {
  CODE_LANGUAGES,
  DEFAULT_CODE_GEN_OPTIONS,
  getCodeFilename,
  getLanguageMeta,
  sanitizeRootName,
  type CodeGenOptions,
  type CodeGenRequest,
  type CodeGenResponse,
  type CodeLanguage,
} from '@/lib/codegen';
import { cn } from '@/lib/cn';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { countTextStats } from '@/lib/text';
import { SAMPLE_JSON_TO_CODE } from '@/data/samples';

const DEBOUNCE_DELAY = 300;
const SKELETON_DELAY = 200;
const OUTPUT_LINE_NUMBER_LIMIT = 1000;

interface GenerationError {
  message: Localized;
  hint?: Localized;
  line?: number;
  column?: number;
  source?: string;
}

interface PendingRequest {
  id: number;
  language: CodeLanguage;
  json: string;
}

function getLineAt(text: string, line: number): string {
  return text.split('\n')[line - 1] ?? '';
}

const NAMING_LABELS: Record<CodeGenOptions['naming'], L10n> = {
  camel: { zh: '小驼峰', en: 'camelCase' },
  pascal: { zh: '大驼峰', en: 'PascalCase' },
  snake: { zh: '下划线', en: 'snake_case' },
  preserve: { zh: '保持原样', en: 'Keep as-is' },
};

function CodeSkeleton() {
  const { t } = useI18n();
  const widths = [78, 52, 66, 40, 71, 34, 59, 48, 63, 29, 55, 44];
  return (
    <div role="status" aria-label={t({ zh: '正在生成代码', en: 'Generating code' })} className="space-y-3 p-4" style={{ minHeight: 360 }}>
      {widths.map((width, index) => (
        <div
          key={index}
          className="h-3 animate-pulse rounded-full bg-surface-2"
          style={{ width: `${width}%`, animationDelay: `${index * 35}ms` }}
        />
      ))}
      <span className="sr-only">{t({ zh: '正在生成代码…', en: 'Generating code…' })}</span>
    </div>
  );
}

export default function JsonToCodeTool() {
  const { t } = useI18n();
  const io = useToolIO();
  const [options, setOptions] = useState<CodeGenOptions>(DEFAULT_CODE_GEN_OPTIONS);
  const [code, setCode] = useState('');
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<GenerationError | null>(null);
  const [languagePulse, setLanguagePulse] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef<PendingRequest | null>(null);
  const lastRequestKeyRef = useRef('');
  const previousLanguageRef = useRef(options.language);

  const debouncedInput = useDebouncedValue(io.input, DEBOUNCE_DELAY);

  const requestGeneration = useCallback(
    (json: string, nextOptions: CodeGenOptions, force = false) => {
      const worker = workerRef.current;
      const key = `${JSON.stringify(nextOptions)}::${json}`;

      if (!json.trim()) {
        requestIdRef.current += 1;
        pendingRef.current = null;
        lastRequestKeyRef.current = '';
        setIsGenerating(false);
        setCode('');
        setCodeLanguage(null);
        setNodeCount(0);
        setDurationMs(null);
        setGenError(null);
        return;
      }

      if (!worker) return;
      if (!force && key === lastRequestKeyRef.current) return;

      lastRequestKeyRef.current = key;
      const id = requestIdRef.current + 1;
      requestIdRef.current = id;
      pendingRef.current = { id, language: nextOptions.language, json };
      setIsGenerating(true);
      setGenError(null);

      const request: CodeGenRequest = { id, json, options: nextOptions };
      worker.postMessage(request);
    },
    [],
  );

  useEffect(() => {
    if (typeof Worker === 'undefined') {
      setGenError({
        message: {
          zh: '当前环境不支持 Web Worker，无法生成代码。',
          en: 'Web Workers are not available in this environment, so code cannot be generated.',
        },
        hint: {
          zh: '请使用最新版 Chrome、Edge、Firefox 或 Safari，并确认未禁用 JavaScript。',
          en: 'Use the latest Chrome, Edge, Firefox, or Safari and make sure JavaScript is enabled.',
        },
      });
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/jsonToCode.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      setGenError({
        message: { zh: '代码生成线程启动失败。', en: 'Failed to start the code generation worker.' },
        hint: { zh: '请刷新页面后重试，或更换最新版浏览器。', en: 'Reload the page and retry, or use a current browser.' },
      });
      return;
    }

    worker.onmessage = (event: MessageEvent<CodeGenResponse>) => {
      const response = event.data;
      const pending = pendingRef.current;
      if (!pending || pending.id !== response.id) return;

      pendingRef.current = null;
      setIsGenerating(false);
      setDurationMs(response.durationMs);
      setNodeCount(response.nodeCount);

      if (response.ok) {
        setCode(response.code);
        setCodeLanguage(pending.language);
        setGenError(null);
      } else {
        setCode('');
        setCodeLanguage(pending.language);
        setGenError({ ...response.error, source: pending.json });
      }
    };

    worker.onerror = () => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      lastRequestKeyRef.current = '';
      setIsGenerating(false);
      setCode('');
      setGenError({
        message: { zh: '代码生成线程异常。', en: 'The code generation worker failed.' },
        hint: {
          zh: '请刷新页面后重试；如果问题持续出现，请尝试更换浏览器。',
          en: 'Reload the page and retry; switch browsers if the problem persists.',
        },
        source: pending?.json,
      });
    };

    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRef.current = null;
      lastRequestKeyRef.current = '';
    };
  }, []);

  useEffect(() => {
    requestGeneration(debouncedInput, options);
  }, [debouncedInput, options, requestGeneration]);

  useEffect(() => {
    if (previousLanguageRef.current === options.language) return;
    previousLanguageRef.current = options.language;
    setLanguagePulse(true);
    const timer = window.setTimeout(() => setLanguagePulse(false), SKELETON_DELAY);
    return () => window.clearTimeout(timer);
  }, [options.language]);

  const updateOptions = (patch: Partial<CodeGenOptions>) => {
    setOptions((previous) => ({ ...previous, ...patch }));
  };

  const hasInput = io.input.trim().length > 0;
  const displayCode = codeLanguage === options.language ? code : '';
  const languageMeta = getLanguageMeta(options.language);
  const rootName = sanitizeRootName(options.rootName);
  const filename = getCodeFilename(options.rootName, options.language);

  const isStaleLanguage = codeLanguage !== null && codeLanguage !== options.language;
  const showSkeleton =
    hasInput &&
    !genError &&
    (languagePulse || isStaleLanguage || (isGenerating && !displayCode));

  const inputStats = useMemo(() => countTextStats(io.input), [io.input]);
  const codeStats = useMemo(() => countTextStats(displayCode), [displayCode]);
  const codeLines = useMemo(() => (displayCode ? displayCode.split('\n') : []), [displayCode]);

  const errorLine = genError?.source === io.input ? (genError.line ?? null) : null;
  const errorPreview = errorLine ? getLineAt(io.input, errorLine) : '';
  const statusTone = !hasInput
    ? 'idle'
    : isGenerating
      ? 'busy'
      : genError
        ? 'error'
        : displayCode
          ? 'ok'
          : 'idle';
  const statusText: Localized = !hasInput
    ? { zh: '等待输入 JSON', en: 'Waiting for JSON input' }
    : isGenerating
      ? { zh: '实时生成中…', en: 'Generating…' }
      : genError
        ? genError.line
          ? {
              zh: `JSON 错误：第 ${genError.line} 行第 ${genError.column ?? 1} 列`,
              en: `JSON error: line ${genError.line}, column ${genError.column ?? 1}`,
            }
          : { zh: '生成失败', en: 'Generation failed' }
        : displayCode
          ? { zh: 'JSON 格式合法', en: 'Valid JSON' }
          : { zh: '等待生成', en: 'Waiting to generate' };

  const resetOutput = () => {
    setCode('');
    setCodeLanguage(null);
    setNodeCount(0);
    setDurationMs(null);
    setGenError(null);
  };

  const handleClear = () => {
    requestIdRef.current += 1;
    pendingRef.current = null;
    lastRequestKeyRef.current = '';
    setIsGenerating(false);
    resetOutput();
    io.clear();
  };

  const handleSample = () => {
    resetOutput();
    io.reset(SAMPLE_JSON_TO_CODE);
    requestGeneration(SAMPLE_JSON_TO_CODE, options, true);
  };

  const showOutputLineNumbers = codeLines.length > 0 && codeLines.length <= OUTPUT_LINE_NUMBER_LIMIT;

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: '生成参数', en: 'Generation settings' })}
        subtitle={t({
          zh: '全部转换在本地 Web Worker 中完成，JSON 内容不会上传',
          en: 'All generation runs in a local Web Worker; your JSON is never uploaded',
        })}
      >
        <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[220px_160px_minmax(200px,1fr)_auto]">
          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-ink-2">
            {t({ zh: '目标语言', en: 'Target language' })}
            <Select
              value={options.language}
              onChange={(event) => updateOptions({ language: event.target.value as CodeLanguage })}
              aria-label={t({ zh: '目标语言', en: 'Target language' })}
            >
              {CODE_LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-ink-2">
            {t({ zh: '命名风格', en: 'Naming style' })}
            <Select
              value={options.naming}
              onChange={(event) =>
                updateOptions({ naming: event.target.value as CodeGenOptions['naming'] })
              }
              aria-label={t({ zh: '命名风格', en: 'Naming style' })}
            >
              <option value="camel">{t(NAMING_LABELS.camel)}</option>
              <option value="pascal">{t(NAMING_LABELS.pascal)}</option>
              <option value="snake">{t(NAMING_LABELS.snake)}</option>
              <option value="preserve">{t(NAMING_LABELS.preserve)}</option>
            </Select>
          </label>

          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-ink-2">
            {t({ zh: '根节点名称', en: 'Root name' })}
            <Input
              value={options.rootName}
              onChange={(event) => updateOptions({ rootName: event.target.value })}
              aria-label={t({ zh: '根节点名称', en: 'Root name' })}
              placeholder="RootData"
              maxLength={64}
              mono
            />
          </label>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-2.5">
            <Checkbox
              checked={options.comments}
              onChange={(checked) => updateOptions({ comments: checked })}
              label={t({ zh: '生成字段注释', en: 'Generate field comments' })}
              className="text-xs"
            />
            <Checkbox
              checked={options.handleNull}
              onChange={(checked) => updateOptions({ handleNull: checked })}
              label={t({ zh: '处理 null / 可选字段', en: 'Handle null / optional fields' })}
              className="text-xs"
            />
          </div>
        </div>

        <p className="mt-3 border-t border-line pt-3 text-[11px] text-ink-3">
          {t({ zh: '类名将生成为 ', en: 'Class name: ' })}
          <span className="font-mono text-ink-2">{rootName}</span>
          {t({ zh: '，下载文件名为 ', en: ', download filename: ' })}
          <span className="font-mono text-ink-2">{filename}</span>
        </p>
      </Panel>

      <ActionBar>
        <span className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-3" aria-live="polite">
          {isGenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden="true" />
          ) : (
            <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {isGenerating ? t({ zh: '实时生成中…', en: 'Generating…' }) : t({ zh: '输入停止 300ms 后自动生成', en: 'Generates automatically 300ms after you stop typing' })}
        </span>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => requestGeneration(io.input, options, true)}
          disabled={!hasInput || isGenerating}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isGenerating && 'animate-spin')} aria-hidden="true" />
          {t({ zh: '重新生成', en: 'Regenerate' })}
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton onClick={handleSample} />
          <ClearButton onClick={handleClear} />
          <CopyButton text={displayCode} label={t({ zh: '复制代码', en: 'Copy code' })} />
          <DownloadButton
            filename={filename}
            content={displayCode}
            label={t({ zh: '下载', en: 'Download' })}
            mime="text/plain;charset=utf-8"
          />
        </div>
      </ActionBar>

      {genError ? (
        <div className="space-y-2">
          <ToolAlert tone="error" title={genError.message} hint={genError.hint} />
          {errorLine ? (
            <div className="rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-2.5 font-mono text-xs text-danger">
              <div className="mb-1 text-[11px] font-medium">
                {t({
                  zh: `第 ${errorLine} 行${genError.column ? `第 ${genError.column} 列` : ''}`,
                  en: `Line ${errorLine}${genError.column ? `, column ${genError.column}` : ''}`,
                })}
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all">
                <span className="underline decoration-danger decoration-wavy underline-offset-4">
                  {errorPreview || ' '}
                </span>
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          label={t({ zh: 'JSON 输入', en: 'JSON input' })}
          value={io.input}
          onChange={io.setInput}
          placeholder={t({ zh: '粘贴 JSON，例如 {"user_id": 1001, "user_name": "admin"}', en: 'Paste JSON, e.g. {"user_id": 1001, "user_name": "admin"}' })}
          minHeight={360}
          showLineNumbers
          errorLine={errorLine}
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '行数', en: 'Lines' }), value: inputStats.lines },
                { label: t({ zh: '字符', en: 'Chars' }), value: inputStats.chars },
              ]}
            />
          }
        />

        <Panel
          title={t({ zh: '生成代码', en: 'Generated code' })}
          subtitle={`${languageMeta.label} · ${t(NAMING_LABELS[options.naming])}`}
          actions={<CopyIconButton text={displayCode} label={t({ zh: '复制生成的代码', en: 'Copy generated code' })} />}
          noPadding
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '行数', en: 'Lines' }), value: codeStats.lines },
                { label: t({ zh: '字符', en: 'Chars' }), value: codeStats.chars },
                { label: t({ zh: '语言', en: 'Language' }), value: languageMeta.label },
              ]}
            />
          }
        >
          {genError ? (
            <div
              className="flex flex-col items-center justify-center gap-2 px-6 text-center"
              style={{ minHeight: 360 }}
            >
              <XCircle className="h-6 w-6 text-danger" aria-hidden="true" />
              <p className="text-sm font-medium text-ink">
                {t({ zh: '请修正左侧 JSON 错误后查看代码', en: 'Fix the JSON error on the left to see the code' })}
              </p>
              <p className="max-w-sm text-xs leading-5 text-ink-3">
                {genError.line
                  ? t({
                      zh: `错误位于第 ${genError.line} 行第 ${genError.column ?? 1} 列。`,
                      en: `The error is at line ${genError.line}, column ${genError.column ?? 1}.`,
                    })
                  : t({ zh: '左侧输入无法生成代码。', en: 'The input cannot be turned into code.' })}
              </p>
            </div>
          ) : showSkeleton ? (
            <CodeSkeleton />
          ) : displayCode ? (
            <div
              className="code-scroll overflow-auto"
              style={{ minHeight: 360, maxHeight: 560 }}
            >
              <div className="flex min-w-max">
                {showOutputLineNumbers ? (
                  <div
                    aria-hidden="true"
                    className="sticky left-0 shrink-0 select-none border-r border-line bg-surface-2/60 px-3 py-4 text-right font-mono text-[13px] leading-6 text-ink-3"
                  >
                    {codeLines.map((_, index) => (
                      <div key={index} className="tabular-nums">
                        {index + 1}
                      </div>
                    ))}
                  </div>
                ) : null}
                <pre className="p-4 font-mono text-[13px] leading-6 text-ink">{displayCode}</pre>
              </div>
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-2 px-6 text-center"
              style={{ minHeight: 360 }}
            >
              <FileCode2 className="h-6 w-6 text-ink-3" aria-hidden="true" />
              <p className="text-sm font-medium text-ink">
                {hasInput
                  ? t({ zh: '等待生成代码', en: 'Waiting to generate code' })
                  : t({ zh: '输入 JSON 后自动生成代码', en: 'Enter JSON to generate code automatically' })}
              </p>
              <p className="max-w-sm text-xs leading-5 text-ink-3">
                {t({
                  zh: '支持 TypeScript、Go、Java 等 13 种语言，嵌套对象与数组会自动生成类型。',
                  en: 'Supports 13 languages including TypeScript, Go, and Java; nested objects and arrays get their own types.',
                })}
              </p>
            </div>
          )}
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 text-[11px] text-ink-3 shadow-card">
        <span
          role="status"
          className={cn(
            'inline-flex items-center gap-1.5 font-medium',
            statusTone === 'error' && 'text-danger',
            statusTone === 'busy' && 'text-accent-strong',
            statusTone === 'ok' && 'text-ok',
          )}
        >
          {statusTone === 'error' ? (
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          ) : statusTone === 'busy' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : statusTone === 'ok' ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {t(statusText)}
        </span>
        <span className="hidden h-3.5 w-px bg-line sm:block" />
        <span>
          {t({ zh: '节点数', en: 'Nodes' })} <strong className="font-semibold text-ink-2">{nodeCount}</strong>
        </span>
        <span>
          {t({ zh: '生成耗时', en: 'Generation time' })}{' '}
          <strong className="font-semibold text-ink-2">
            {durationMs === null ? '—' : `${durationMs} ms`}
          </strong>
        </span>
        <span>
          {t({ zh: '代码字符', en: 'Code characters' })} <strong className="font-semibold text-ink-2">{displayCode.length}</strong>
        </span>
        <span className="ml-auto hidden sm:inline">
          {t({ zh: '输出文件：', en: 'Output file:' })}
          {filename}
        </span>
      </div>
    </div>
  );
}
