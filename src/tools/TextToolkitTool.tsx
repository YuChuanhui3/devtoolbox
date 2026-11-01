import { useState } from 'react';
import {
  CaseUpper,
  GitCompareArrows,
  ListOrdered,
  Rows3,
  SortAsc,
  Repeat1,
  Type,
} from 'lucide-react';
import { ToolkitTabs } from '@/components/tool/ToolkitTabs';
import { useToolContext } from '@/components/tool/ToolContext';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { CasePanel } from './text-toolkit/CasePanel';
import { DedupePanel } from './text-toolkit/DedupePanel';
import { DiffPanel } from './text-toolkit/DiffPanel';
import { MultiLinePanel } from './text-toolkit/MultiLinePanel';
import { OccurrencePanel } from './text-toolkit/OccurrencePanel';
import { SortPanel } from './text-toolkit/SortPanel';
import { WordCountPanel } from './text-toolkit/WordCountPanel';

type TextMode = 'count' | 'occurrence' | 'sort' | 'dedupe' | 'case' | 'multiline' | 'diff';

const MODES: TextMode[] = ['count', 'occurrence', 'sort', 'dedupe', 'case', 'multiline', 'diff'];

interface ToolkitDraft {
  input: string;
  diffRight: string;
}

function readDraft(raw: string): ToolkitDraft {
  if (!raw) return { input: '', diffRight: '' };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const pair = parsed as { input?: unknown; right?: unknown };
      return {
        input: typeof pair.input === 'string' ? pair.input : '',
        diffRight: typeof pair.right === 'string' ? pair.right : '',
      };
    }
  } catch {
    /* 旧版草稿就是纯文本输入，直接回退 */
  }
  return { input: raw, diffRight: '' };
}

export default function TextToolkitTool() {
  const { t } = useI18n();
  const toolContext = useToolContext();
  const [restored] = useState(() => readDraft(toolContext?.initialInput ?? ''));
  const [mode, setMode] = useToolkitMode<TextMode>(MODES, 'count');
  const [inputState, setInputState] = useState(restored.input);
  const [diffRightState, setDiffRightState] = useState(restored.diffRight);

  const { markDirty } = useDraftAutosave(
    () =>
      inputState || diffRightState
        ? JSON.stringify({ input: inputState, right: diffRightState })
        : null,
    [inputState, diffRightState],
    () => {
      setInputState('');
      setDiffRightState('');
    },
  );

  const setInput = (value: string) => {
    markDirty();
    setInputState(value);
  };

  const setDiffRight = (value: string) => {
    markDirty();
    setDiffRightState(value);
  };

  const sharedProps = { value: inputState, onValueChange: setInput };

  return (
    <div className="space-y-4">
      <ToolkitTabs<TextMode>
        value={mode}
        onChange={setMode}
        ariaLabel={t({ zh: '文本处理类型', en: 'Text tool' })}
        options={[
          {
            value: 'count',
            label: t({ zh: '字数统计', en: 'Counter' }),
            icon: <Type className="h-3.5 w-3.5" aria-hidden="true" />,
          },
          {
            value: 'occurrence',
            label: t({ zh: '出现次数', en: 'Occurrences' }),
            icon: <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />,
          },
          {
            value: 'sort',
            label: t({ zh: '文本排序', en: 'Sort' }),
            icon: <SortAsc className="h-3.5 w-3.5" aria-hidden="true" />,
          },
          {
            value: 'dedupe',
            label: t({ zh: '文本去重', en: 'Dedupe' }),
            icon: <Repeat1 className="h-3.5 w-3.5" aria-hidden="true" />,
          },
          {
            value: 'case',
            label: t({ zh: '大小写转换', en: 'Case' }),
            icon: <CaseUpper className="h-3.5 w-3.5" aria-hidden="true" />,
          },
          {
            value: 'multiline',
            label: t({ zh: '多行处理', en: 'Lines' }),
            icon: <Rows3 className="h-3.5 w-3.5" aria-hidden="true" />,
          },
          {
            value: 'diff',
            label: t({ zh: '文本对比', en: 'Diff' }),
            icon: <GitCompareArrows className="h-3.5 w-3.5" aria-hidden="true" />,
          },
        ]}
      />

      <LazyPanel active={mode === 'count'}>
        <WordCountPanel {...sharedProps} active={mode === 'count'} />
      </LazyPanel>
      <LazyPanel active={mode === 'occurrence'}>
        <OccurrencePanel {...sharedProps} active={mode === 'occurrence'} />
      </LazyPanel>
      <LazyPanel active={mode === 'sort'}>
        <SortPanel {...sharedProps} active={mode === 'sort'} />
      </LazyPanel>
      <LazyPanel active={mode === 'dedupe'}>
        <DedupePanel {...sharedProps} active={mode === 'dedupe'} />
      </LazyPanel>
      <LazyPanel active={mode === 'case'}>
        <CasePanel {...sharedProps} active={mode === 'case'} />
      </LazyPanel>
      <LazyPanel active={mode === 'multiline'}>
        <MultiLinePanel {...sharedProps} active={mode === 'multiline'} />
      </LazyPanel>
      <LazyPanel active={mode === 'diff'}>
        <DiffPanel
          value={inputState}
          onValueChange={setInput}
          right={diffRightState}
          onRightChange={setDiffRight}
        />
      </LazyPanel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '七项文本处理共享同一份输入：粘贴一次，点选类型即可查看统计、排序、去重、改名、多行处理与对比结果 · 仅「文本对比」需要第二段输入',
          en: 'All seven text tools share one input: paste once, then pick a mode to see counts, sorting, dedupe, casing, line processing and diffs · only Diff needs a second block',
        })}
      </p>
    </div>
  );
}
