import { BadgeCheck, Bot } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { BadgePanel } from './webmaster-toolkit/BadgePanel';
import { RobotsPanel } from './webmaster-toolkit/RobotsPanel';

type WebmasterMode = 'robots' | 'badge';

export default function WebmasterToolkitTool() {
  const { t } = useI18n();
  const [mode, setMode] = useToolkitMode<WebmasterMode>(['robots', 'badge'], 'robots');

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented<WebmasterMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '站长工具类型', en: 'Webmaster tool type' })}
          options={[
            {
              value: 'robots',
              label: 'robots.txt',
              icon: <Bot className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'badge',
              label: t({ zh: '徽章', en: 'Badge' }),
              icon: <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <div className={mode === 'robots' ? 'contents' : 'hidden'}>
        <RobotsPanel active={mode === 'robots'} />
      </div>
      <div className={mode === 'badge' ? 'contents' : 'hidden'}>
        <BadgePanel active={mode === 'badge'} />
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '两个站长生成器合为一箱：robots.txt 规则配置与 shields.io 风格徽章，切换标签不丢各自的配置',
          en: 'Two webmaster generators in one kit: robots.txt rule builder and shields.io-style badges — switching tabs keeps each panel\'s configuration',
        })}
      </p>
    </div>
  );
}
