import { Regex, Shield } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { EscapePanel } from './regex-toolkit/EscapePanel';
import { TesterPanel } from './regex-toolkit/TesterPanel';

type RegexToolkitMode = 'tester' | 'escape';

export default function RegexToolkitTool() {
  const { t } = useI18n();
  const [mode, setMode] = useToolkitMode<RegexToolkitMode>(['tester', 'escape'], 'tester');

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented<RegexToolkitMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '正则工具类型', en: 'Regex tool type' })}
          options={[
            {
              value: 'tester',
              label: t({ zh: '正则测试', en: 'Regex Tester' }),
              icon: <Regex className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'escape',
              label: t({ zh: '正则转义', en: 'Regex Escape' }),
              icon: <Shield className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <div className={mode === 'tester' ? 'contents' : 'hidden'}>
        <TesterPanel active={mode === 'tester'} />
      </div>
      <div className={mode === 'escape' ? 'contents' : 'hidden'}>
        <EscapePanel active={mode === 'escape'} />
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '正则测试与正则转义同页共存：一边实时匹配高亮，一边把字面文本转成安全 pattern · 切换模式不丢各自的输入与结果',
          en: 'Regex tester and escaper live on one page: match and highlight in real time while turning literal text into a safe pattern · switching modes keeps each panel\'s input and result',
        })}
      </p>
    </div>
  );
}
