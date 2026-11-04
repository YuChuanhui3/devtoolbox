import { FlaskConical, Gauge, Layers, FileText } from 'lucide-react';
import { ToolkitTabs } from '@/components/tool/ToolkitTabs';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { RequestPanel } from './http-toolkit/RequestPanel';
import { OpenApiPanel } from './http-toolkit/OpenApiPanel';
import { MockPanel } from './http-toolkit/MockPanel';
import { StressPanel } from './http-toolkit/StressPanel';

type HttpToolkitMode = 'request' | 'openapi' | 'mock' | 'stress';

export default function HttpToolkitTool() {
  const { t } = useI18n();
  const [mode, setMode] = useToolkitMode<HttpToolkitMode>(['request', 'openapi', 'mock', 'stress'], 'request');

  return (
    <div className="space-y-4">
      <ToolkitTabs<HttpToolkitMode>
        value={mode}
        onChange={setMode}
        ariaLabel={t({ zh: 'API 工作台页签', en: 'API workbench tab' })}
        options={[
          {
            value: 'request',
            label: t({ zh: '请求', en: 'Request' }),
            icon: <Layers className="h-3.5 w-3.5" aria-hidden="true" />,
          },
          {
            value: 'openapi',
            label: t({ zh: 'OpenAPI', en: 'OpenAPI' }),
            icon: <FileText className="h-3.5 w-3.5" aria-hidden="true" />,
          },
          {
            value: 'mock',
            label: 'Mock',
            icon: <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />,
          },
          {
            value: 'stress',
            label: t({ zh: '压测', en: 'Stress' }),
            icon: <Gauge className="h-3.5 w-3.5" aria-hidden="true" />,
          },
        ]}
      />

      <LazyPanel active={mode === 'request'}>
        <RequestPanel active={mode === 'request'} />
      </LazyPanel>
      <LazyPanel active={mode === 'openapi'}>
        <OpenApiPanel active={mode === 'openapi'} />
      </LazyPanel>
      <LazyPanel active={mode === 'mock'}>
        <MockPanel active={mode === 'mock'} />
      </LazyPanel>
      <LazyPanel active={mode === 'stress'}>
        <StressPanel active={mode === 'stress'} />
      </LazyPanel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: 'Postman 式集合与环境、OpenAPI 导入、本地 Mock、浏览器内压测合为一个 API 工作台 · 集合与数据保存在本机浏览器，不上传；切换页签不会丢失各自的输入与结果',
          en: 'One API workbench: Postman-style collections and environments, OpenAPI import, local mocking, and in-browser load testing · collections stay in your local browser, never uploaded, and switching tabs keeps each panel\'s input and results',
        })}
      </p>
    </div>
  );
}
