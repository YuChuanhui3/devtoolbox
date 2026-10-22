import { useState } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Segmented';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import { ToolError } from '@/lib/errors';
import { SAMPLE_HEX } from '@/data/samples';

type Mode = 'encode' | 'decode';

const DECODE_SAMPLE = '48 65 6c 6c 6f 2c 20 e4 b8 96 e7 95 8c';

function textToHex(text: string, separator: string, uppercase: boolean): string {
  const bytes = new TextEncoder().encode(text);
  const parts = Array.from(bytes).map((byte) => {
    const hex = byte.toString(16).padStart(2, '0');
    return uppercase ? hex.toUpperCase() : hex;
  });
  return parts.join(separator);
}

function hexToText(input: string): string {
  const cleaned = input.replace(/0x/gi, '').replace(/[\s,:;-]+/g, '');
  if (!cleaned) {
    throw new ToolError(
      { zh: 'Hex 输入为空', en: 'Hex input is empty' },
      { zh: '请输入十六进制字符串。', en: 'Enter a hexadecimal string.' },
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new ToolError(
      { zh: 'Hex 格式不正确', en: 'Invalid Hex format' },
      {
        zh: '仅允许 0-9、a-f 以及空格、冒号、短横线等分隔符。',
        en: 'Only 0-9 and a-f are allowed, plus separators such as spaces, colons, and hyphens.',
      },
    );
  }
  if (cleaned.length % 2 !== 0) {
    throw new ToolError(
      { zh: 'Hex 长度不正确', en: 'Invalid Hex length' },
      {
        zh: '十六进制字符数必须为偶数，每个字节由两位组成。',
        en: 'The hex digit count must be even — each byte is two digits.',
      },
    );
  }

  const bytes = new Uint8Array(cleaned.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(cleaned.slice(index * 2, index * 2 + 2), 16);
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ToolError(
      { zh: 'Hex 解码失败', en: 'Hex decoding failed' },
      {
        zh: '解码结果不是合法的 UTF-8 文本，可能该内容为二进制数据。',
        en: 'The decoded bytes are not valid UTF-8; the content may be binary data.',
      },
    );
  }
}

export default function HexTextTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('encode');
  const [separator, setSeparator] = useState(' ');
  const [uppercase, setUppercase] = useState(false);

  const isEncode = mode === 'encode';

  return (
    <TransformTool
      transform={(input) => (isEncode ? textToHex(input, separator, uppercase) : hexToText(input))}
      sample={isEncode ? SAMPLE_HEX : DECODE_SAMPLE}
      inputLabel={isEncode ? { zh: '原始文本', en: 'Raw text' } : { zh: 'Hex 输入', en: 'Hex input' }}
      outputLabel={isEncode ? { zh: 'Hex 结果', en: 'Hex output' } : { zh: '还原文本', en: 'Restored text' }}
      inputPlaceholder={isEncode ? { zh: '输入文本，例如 Hello, 世界', en: 'Enter text, e.g. Hello, world' } : { zh: '输入 Hex，例如 48 65 6c 6c 6f', en: 'Enter hex, e.g. 48 65 6c 6c 6f' }}
      outputFilename={isEncode ? 'hex.txt' : 'decoded.txt'}
      successMessage={isEncode ? { zh: '编码完成', en: 'Encoded' } : { zh: '解码完成', en: 'Decoded' }}
      onSwap={() => setMode(isEncode ? 'decode' : 'encode')}
      options={
        <>
          <Segmented
            value={mode}
            onChange={setMode}
            ariaLabel={t({ zh: 'Hex 转换模式', en: 'Hex mode' })}
            options={[
              { value: 'encode', label: t({ zh: '文本 → Hex', en: 'Text → Hex' }) },
              { value: 'decode', label: t({ zh: 'Hex → 文本', en: 'Hex → Text' }) },
            ]}
          />
          {isEncode ? (
            <>
              <label className="flex items-center gap-1.5 text-xs text-ink-3">
                {t({ zh: '分隔符', en: 'Separator' })}
                <Select
                  value={separator}
                  onChange={(event) => setSeparator(event.target.value)}
                  aria-label={t({ zh: 'Hex 分隔符', en: 'Hex separator' })}
                  className="h-8 text-xs"
                  wrapperClassName="w-24"
                >
                  <option value=" ">{t({ zh: '空格', en: 'Space' })}</option>
                  <option value="">{t({ zh: '无', en: 'None' })}</option>
                  <option value=":">{t({ zh: '冒号', en: 'Colon' })}</option>
                  <option value="-">{t({ zh: '短横线', en: 'Hyphen' })}</option>
                </Select>
              </label>
              <Checkbox
                checked={uppercase}
                onChange={setUppercase}
                label={t({ zh: '大写输出', en: 'Uppercase output' })}
                className="text-xs"
              />
            </>
          ) : null}
        </>
      }
      helpText={t({
        zh: '按 UTF-8 编码转换；解码时自动忽略空格、冒号、短横线与 0x 前缀。',
        en: 'Converts via UTF-8; when decoding, spaces, colons, hyphens, and 0x prefixes are ignored.',
      })}
    />
  );
}
