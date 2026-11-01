import { Dices, Fingerprint, Hash } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { PasswordPanel } from './random-toolkit/PasswordPanel';
import { RandomNumberPanel } from './random-toolkit/RandomNumberPanel';
import { UuidPanel } from './random-toolkit/UuidPanel';

type RandomToolkitMode = 'uuid' | 'number' | 'password';

export default function RandomToolkitTool() {
  const { t } = useI18n();
  const [mode, setMode] = useToolkitMode<RandomToolkitMode>(['uuid', 'number', 'password'], 'uuid');

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented<RandomToolkitMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '随机生成类型', en: 'Random generator type' })}
          options={[
            {
              value: 'uuid',
              label: 'UUID',
              icon: <Hash className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'number',
              label: t({ zh: '随机数', en: 'Number' }),
              icon: <Dices className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'password',
              label: t({ zh: '密码', en: 'Password' }),
              icon: <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <LazyPanel active={mode === 'uuid'}>
        <UuidPanel active={mode === 'uuid'} />
      </LazyPanel>
      <LazyPanel active={mode === 'number'}>
        <RandomNumberPanel active={mode === 'number'} />
      </LazyPanel>
      <LazyPanel active={mode === 'password'}>
        <PasswordPanel active={mode === 'password'} />
      </LazyPanel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '三种随机生成器同页共存：UUID、随机数、高强度密码 · 均基于 Web Crypto 随机源，切换标签不丢各自的选项与结果',
          en: 'Three random generators in one kit: UUID, numbers, and strong passwords · all backed by the Web Crypto random source, switching tabs keeps each panel\'s options and results',
        })}
      </p>
    </div>
  );
}
