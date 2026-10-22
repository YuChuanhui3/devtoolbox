import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import { ToolError } from '@/lib/errors';

type Mode = 'encode' | 'decode';
type EncodeMode = 'component' | 'uri';

const ENCODE_SAMPLE = 'https://example.com/搜索?q=你好 世界&page=1';
const DECODE_SAMPLE = 'https%3A%2F%2Fexample.com%2F%E6%90%9C%E7%B4%A2%3Fq%3D%E4%BD%A0%E5%A5%BD';

export default function UrlCodecTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('encode');
  const [encodeMode, setEncodeMode] = useState<EncodeMode>('component');

  const isEncode = mode === 'encode';

  const transform = (input: string): string => {
    try {
      if (isEncode) {
        return encodeMode === 'component' ? encodeURIComponent(input) : encodeURI(input);
      }
      return encodeMode === 'component' ? decodeURIComponent(input) : decodeURI(input);
    } catch {
      throw new ToolError(
        { zh: 'URL 解码失败', en: 'URL decoding failed' },
        {
          zh: '请检查 % 后是否为两位合法的十六进制字符，或输入内容是否包含不完整的多字节序列。',
          en: 'Check that each % is followed by two valid hexadecimal characters, or that the input has no incomplete multibyte sequence.',
        },
      );
    }
  };

  return (
    <TransformTool
      transform={transform}
      sample={isEncode ? ENCODE_SAMPLE : DECODE_SAMPLE}
      inputLabel={isEncode ? { zh: '原始文本 / URL', en: 'Raw text / URL' } : { zh: '编码后的文本', en: 'Encoded text' }}
      outputLabel={isEncode ? { zh: '编码结果', en: 'Encoded output' } : { zh: '解码结果', en: 'Decoded output' }}
      inputPlaceholder={
        isEncode ? { zh: '输入需要编码的 URL 或参数值', en: 'Enter the URL or parameter value to encode' } : { zh: '粘贴需要解码的 URL，例如 https%3A%2F%2F...', en: 'Paste the URL to decode, e.g. https%3A%2F%2F...' }
      }
      outputFilename={isEncode ? 'url-encoded.txt' : 'url-decoded.txt'}
      successMessage={isEncode ? { zh: '编码完成', en: 'Encoded' } : { zh: '解码完成', en: 'Decoded' }}
      onSwap={() => setMode(isEncode ? 'decode' : 'encode')}
      options={
        <>
          <Segmented
            value={mode}
            onChange={setMode}
            ariaLabel={t({ zh: 'URL 编码模式', en: 'URL codec mode' })}
            options={[
              { value: 'encode', label: t({ zh: '编码', en: 'Encode' }) },
              { value: 'decode', label: t({ zh: '解码', en: 'Decode' }) },
            ]}
          />
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            {t({ zh: '方式', en: 'Method' })}
            <Select
              value={encodeMode}
              onChange={(event) => setEncodeMode(event.target.value as EncodeMode)}
              aria-label={t({ zh: 'URL 编码方式', en: 'URL encoding method' })}
              className="h-8 text-xs"
              wrapperClassName="w-32"
            >
              <option value="component">encodeURIComponent</option>
              <option value="uri">encodeURI</option>
            </Select>
          </label>
        </>
      }
      helpText={t({
        zh: 'encodeURIComponent 会编码 / ? & = 等保留字符，适合参数值；encodeURI 保留 URL 结构字符，适合整条 URL。',
        en: 'encodeURIComponent also encodes reserved characters such as / ? & =, which suits parameter values; encodeURI keeps URL structure characters intact, which suits a whole URL.',
      })}
    />
  );
}
