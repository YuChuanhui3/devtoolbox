import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import { gzipTextToBase64, gunzipBase64ToText } from '@/lib/gzip';

type Direction = 'compress' | 'decompress';

const DEMO_TEXT = 'Gzip 压缩是文本传输中最通用的瘦身方式。'.repeat(4);
const DEMO_BASE64 =
  'H4sIAAAAAAAAE3OvyixQeNrX/XzPymcz1j+b1v5szponexa82Df5yY61z+Y0vGyY9XzKiuezWp7PWPZi1+pn03Y+3dP/uKHJfYjoAwAB2JTo4AAAAA==';

export default function GzipCodecTool() {
  const { t } = useI18n();
  const [direction, setDirection] = useState<Direction>('compress');
  const isCompress = direction === 'compress';

  return (
    <TransformTool
      transform={(input) => (isCompress ? gzipTextToBase64(input) : gunzipBase64ToText(input))}
      sample={isCompress ? DEMO_TEXT : DEMO_BASE64}
      resetOutputKey={direction}
      inputLabel={isCompress ? { zh: '需要压缩的文本', en: 'Text to compress' } : { zh: 'Base64(gzip) 数据', en: 'Base64(gzip) data' }}
      outputLabel={isCompress ? { zh: '压缩结果（Base64）', en: 'Compressed (Base64)' } : { zh: '解压结果（文本）', en: 'Decompressed (text)' }}
      inputPlaceholder={isCompress ? { zh: '输入或粘贴需要 Gzip 压缩的文本', en: 'Enter or paste text to Gzip-compress' } : { zh: '粘贴 本工具或其他 gzip 输出的 Base64 内容', en: 'Paste Base64 produced by this tool or another gzip output' }}
      outputEmptyText={isCompress ? { zh: '压缩结果将在这里显示', en: 'Compressed output will appear here' } : { zh: '点击「示例」先获得一段压缩数据', en: 'Click "Sample" to load a compressed payload' }}
      outputFilename={isCompress ? 'gzip-base64.txt' : 'gunzip-text.txt'}
      successMessage={isCompress ? { zh: '压缩完成', en: 'Compressed' } : { zh: '解压完成', en: 'Decompressed' }}
      showSwap={false}
      options={
        <Segmented
          value={direction}
          onChange={setDirection}
          ariaLabel={t({ zh: 'Gzip 方向', en: 'Gzip direction' })}
          options={[
            { value: 'compress', label: t({ zh: '压缩', en: 'Compress' }) },
            { value: 'decompress', label: t({ zh: '解压', en: 'Decompress' }) },
          ]}
        />
      }
      helpText={t({
        zh: '基于浏览器原生 CompressionStream（gzip 格式），输出为 Base64 编码的 gzip 字节流；解压同样在本地完成，内容不会上传。',
        en: 'Uses the browser-native CompressionStream (gzip format); output is a Base64-encoded gzip byte stream. Decompression also runs locally, so content is never uploaded.',
      })}
    />
  );
}
