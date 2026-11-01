import { useState } from 'react';
import { Library, ScanSearch, Shuffle } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useToolContext } from '@/components/tool/ToolContext';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { RandomUaPanel } from './ua-toolkit/RandomUaPanel';
import { UaCollectionPanel } from './ua-toolkit/UaCollectionPanel';
import { UaParserPanel } from './ua-toolkit/UaParserPanel';

type UaToolkitMode = 'random' | 'collection' | 'parser';

export default function UaToolkitTool() {
  const { t } = useI18n();
  const toolContext = useToolContext();
  const [mode, setMode] = useToolkitMode<UaToolkitMode>(['random', 'collection', 'parser'], 'random');
  const [uaTextState, setUaTextState] = useState(() => toolContext?.initialInput ?? '');

  const { markDirty } = useDraftAutosave(
    () => uaTextState || null,
    [uaTextState],
    () => setUaTextState(''),
  );

  const setUaText = (value: string) => {
    markDirty();
    setUaTextState(value);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented<UaToolkitMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: 'UA 工具模式', en: 'UA toolkit mode' })}
          options={[
            {
              value: 'random',
              label: t({ zh: '随机 UA', en: 'Random UA' }),
              icon: <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'collection',
              label: t({ zh: 'UA 大全', en: 'UA Library' }),
              icon: <Library className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'parser',
              label: t({ zh: 'UA 解析', en: 'UA Parser' }),
              icon: <ScanSearch className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <div className={mode === 'random' ? 'contents' : 'hidden'}>
        <RandomUaPanel active={mode === 'random'} />
      </div>
      <div className={mode === 'collection' ? 'contents' : 'hidden'}>
        <UaCollectionPanel active={mode === 'collection'} />
      </div>
      <div className={mode === 'parser' ? 'contents' : 'hidden'}>
        <UaParserPanel uaText={uaTextState} onUaText={setUaText} active={mode === 'parser'} />
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '三种 UA 工具合为一箱：随机生成、按场景查询常用 UA、粘贴解析设备信息 · 切换模式不会丢失各自的生成结果与草稿输入',
          en: 'Three UA tools in one kit: random generation, a curated UA library, and paste-to-parse · switching modes keeps each panel\'s results and draft input',
        })}
      </p>
    </div>
  );
}
