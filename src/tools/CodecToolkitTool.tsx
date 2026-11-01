import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { useToolContext } from '@/components/tool/ToolContext';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import { useI18n } from '@/i18n/I18nProvider';
import { Base64Panel } from './codec-toolkit/Base64Panel';
import { BaseCodecPanel } from './codec-toolkit/BaseCodecPanel';
import { GzipCodecPanel } from './codec-toolkit/GzipCodecPanel';
import { HexTextPanel } from './codec-toolkit/HexTextPanel';
import { JsEscapePanel } from './codec-toolkit/JsEscapePanel';
import { MorseCodecPanel } from './codec-toolkit/MorseCodecPanel';
import { UnicodePanel } from './codec-toolkit/UnicodePanel';
import { UrlCodecPanel } from './codec-toolkit/UrlCodecPanel';

type CodecMode = 'base64' | 'url' | 'unicode' | 'hex' | 'js-escape' | 'base-n' | 'gzip' | 'morse';

export default function CodecToolkitTool() {
  const { t } = useI18n();
  const toolContext = useToolContext();
  const [mode, setMode] = useState<CodecMode>('base64');
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
        <Segmented<CodecMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '编解码类型', en: 'Codec type' })}
          options={[
            { value: 'base64', label: 'Base64' },
            { value: 'url', label: 'URL' },
            { value: 'unicode', label: 'Unicode' },
            { value: 'hex', label: 'Hex' },
            { value: 'js-escape', label: t({ zh: 'JS 转义', en: 'JS Escape' }) },
            { value: 'base-n', label: 'Base32/58/62/100' },
            { value: 'gzip', label: 'Gzip' },
            { value: 'morse', label: t({ zh: '莫尔斯', en: 'Morse' }) },
          ]}
        />
      </div>

      <div className={mode === 'base64' ? 'contents' : 'hidden'}>
        <Base64Panel value={inputState} onValueChange={setInput} active={mode === 'base64'} />
      </div>
      <div className={mode === 'url' ? 'contents' : 'hidden'}>
        <UrlCodecPanel value={inputState} onValueChange={setInput} active={mode === 'url'} />
      </div>
      <div className={mode === 'unicode' ? 'contents' : 'hidden'}>
        <UnicodePanel value={inputState} onValueChange={setInput} active={mode === 'unicode'} />
      </div>
      <div className={mode === 'hex' ? 'contents' : 'hidden'}>
        <HexTextPanel value={inputState} onValueChange={setInput} active={mode === 'hex'} />
      </div>
      <div className={mode === 'js-escape' ? 'contents' : 'hidden'}>
        <JsEscapePanel value={inputState} onValueChange={setInput} active={mode === 'js-escape'} />
      </div>
      <div className={mode === 'base-n' ? 'contents' : 'hidden'}>
        <BaseCodecPanel value={inputState} onValueChange={setInput} active={mode === 'base-n'} />
      </div>
      <div className={mode === 'gzip' ? 'contents' : 'hidden'}>
        <GzipCodecPanel value={inputState} onValueChange={setInput} active={mode === 'gzip'} />
      </div>
      <div className={mode === 'morse' ? 'contents' : 'hidden'}>
        <MorseCodecPanel value={inputState} onValueChange={setInput} active={mode === 'morse'} />
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '八种编码/转义/压缩方式共享同一份输入：粘贴一次，点选类型即可查看结果 · 各面板的编解码方向与选项互不影响',
          en: 'All eight codecs share one input: paste once, then pick a type to see its result · each panel keeps its own direction and options',
        })}
      </p>
    </div>
  );
}
