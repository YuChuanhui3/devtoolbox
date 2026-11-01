import { Globe, Lock, Magnet, Zap } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { ProxyLinkPanel } from './link-parser-toolkit/ProxyLinkPanel';
import { ThunderUrlPanel } from './link-parser-toolkit/ThunderUrlPanel';
import { TorrentMagnetPanel } from './link-parser-toolkit/TorrentMagnetPanel';
import { Type7Panel } from './link-parser-toolkit/Type7Panel';

type LinkParserMode = 'proxy-link' | 'thunder-url' | 'torrent-magnet' | 'type-7';

export default function LinkParserToolkitTool() {
  const { t } = useI18n();
  const [mode, setMode] = useToolkitMode<LinkParserMode>(['proxy-link', 'thunder-url', 'torrent-magnet', 'type-7'], 'proxy-link');

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented<LinkParserMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '链接解析类型', en: 'Link parser type' })}
          options={[
            {
              value: 'proxy-link',
              label: t({ zh: '代理链接', en: 'Proxy Link' }),
              icon: <Globe className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'thunder-url',
              label: t({ zh: '迅雷链接', en: 'Thunder Link' }),
              icon: <Zap className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'torrent-magnet',
              label: t({ zh: '种子磁力', en: 'Torrent Magnet' }),
              icon: <Magnet className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'type-7',
              label: t({ zh: 'Cisco Type7', en: 'Cisco Type-7' }),
              icon: <Lock className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <LazyPanel active={mode === 'proxy-link'}>
        <ProxyLinkPanel active={mode === 'proxy-link'} />
      </LazyPanel>
      <LazyPanel active={mode === 'thunder-url'}>
        <ThunderUrlPanel active={mode === 'thunder-url'} />
      </LazyPanel>
      <LazyPanel active={mode === 'torrent-magnet'}>
        <TorrentMagnetPanel active={mode === 'torrent-magnet'} />
      </LazyPanel>
      <LazyPanel active={mode === 'type-7'}>
        <Type7Panel active={mode === 'type-7'} />
      </LazyPanel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '四类链接/口令解析器同页共存，各自保留输入与选项：切换标签不丢状态，全部在本地处理、绝不上传',
          en: 'Four link/credential parsers share one page, each keeping its own inputs and options: switching tabs loses no state, everything runs locally and is never uploaded',
        })}
      </p>
    </div>
  );
}
