import { FlaskConical, Gauge, Layers, FileText, Webhook } from 'lucide-react';
import { ToolkitTabs } from '@/components/tool/ToolkitTabs';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { RequestPanel } from './http-toolkit/RequestPanel';
import { WebSocketPanel } from './http-toolkit/WebSocketPanel';
import { OpenApiPanel } from './http-toolkit/OpenApiPanel';
import { MockPanel } from './http-toolkit/MockPanel';
import { StressPanel } from './http-toolkit/StressPanel';
import { WorkbenchProvider } from './http-toolkit/WorkbenchContext';

type HttpToolkitMode = 'request' | 'websocket' | 'openapi' | 'mock' | 'stress';

export default function HttpToolkitTool() {
  const { t } = useI18n();
  const [mode, setMode] = useToolkitMode<HttpToolkitMode>(['request', 'websocket', 'openapi', 'mock', 'stress'], 'request');

  return (
    <WorkbenchProvider>
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
            value: 'websocket',
            label: 'WebSocket',
            icon: <Webhook className="h-3.5 w-3.5" aria-hidden="true" />,
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
      <LazyPanel active={mode === 'websocket'}>
        <WebSocketPanel active={mode === 'websocket'} />
      </LazyPanel>
      <LazyPanel active={mode === 'openapi'}>
        <OpenApiPanel active={mode === 'openapi'} onJumpToRequest={() => setMode('request')} />
      </LazyPanel>
      <LazyPanel active={mode === 'mock'}>
        <MockPanel active={mode === 'mock'} />
      </LazyPanel>
      <LazyPanel active={mode === 'stress'}>
        <StressPanel active={mode === 'stress'} />
      </LazyPanel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '集合、环境、连接与历史只存在本机浏览器，不上传；各页签的输入与结果在切换页签时保留',
          en: 'Collections, environments, connections and history stay in this browser and are never uploaded; each tab keeps its input when you switch away',
        })}
      </p>
      </div>
    </WorkbenchProvider>
  );
}
