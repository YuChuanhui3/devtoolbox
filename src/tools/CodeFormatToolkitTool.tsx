import { useState } from 'react';
import { Database, FileCode2 } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useToolContext } from '@/components/tool/ToolContext';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { SqlPanel } from './code-format-toolkit/SqlPanel';
import { WebPanel } from './code-format-toolkit/WebPanel';

type CodeFormatMode = 'sql' | 'web';

export default function CodeFormatToolkitTool() {
  const { t } = useI18n();
  const toolContext = useToolContext();
  const [mode, setMode] = useToolkitMode<CodeFormatMode>(['sql', 'web'], 'sql');
  const [inputState, setInputState] = useState(() => toolContext?.initialInput ?? '');

  const { markDirty } = useDraftAutosave(
    () => inputState || null,
    [inputState],
    () => setInputState(''),
  );

  const setInput = (value: string) => {
    markDirty();
    setInputState(value);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented<CodeFormatMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '格式化类型', en: 'Formatter type' })}
          options={[
            {
              value: 'sql',
              label: t({ zh: 'SQL 格式化', en: 'SQL Format' }),
              icon: <Database className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'web',
              label: t({ zh: 'HTML/CSS/JS 格式化', en: 'HTML/CSS/JS Format' }),
              icon: <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <LazyPanel active={mode === 'sql'}>
        <SqlPanel value={inputState} onValueChange={setInput} active={mode === 'sql'} />
      </LazyPanel>
      <LazyPanel active={mode === 'web'}>
        <WebPanel value={inputState} onValueChange={setInput} active={mode === 'web'} />
      </LazyPanel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '两种格式化共享同一份输入：粘贴一次，点选类型即可查看结果 · SQL 方言与 Web 语言/缩进选项互不影响',
          en: 'Both formatters share one input: paste once, then pick a type to see its result · SQL dialect and web language/indent options stay independent',
        })}
      </p>
    </div>
  );
}
