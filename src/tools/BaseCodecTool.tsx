import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import { ToolError } from '@/lib/errors';
import { base32ToBytes, bytesToBase32, textToBase32 } from '@/lib/base32';
import {
  base58Decode,
  base58Encode,
  base62Decode,
  base62Encode,
  decodeBase100,
  encodeBase100,
} from '@/lib/basen';

type Alphabet = 'base32' | 'base58' | 'base62' | 'base100';
type Direction = 'encode' | 'decode';

const SAMPLE_TEXT: Record<Alphabet, string> = {
  base32: 'Hello, DevToolbox!',
  base58: 'Hello, DevToolbox!',
  base62: 'Hello, DevToolbox!',
  base100: '20261022',
};

function sampleFor(alphabet: Alphabet, direction: Direction): string {
  const text = SAMPLE_TEXT[alphabet];
  if (direction === 'encode') return text;
  if (alphabet === 'base100') return encodeBase100(text);
  if (alphabet === 'base32') return textToBase32(text);
  const bytes = new TextEncoder().encode(text);
  return alphabet === 'base58' ? base58Encode(bytes) : base62Encode(bytes);
}

function utf8Decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ToolError(
      { zh: '解码结果不是合法的 UTF-8 文本', en: 'The decoded bytes are not valid UTF-8 text' },
      { zh: '请确认选择了正确的字母表与方向。', en: 'Check that the alphabet and direction are correct.' },
    );
  }
}

export default function BaseCodecTool() {
  const { t } = useI18n();
  const [alphabet, setAlphabet] = useState<Alphabet>('base32');
  const [direction, setDirection] = useState<Direction>('encode');

  const transform = (input: string): string => {
    if (!input.trim()) {
      throw new ToolError({ zh: '请输入需要处理的内容', en: 'Enter the content to process' });
    }
    if (alphabet === 'base100') {
      return direction === 'encode' ? encodeBase100(input) : decodeBase100(input);
    }
    if (direction === 'encode') {
      const bytes = new TextEncoder().encode(input);
      if (alphabet === 'base32') return bytesToBase32(bytes);
      if (alphabet === 'base58') return base58Encode(bytes);
      return base62Encode(bytes);
    }
    const cleaned = input.trim();
    if (alphabet === 'base32') return utf8Decode(base32ToBytes(cleaned));
    if (alphabet === 'base58') return utf8Decode(base58Decode(cleaned));
    return utf8Decode(base62Decode(cleaned));
  };

  const isEncode = direction === 'encode';

  return (
    <TransformTool
      transform={transform}
      live
      liveKey={`${alphabet}-${direction}`}
      sample={sampleFor(alphabet, direction)}
      resetOutputKey={`${alphabet}-${direction}`}
      inputLabel={isEncode ? { zh: '原文输入', en: 'Plain text input' } : { zh: '密文输入', en: 'Encoded input' }}
      outputLabel={isEncode ? { zh: '编码结果', en: 'Encoded output' } : { zh: '解码结果', en: 'Decoded output' }}
      inputPlaceholder={
        isEncode
          ? alphabet === 'base100'
            ? { zh: '输入十进制数字串，例如 20261022', en: 'Enter a decimal digit string, e.g. 20261022' }
            : { zh: '输入需要编码的文本', en: 'Enter the text to encode' }
          : { zh: '粘贴需要解码的文本', en: 'Paste the text to decode' }
      }
      outputFilename="base-codec.txt"
      successMessage={{ zh: '处理完成', en: 'Done' }}
      showSwap={false}
      options={
        <>
          <Segmented
            value={alphabet}
            onChange={setAlphabet}
            ariaLabel={t({ zh: '字母表', en: 'Alphabet' })}
            options={[
              { value: 'base32', label: 'Base32' },
              { value: 'base58', label: 'Base58' },
              { value: 'base62', label: 'Base62' },
              { value: 'base100', label: 'Base100' },
            ]}
          />
          <Segmented
            value={direction}
            onChange={setDirection}
            ariaLabel={t({ zh: '转换方向', en: 'Direction' })}
            options={[
              { value: 'encode', label: t({ zh: '编码', en: 'Encode' }) },
              { value: 'decode', label: t({ zh: '解码', en: 'Decode' }) },
            ]}
          />
        </>
      }
      helpText={
        alphabet === 'base100'
          ? t({
              zh: 'Base100 是数字串趣味编码：每个数字映射为一对字母（0 → Aa … 9 → Jj），仅接受十进制数字。',
              en: 'Base100 is a playful digit-string encoding: each digit maps to a letter pair (0 → Aa … 9 → Jj), and only decimal digits are accepted.',
            })
          : t({
              zh: 'Base32 遵循 RFC 4648；Base58 使用比特币字母表（去掉 0OIl）；Base62 使用 0-9A-Za-z。三者按 UTF-8 字节做大整数值转换，内容仅在浏览器本地处理。',
              en: 'Base32 follows RFC 4648; Base58 uses the Bitcoin alphabet (dropping 0OIl); Base62 uses 0-9A-Za-z. All three convert UTF-8 bytes as large integers, locally in your browser.',
            })
      }
    />
  );
}
