import { useState } from 'react';
import { ArrowLeftRight, Braces, FileDiff, ListTree, ShieldCheck } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useToolContext } from '@/components/tool/ToolContext';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import { useI18n } from '@/i18n/I18nProvider';
import { ConverterPanel } from './json-toolkit/ConverterPanel';
import { DiffPanel } from './json-toolkit/DiffPanel';
import { FormatPanel } from './json-toolkit/FormatPanel';
import { JsonPathPanel } from './json-toolkit/JsonPathPanel';
import { SchemaPanel } from './json-toolkit/SchemaPanel';

type ToolkitMode = 'format' | 'path' | 'schema' | 'diff' | 'convert';

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

export default function JsonToolkitTool() {
  const { t } = useI18n();
  const toolContext = useToolContext();
  const [restored] = useState(() => readDraft(toolContext?.initialInput ?? ''));
  const [mode, setMode] = useState<ToolkitMode>('format');
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

  const panelProps = { input: inputState, setInput };

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented<ToolkitMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '工具箱模式', en: 'Toolkit mode' })}
          options={[
            {
              value: 'format',
              label: t({ zh: '格式化', en: 'Format' }),
              icon: <Braces className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'path',
              label: t({ zh: 'JSONPath 查询', en: 'JSONPath' }),
              icon: <ListTree className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'schema',
              label: t({ zh: 'Schema', en: 'Schema' }),
              icon: <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'diff',
              label: t({ zh: 'JSON 对比', en: 'Diff' }),
              icon: <FileDiff className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'convert',
              label: t({ zh: '格式转换', en: 'Convert' }),
              icon: <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <div className={mode === 'format' ? 'contents' : 'hidden'}>
        <FormatPanel {...panelProps} active={mode === 'format'} />
      </div>
      <div className={mode === 'path' ? 'contents' : 'hidden'}>
        <JsonPathPanel {...panelProps} active={mode === 'path'} />
      </div>
      <div className={mode === 'schema' ? 'contents' : 'hidden'}>
        <SchemaPanel {...panelProps} active={mode === 'schema'} />
      </div>
      <div className={mode === 'diff' ? 'contents' : 'hidden'}>
        <DiffPanel
          {...panelProps}
          active={mode === 'diff'}
          right={diffRightState}
          setRight={setDiffRight}
        />
      </div>
      <div className={mode === 'convert' ? 'contents' : 'hidden'}>
        <ConverterPanel {...panelProps} active={mode === 'convert'} />
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '五种模式共享同一份输入：粘贴一次，即可格式化、查询、校验、对比，或在六种数据格式间互转 · 切换模式不会丢失各自的输出与选项',
          en: 'All five modes share one input: paste once, then format, query, validate, diff, or convert among six data formats · switching modes keeps each panel\'s output and options',
        })}
      </p>
    </div>
  );
}
