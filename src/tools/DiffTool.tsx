import { useMemo, useState } from 'react';
import { ArrowLeftRight, GitCompareArrows } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Checkbox } from '@/components/ui/Checkbox';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { InputPanel } from '@/components/tool/EditorPanels';
import { Segmented } from '@/components/ui/Segmented';
import { ActionBar, ClearButton, CopyButton, DownloadButton, SampleButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import {
  compareText,
  compareTextInline,
  isEmptyDiff,
  type DiffResult,
  type InlineGranularity,
} from '@/lib/diff';
import { toToolError, type ToolError } from '@/lib/errors';
import {
  SAMPLE_DIFF_LEFT,
  SAMPLE_DIFF_RIGHT,
  SAMPLE_TEXT_DIFF_LEFT,
  SAMPLE_TEXT_DIFF_RIGHT,
} from '@/data/samples';
import { cn } from '@/lib/cn';

type Granularity = 'line' | InlineGranularity;

const GRANULARITY_LABEL: Record<Granularity, L10n> = {
  line: { zh: '行', en: 'lines' },
  word: { zh: '词', en: 'words' },
  char: { zh: '字符', en: 'characters' },
};

interface Stats {
  added: number;
  removed: number;
  unchanged: number;
}

export default function DiffTool() {
  const { t } = useI18n();
  const [left, setLeft] = useState(SAMPLE_DIFF_LEFT);
  const [right, setRight] = useState(SAMPLE_DIFF_RIGHT);
  const [granularity, setGranularity] = useState<Granularity>('line');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [compareAsJson, setCompareAsJson] = useState(false);

  const loadSample = () => {
    // 词 / 字符粒度看代码只会糊成一片，示例随粒度切换成中文段落。
    const [first, second] =
      granularity === 'line'
        ? [SAMPLE_DIFF_LEFT, SAMPLE_DIFF_RIGHT]
        : [SAMPLE_TEXT_DIFF_LEFT, SAMPLE_TEXT_DIFF_RIGHT];
    setLeft(first);
    setRight(second);
  };

  const debouncedLeft = useDebouncedValue(left, 300);
  const debouncedRight = useDebouncedValue(right, 300);

  const lineAnalysis = useMemo<{ result: DiffResult | null; error: ToolError | null }>(() => {
    if (granularity !== 'line') return { result: null, error: null };
    if (!debouncedLeft && !debouncedRight) return { result: null, error: null };
    try {
      return {
        result: compareText(debouncedLeft, debouncedRight, { ignoreWhitespace, compareAsJson }),
        error: null,
      };
    } catch (caught) {
      return { result: null, error: toToolError(caught) };
    }
  }, [debouncedLeft, debouncedRight, granularity, ignoreWhitespace, compareAsJson]);

  const inlineAnalysis = useMemo<{ result: ReturnType<typeof compareTextInline> | null; error: ToolError | null }>(() => {
    if (granularity === 'line') return { result: null, error: null };
    if (!debouncedLeft && !debouncedRight) return { result: null, error: null };
    try {
      return { result: compareTextInline(debouncedLeft, debouncedRight, granularity), error: null };
    } catch (caught) {
      return { result: null, error: toToolError(caught) };
    }
  }, [debouncedLeft, debouncedRight, granularity]);

  const activeError = lineAnalysis.error ?? inlineAnalysis.error;
  const stats: Stats | null = lineAnalysis.result?.stats ?? inlineAnalysis.result?.stats ?? null;

  const diffText = useMemo(() => {
    if (lineAnalysis.result) {
      return lineAnalysis.result.parts
        .flatMap((part) => part.lines.map((line) => `${part.added ? '+' : part.removed ? '-' : ' '}${line}`))
        .join('\n');
    }
    if (inlineAnalysis.result) {
      return inlineAnalysis.result.parts.map((part) => part.value).join('');
    }
    return '';
  }, [lineAnalysis.result, inlineAnalysis.result]);

  const hasInput = Boolean(left || right);
  const identical = stats !== null && isEmptyDiff({ parts: [], stats });

  return (
    <div className="space-y-4">
      <ActionBar>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setLeft(right);
            setRight(left);
          }}
        >
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '交换两侧', en: 'Swap sides' })}
        </Button>
        <Segmented<Granularity>
          value={granularity}
          onChange={setGranularity}
          ariaLabel={t({ zh: '对比粒度', en: 'Diff granularity' })}
          options={[
            { value: 'line', label: t({ zh: '按行', en: 'Line' }) },
            { value: 'word', label: t({ zh: '按词', en: 'Word' }) },
            { value: 'char', label: t({ zh: '按字符', en: 'Char' }) },
          ]}
        />
        {granularity === 'line' ? (
          <>
            <Checkbox
              checked={ignoreWhitespace}
              onChange={setIgnoreWhitespace}
              label={t({ zh: '忽略行尾空白', en: 'Ignore trailing whitespace' })}
              className="text-xs"
            />
            <Checkbox
              checked={compareAsJson}
              onChange={setCompareAsJson}
              label={t({ zh: '按 JSON 对比', en: 'Compare as JSON' })}
              className="text-xs"
            />
          </>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton onClick={loadSample} />
          <ClearButton
            onClick={() => {
              setLeft('');
              setRight('');
            }}
          />
          <CopyButton text={diffText} label={{ zh: '复制差异', en: 'Copy diff' }} />
          <DownloadButton filename="diff.txt" content={diffText} />
        </div>
      </ActionBar>

      {activeError ? <ToolAlert tone="error" title={activeError.localized} hint={activeError.hint} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          label={{ zh: '原始文本', en: 'Original text' }}
          value={left}
          onChange={setLeft}
          placeholder={{ zh: '粘贴修改前的文本或代码…', en: 'Paste the text or code before the change…' }}
          minHeight={220}
        />
        <InputPanel
          label={{ zh: '修改后文本', en: 'Modified text' }}
          value={right}
          onChange={setRight}
          placeholder={{ zh: '粘贴修改后的文本或代码…', en: 'Paste the text or code after the change…' }}
          minHeight={220}
        />
      </div>

      <Panel
        title={t({ zh: '差异结果', en: 'Diff result' })}
        subtitle={
          stats
            ? t({
                zh: `新增 ${stats.added} ${GRANULARITY_LABEL[granularity].zh}，删除 ${stats.removed} ${GRANULARITY_LABEL[granularity].zh}`,
                en: `${stats.added} ${GRANULARITY_LABEL[granularity].en} added, ${stats.removed} ${GRANULARITY_LABEL[granularity].en} removed`,
              })
            : hasInput
              ? t({ zh: '正在对比…', en: 'Comparing…' })
              : t({ zh: '输入两段文本后自动对比', en: 'Enter two texts to compare automatically' })
        }
        actions={
          stats ? (
            <div className="flex items-center gap-1.5">
              <Badge tone="success">+{stats.added}</Badge>
              <Badge tone="danger">-{stats.removed}</Badge>
              <Badge tone="neutral">={stats.unchanged}</Badge>
            </div>
          ) : null
        }
        bodyClassName="p-0"
      >
        {!stats ? (
          <div className="flex min-h-[200px] items-center justify-center px-4 text-xs text-ink-3">
            <span className="inline-flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4" aria-hidden="true" />
              {hasInput
                ? t({ zh: '输入变化后将自动展示差异', en: 'The diff updates as you type' })
                : t({ zh: '输入两段文本后自动展示差异', en: 'Enter two texts to see the diff' })}
            </span>
          </div>
        ) : identical ? (
          <div className="flex min-h-[140px] items-center justify-center px-4 text-sm text-ok">
            {t({ zh: '两段文本完全一致', en: 'The two texts are identical' })}
          </div>
        ) : granularity === 'line' && lineAnalysis.result ? (
          <div className="code-scroll max-h-[480px] overflow-auto p-2 font-mono text-[12px] leading-6">
            {lineAnalysis.result.parts.map((part, partIndex) => (
              <div key={partIndex}>
                {part.lines.map((line, lineIndex) => (
                  <div
                    key={`${partIndex}-${lineIndex}`}
                    className={cn(
                      'flex gap-2 whitespace-pre-wrap break-words rounded-lg px-2',
                      part.added && 'bg-ok-soft text-ok',
                      part.removed && 'bg-danger-soft text-danger',
                      !part.added && !part.removed && 'text-ink-2',
                    )}
                  >
                    <span className="w-3 shrink-0 select-none text-center opacity-70">
                      {part.added ? '+' : part.removed ? '-' : ' '}
                    </span>
                    <span className="min-w-0">{line || ' '}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : inlineAnalysis.result ? (
          <div className="max-h-[480px] overflow-auto whitespace-pre-wrap break-words p-4 text-sm leading-7">
            {inlineAnalysis.result.parts.map((part, partIndex) => (
              <span
                key={partIndex}
                className={cn(
                  part.added && 'rounded-lg bg-ok-soft px-0.5 text-ok',
                  part.removed && 'rounded-lg bg-danger-soft px-0.5 text-danger line-through',
                )}
              >
                {part.value}
              </span>
            ))}
          </div>
        ) : null}
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: '按行对比适合段落级修改，可叠加「忽略行尾空白」与「按 JSON 对比」；按词 / 字符对比可精确定位句内改动（中文建议用按字符）。',
          en: 'Line mode suits paragraph-level edits and supports ignoring trailing whitespace and comparing as JSON; word / char mode pinpoints in-sentence changes (use char mode for Chinese).',
        })}
      </p>
    </div>
  );
}
