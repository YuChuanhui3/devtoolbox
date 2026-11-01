import { Cookie, MonitorSmartphone } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { BrowserInfoPanel } from './browser-toolkit/BrowserInfoPanel';
import { CookiePanel } from './browser-toolkit/CookiePanel';

type BrowserToolkitMode = 'info' | 'cookie';

export default function BrowserToolkitTool() {
  const { t } = useI18n();
  const [mode, setMode] = useToolkitMode<BrowserToolkitMode>(['info', 'cookie'], 'info');

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented<BrowserToolkitMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '浏览器检测类型', en: 'Browser inspection type' })}
          options={[
            {
              value: 'info',
              label: t({ zh: '浏览器信息', en: 'Browser Info' }),
              icon: <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'cookie',
              label: 'Cookie',
              icon: <Cookie className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <div className={mode === 'info' ? 'contents' : 'hidden'}>
        <BrowserInfoPanel active={mode === 'info'} />
      </div>
      <div className={mode === 'cookie' ? 'contents' : 'hidden'}>
        <CookiePanel active={mode === 'cookie'} />
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '浏览器环境检测与 Cookie 查看合为一箱：UA、屏幕、时区、WebGL 与本站可读 Cookie / Cookie 头解析，全程本地处理不上传',
          en: 'Browser environment inspection and cookie viewing in one kit: UA, screen, time zone, WebGL, plus readable cookies and Cookie-header parsing, all local and never uploaded',
        })}
      </p>
    </div>
  );
}
