import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ArrowLeftRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
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
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { useToolIO } from '@/hooks/useToolIO';
import { useHotkey } from '@/hooks/useHotkey';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { toToolError } from '@/lib/errors';
import { countTextStats } from '@/lib/text';

export interface TransformToolProps {
  transform: (input: string) => string | Promise<string>;
  sample: string;
  inputLabel: Localized;
  outputLabel: Localized;
  inputPlaceholder?: Localized;
  outputEmptyText?: Localized;
  outputFilename: string;
  outputMime?: string;
  options?: ReactNode;
  extraActions?: ReactNode;
  showSwap?: boolean;
  onSwap?: () => void;
  onSample?: () => void;
  outputHighlight?: (value: string) => string;
  successMessage?: Localized;
  live?: boolean;
  liveKey?: string;
  /** 变化时清空结果，用于切换转换方向等场景。 */
  resetOutputKey?: string | number;
  autoRunSample?: boolean;
  helpText?: ReactNode;
  inputFooterExtra?: ReactNode;
  renderSummary?: (input: string, output: string) => ReactNode;
}

export function TransformTool({
  transform,
  sample,
  inputLabel,
  outputLabel,
  inputPlaceholder,
  outputEmptyText = { zh: '转换结果将在这里显示', en: 'Converted output will appear here' },
  outputFilename,
  outputMime = 'text/plain;charset=utf-8',
  options,
  extraActions,
  showSwap = true,
  onSwap,
  onSample,
  outputHighlight,
  successMessage = { zh: '转换成功', en: 'Converted successfully' },
  live = false,
  liveKey,
  resetOutputKey,
  autoRunSample = true,
  helpText,
  inputFooterExtra,
  renderSummary,
}: TransformToolProps) {
  const io = useToolIO();
  const { t } = useI18n();
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const debouncedInput = useDebouncedValue(io.input, 250);

  useEffect(() => {
    if (!live) return;

    if (!debouncedInput) {
      io.setOutput('');
      io.setError(null);
      return;
    }

    let cancelled = false;
    const execute = async () => {
      try {
        const result = await transformRef.current(debouncedInput);
        if (!cancelled) {
          io.setOutput(result);
          io.setError(null);
        }
      } catch (error) {
        if (!cancelled) {
          io.setError(toToolError(error));
          io.setOutput('');
        }
      }
    };

    void execute();
    return () => {
      cancelled = true;
    };
  }, [debouncedInput, live, liveKey, io.setOutput, io.setError]);

  useEffect(() => {
    if (resetOutputKey === undefined) return;
    io.setOutput('');
    io.setError(null);
    io.setNotice(null);
  }, [resetOutputKey, io.setOutput, io.setError]);

  const run = () => {
    void io.run((input) => transformRef.current(input), { success: t(successMessage) });
  };

  useHotkey({ key: 'Enter', metaOrCtrl: true }, () => run());

  const highlighted = useMemo(
    () => (io.output && outputHighlight ? outputHighlight(io.output) : undefined),
    [io.output, outputHighlight],
  );

  const inputStats = useMemo(() => countTextStats(io.input), [io.input]);
  const outputStats = useMemo(() => countTextStats(io.output), [io.output]);

  return (
    <div className="space-y-4">
      <ActionBar>
        <Button variant="primary" onClick={run} disabled={io.isRunning || live}>
          <Play className="h-4 w-4" aria-hidden="true" />
          {io.isRunning
            ? t({ zh: '处理中…', en: 'Working…' })
            : t({ zh: '转换', en: 'Convert' })}
        </Button>

        {showSwap ? (
          <Button
            variant="secondary"
            onClick={() => {
              io.swap();
              onSwap?.();
            }}
            disabled={!io.output}
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            {t({ zh: '交换输入输出', en: 'Swap input/output' })}
          </Button>
        ) : null}

        {options}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {extraActions}
          <SampleButton
            onClick={() => {
              onSample?.();
              io.reset(sample);
              if (!live && autoRunSample) {
                void io.runWithValue((input) => transformRef.current(input), sample, {
                  success: t(successMessage),
                });
              }
            }}
          />
          <ClearButton onClick={io.clear} />
          <CopyButton text={io.output} label={t({ zh: '复制结果', en: 'Copy result' })} />
          <DownloadButton filename={outputFilename} content={io.output} mime={outputMime} />
        </div>
      </ActionBar>

      {io.error ? <ToolAlert tone="error" title={io.error.localized} hint={io.error.hint} /> : null}
      {io.notice ? <ToolAlert tone="success" title={io.notice} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          label={inputLabel}
          value={io.input}
          onChange={io.setInput}
          placeholder={inputPlaceholder}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatsBar
                items={[
                  { label: t({ zh: '行数', en: 'Lines' }), value: inputStats.lines },
                  { label: t({ zh: '字符', en: 'Chars' }), value: inputStats.chars },
                ]}
              />
              {inputFooterExtra}
            </div>
          }
        />
        <OutputPanel
          label={outputLabel}
          value={io.output}
          html={highlighted}
          emptyText={outputEmptyText}
          actions={
            <CopyIconButton
              text={io.output}
              label={t({ zh: `复制${t(outputLabel)}`, en: `Copy ${t(outputLabel)}` })}
            />
          }
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

      {renderSummary ? (
        <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
          {renderSummary(io.input, io.output)}
        </div>
      ) : helpText ? (
        <p className="text-center text-[11px] leading-5 text-ink-3">{helpText}</p>
      ) : null}
    </div>
  );
}
