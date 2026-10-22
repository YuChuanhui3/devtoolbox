import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import { ToolError } from '@/lib/errors';
import {
  decodeFlashget,
  decodeQqXuanfeng,
  decodeThunder,
  encodeFlashget,
  encodeQqXuanfeng,
  encodeThunder,
} from '@/lib/thunder';

type Platform = 'thunder' | 'flashget' | 'qqdl';
type Direction = 'encode' | 'decode';

const SAMPLE_URL = 'https://mirrors.example.com/files/toolbox-1.0.iso';
const PLATFORM_SAMPLES: Record<Platform, string> = {
  thunder: encodeThunder(SAMPLE_URL),
  flashget: encodeFlashget(SAMPLE_URL),
  qqdl: encodeQqXuanfeng(SAMPLE_URL),
};

export default function ThunderUrlTool() {
  const { t } = useI18n();
  const [platform, setPlatform] = useState<Platform>('thunder');
  const [direction, setDirection] = useState<Direction>('encode');
  const isEncode = direction === 'encode';

  const transform = (input: string): string => {
    if (!input.trim())
      throw new ToolError(
        isEncode
          ? { zh: '请输入普通下载地址', en: 'Enter a plain download URL' }
          : { zh: '请输入专用链接', en: 'Enter a proprietary link' },
      );
    const value = input.trim();
    if (isEncode) {
      if (platform === 'thunder') return encodeThunder(value);
      if (platform === 'flashget') return encodeFlashget(value);
      return encodeQqXuanfeng(value);
    }
    if (platform === 'thunder') return decodeThunder(value);
    if (platform === 'flashget') return decodeFlashget(value);
    return decodeQqXuanfeng(value);
  };

  return (
    <TransformTool
      transform={transform}
      live
      liveKey={`${platform}-${direction}`}
      sample={isEncode ? SAMPLE_URL : PLATFORM_SAMPLES[platform]}
      resetOutputKey={`${platform}-${direction}`}
      inputLabel={isEncode ? { zh: '普通下载地址（http/https）', en: 'Plain download URL (http/https)' } : { zh: '专用链接', en: 'Proprietary link' }}
      outputLabel={isEncode ? { zh: '专用链接', en: 'Proprietary link' } : { zh: '还原的普通地址', en: 'Restored plain URL' }}
      inputPlaceholder={
        isEncode
          ? { zh: '例如 https://host/path/file.zip', en: 'For example https://host/path/file.zip' }
          : t({ zh: `粘贴 ${platform}:// 开头的链接`, en: `Paste a link starting with ${platform}://` })
      }
      outputFilename="download-link.txt"
      successMessage={{ zh: '转换完成', en: 'Converted' }}
      showSwap={false}
      options={
        <>
          <Segmented
            value={platform}
            onChange={setPlatform}
            ariaLabel={t({ zh: '下载平台', en: 'Download platform' })}
            options={[
              { value: 'thunder', label: t({ zh: '迅雷', en: 'Thunder' }) },
              { value: 'flashget', label: t({ zh: '快车', en: 'FlashGet' }) },
              { value: 'qqdl', label: t({ zh: 'QQ旋风', en: 'QQ Xuanfeng' }) },
            ]}
          />
          <Segmented
            value={direction}
            onChange={setDirection}
            ariaLabel={t({ zh: '转换方向', en: 'Conversion direction' })}
            options={[
              { value: 'encode', label: t({ zh: '普通 → 专用', en: 'Plain → Proprietary' }) },
              { value: 'decode', label: t({ zh: '专用 → 普通', en: 'Proprietary → Plain' }) },
            ]}
          />
        </>
      }
      helpText={t({
        zh: '迅雷：thunder://Base64(AA+地址+ZZ)；快车：flashget://Base64([FLASHGET]+地址+[FLASHGET])&标记；QQ旋风：qqdl://Base64(地址)。仅做格式转换，不代理下载、内容不上传。',
        en: 'Thunder: thunder://Base64(AA+URL+ZZ); FlashGet: flashget://Base64([FLASHGET]+URL+[FLASHGET])&tag; QQ Xuanfeng: qqdl://Base64(URL). Format conversion only — no proxying, no uploads.',
      })}
    />
  );
}
