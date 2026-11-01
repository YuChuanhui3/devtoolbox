import { CreditCard, MapPin } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { AddressPanel } from './identity-toolkit/AddressPanel';
import { CardPanel } from './identity-toolkit/CardPanel';

type IdentityToolkitMode = 'card' | 'address';

export default function IdentityToolkitTool() {
  const { t } = useI18n();
  const [mode, setMode] = useToolkitMode<IdentityToolkitMode>(['card', 'address'], 'card');

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented<IdentityToolkitMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '虚拟身份类型', en: 'Virtual identity type' })}
          options={[
            {
              value: 'card',
              label: t({ zh: '虚拟银行卡', en: 'Bank Card' }),
              icon: <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'address',
              label: t({ zh: '虚拟地址', en: 'Identity Profile' }),
              icon: <MapPin className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <LazyPanel active={mode === 'card'}>
        <CardPanel active={mode === 'card'} />
      </LazyPanel>
      <LazyPanel active={mode === 'address'}>
        <AddressPanel active={mode === 'address'} />
      </LazyPanel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '两类虚拟身份数据合为一箱：中国大陆银行卡测试资料与多国虚拟身份档案 · 切换模式不会丢失各自的生成结果',
          en: 'Two virtual identity generators in one kit: mainland-China bank test profiles and multi-country identity profiles · switching modes keeps each panel\'s generated results',
        })}
      </p>
    </div>
  );
}
