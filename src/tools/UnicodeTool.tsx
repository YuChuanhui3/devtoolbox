import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { Checkbox } from '@/components/ui/Checkbox';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import { decodeUnicode, escapeUnicode } from '@/lib/unicode';
import { SAMPLE_UNICODE } from '@/data/samples';

type Mode = 'encode' | 'decode';

const DECODE_SAMPLE = '\\u4f60\\u597d\\uff0cDevToolbox \\ud83d\\udc4b';

export default function UnicodeTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('encode');
  const [escapeAll, setEscapeAll] = useState(true);
  const [uppercase, setUppercase] = useState(false);

  const isEncode = mode === 'encode';

  return (
    <TransformTool
      transform={(input) =>
        isEncode
          ? escapeUnicode(input, { escapeAll, uppercase })
          : decodeUnicode(input)
      }
      sample={isEncode ? SAMPLE_UNICODE : DECODE_SAMPLE}
      inputLabel={isEncode ? { zh: '原始文本', en: 'Raw text' } : { zh: 'Unicode 转义文本', en: 'Unicode-escaped text' }}
      outputLabel={isEncode ? { zh: 'Unicode 转义结果', en: 'Unicode escapes' } : { zh: '还原文本', en: 'Restored text' }}
      inputPlaceholder={
        isEncode ? { zh: '输入中文或 Emoji，例如 你好 👋', en: 'Enter text or emoji, e.g. 你好 👋' } : { zh: '粘贴 \\u4f60\\u597d 形式的转义文本', en: 'Paste escaped text in \\u4f60\\u597d form' }
      }
      outputFilename={isEncode ? 'unicode.txt' : 'decoded.txt'}
      successMessage={isEncode ? { zh: '编码完成', en: 'Encoded' } : { zh: '解码完成', en: 'Decoded' }}
      onSwap={() => setMode(isEncode ? 'decode' : 'encode')}
      options={
        <>
          <Segmented
            value={mode}
            onChange={setMode}
            ariaLabel={t({ zh: 'Unicode 转换模式', en: 'Unicode mode' })}
            options={[
              { value: 'encode', label: t({ zh: '转义', en: 'Escape' }) },
              { value: 'decode', label: t({ zh: '还原', en: 'Unescape' }) },
            ]}
          />
          {isEncode ? (
            <>
              <Checkbox
                checked={escapeAll}
                onChange={setEscapeAll}
                label={t({ zh: '全部字符转义', en: 'Escape all characters' })}
                className="text-xs"
              />
              <Checkbox
                checked={uppercase}
                onChange={setUppercase}
                label={t({ zh: '大写十六进制', en: 'Uppercase hex' })}
                className="text-xs"
              />
            </>
          ) : null}
        </>
      }
      helpText={t({
        zh: 'Emoji 等扩展字符会输出为 UTF-16 代理对（两个 \\uXXXX），兼容性更好；还原支持 \\uXXXX、\\u{XXXXX} 与 \\xXX。',
        en: 'Extended characters such as emoji are emitted as UTF-16 surrogate pairs (two \\uXXXX) for better compatibility; unescaping supports \\uXXXX, \\u{XXXXX}, and \\xXX.',
      })}
    />
  );
}
