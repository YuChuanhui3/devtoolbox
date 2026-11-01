import { useState } from 'react';
import { Globe, Hash, MapPin, Network, ScanEye, Shuffle, Waypoints } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { useToolContext } from '@/components/tool/ToolContext';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import { useI18n } from '@/i18n/I18nProvider';
import { GeneratorsPanel } from './ip-toolkit/GeneratorsPanel';
import { IpInfoPanel } from './ip-toolkit/IpInfoPanel';
import { IpNumberPanel } from './ip-toolkit/IpNumberPanel';
import { MyIpPanel } from './ip-toolkit/MyIpPanel';
import { NearbyPanel } from './ip-toolkit/NearbyPanel';
import { SubnetPanel } from './ip-toolkit/SubnetPanel';

type IpToolkitMode = 'query' | 'number' | 'subnet' | 'my' | 'nearby' | 'generators';

export default function IpToolkitTool() {
  const { t } = useI18n();
  const toolContext = useToolContext();
  const [mode, setMode] = useState<IpToolkitMode>('query');
  const [ipTextState, setIpTextState] = useState(() => toolContext?.initialInput ?? '');

  const { markDirty } = useDraftAutosave(
    () => ipTextState || null,
    [ipTextState],
    () => setIpTextState(''),
  );

  const setIpText = (value: string) => {
    markDirty();
    setIpTextState(value);
  };

  const panelProps = { ip: ipTextState, setIp: setIpText };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Waypoints className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <Input
          value={ipTextState}
          onChange={(e) => setIpText(e.target.value)}
          placeholder={t({
            zh: '共享 IP / 网段，如 8.8.8.8 或 192.168.1.100/24…',
            en: 'Shared IP / subnet, e.g. 8.8.8.8 or 192.168.1.100/24…',
          })}
          mono
          className="pl-9"
          aria-label={t({ zh: '共享 IP 输入', en: 'Shared IP input' })}
        />
      </div>

      <div className="flex justify-center">
        <Segmented<IpToolkitMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: 'IP 工具箱模式', en: 'IP toolkit mode' })}
          options={[
            {
              value: 'query',
              label: t({ zh: '归属查询', en: 'Lookup' }),
              icon: <Globe className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'number',
              label: t({ zh: 'IP ↔ 整数', en: 'IP ↔ Number' }),
              icon: <Hash className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'subnet',
              label: t({ zh: '子网计算', en: 'Subnet' }),
              icon: <Network className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'my',
              label: t({ zh: '我的 IP', en: 'My IP' }),
              icon: <ScanEye className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'nearby',
              label: t({ zh: '就近查询', en: 'Nearby' }),
              icon: <MapPin className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'generators',
              label: t({ zh: '随机生成', en: 'Generators' }),
              icon: <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <div className={mode === 'query' ? 'contents' : 'hidden'}>
        <IpInfoPanel {...panelProps} active={mode === 'query'} />
      </div>
      <div className={mode === 'number' ? 'contents' : 'hidden'}>
        <IpNumberPanel {...panelProps} active={mode === 'number'} />
      </div>
      <div className={mode === 'subnet' ? 'contents' : 'hidden'}>
        <SubnetPanel {...panelProps} active={mode === 'subnet'} />
      </div>
      <div className={mode === 'my' ? 'contents' : 'hidden'}>
        <MyIpPanel active={mode === 'my'} />
      </div>
      <div className={mode === 'nearby' ? 'contents' : 'hidden'}>
        <NearbyPanel active={mode === 'nearby'} />
      </div>
      <div className={mode === 'generators' ? 'contents' : 'hidden'}>
        <GeneratorsPanel active={mode === 'generators'} />
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '六个 IP 网络面板同页挂载：共享 IP 一次填写，归属查询、整数互转、子网计算即时可用；我的 IP、就近查询与随机生成各自独立 · 切换模式不会丢失各自的结果',
          en: 'Six IP/network panels stay mounted: fill one shared IP for lookup, number conversion, and subnet math; my-IP, nearby, and generators work independently · switching modes keeps each panel\'s results',
        })}
      </p>
    </div>
  );
}
