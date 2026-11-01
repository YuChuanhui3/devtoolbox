import { Binary, HardDrive, Monitor, ScanLine } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { CrcPanel } from './dev-calc-toolkit/CrcPanel';
import { FileSizePanel } from './dev-calc-toolkit/FileSizePanel';
import { PpiPanel } from './dev-calc-toolkit/PpiPanel';
import { RadixPanel } from './dev-calc-toolkit/RadixPanel';

type DevCalcMode = 'radix' | 'file-size' | 'crc' | 'ppi';

export default function DevCalcToolkitTool() {
  const { t } = useI18n();
  const [mode, setMode] = useToolkitMode<DevCalcMode>(['radix', 'file-size', 'crc', 'ppi'], 'radix');

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented<DevCalcMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '开发换算计算类型', en: 'Dev calc tool type' })}
          options={[
            {
              value: 'radix',
              label: t({ zh: '进制转换', en: 'Base Conversion' }),
              icon: <Binary className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'file-size',
              label: t({ zh: '文件大小', en: 'File Size' }),
              icon: <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'crc',
              label: t({ zh: 'CRC 校验', en: 'CRC Check' }),
              icon: <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'ppi',
              label: t({ zh: 'PPI 计算', en: 'PPI Calc' }),
              icon: <Monitor className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <LazyPanel active={mode === 'radix'}>
        <RadixPanel active={mode === 'radix'} />
      </LazyPanel>
      <LazyPanel active={mode === 'file-size'}>
        <FileSizePanel active={mode === 'file-size'} />
      </LazyPanel>
      <LazyPanel active={mode === 'crc'}>
        <CrcPanel active={mode === 'crc'} />
      </LazyPanel>
      <LazyPanel active={mode === 'ppi'}>
        <PpiPanel active={mode === 'ppi'} />
      </LazyPanel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '四个换算/计算小工具同页共存，各自保留输入与选项：切换标签不丢状态，全部在本地实时计算',
          en: 'Four calc tools share one page, each keeping its own inputs and options: switching tabs loses no state, everything computes locally in real time',
        })}
      </p>
    </div>
  );
}
