import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import { morseDecode, morseEncode } from '@/lib/morse';

type Direction = 'encode' | 'decode';

const DEMO_TEXT = 'SOS 123, HELLO WORLD!';
const DEMO_MORSE = '... --- ... / .---- ..--- ...-- --..-- / .... . .-.. .-.. --- / .-- --- .-. .-.. -.. -.-.--';

export default function MorseCodecTool() {
  const { t } = useI18n();
  const [direction, setDirection] = useState<Direction>('encode');
  const isEncode = direction === 'encode';

  return (
    <TransformTool
      transform={(input) => (isEncode ? morseEncode(input) : morseDecode(input))}
      live
      liveKey={direction}
      sample={isEncode ? DEMO_TEXT : DEMO_MORSE}
      resetOutputKey={direction}
      inputLabel={isEncode ? { zh: '文本输入', en: 'Text input' } : { zh: '莫尔斯电码输入', en: 'Morse code input' }}
      outputLabel={isEncode ? { zh: '电码结果', en: 'Morse output' } : { zh: '解码文本', en: 'Decoded text' }}
      inputPlaceholder={isEncode ? { zh: '输入字母、数字或标点，空格分词', en: 'Enter letters, digits, or punctuation; separate words with spaces' } : { zh: '用 . 和 - 表示电码，字母间单空格，单词间用 / 或连续空格', en: 'Use . and - for Morse; single space between letters, / or multiple spaces between words' }}
      outputFilename="morse.txt"
      successMessage={{ zh: '转换完成', en: 'Converted' }}
      showSwap={false}
      options={
        <Segmented
          value={direction}
          onChange={setDirection}
          ariaLabel={t({ zh: '莫尔斯方向', en: 'Morse direction' })}
          options={[
            { value: 'encode', label: t({ zh: '文本 → 电码', en: 'Text → Morse' }) },
            { value: 'decode', label: t({ zh: '电码 → 文本', en: 'Morse → Text' }) },
          ]}
        />
      }
      helpText={t({
        zh: '采用国际莫尔斯电码表：字母不区分大小写，支持数字与常见标点（，。？！等中文标点自动映射）。词间以 / 分隔。全程本地转换。',
        en: 'Uses the International Morse code table: letters are case-insensitive, digits and common punctuation are supported (Chinese punctuation is mapped automatically). Words are separated by /. All conversion happens locally.',
      })}
    />
  );
}
