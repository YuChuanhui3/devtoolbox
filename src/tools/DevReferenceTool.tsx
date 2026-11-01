import { useState } from 'react';
import { FileType, GitBranch, Heading, Hash, Plug, Radio, Terminal } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useI18n } from '@/i18n/I18nProvider';
import { HeadersPanel } from './dev-reference/HeadersPanel';
import { LinuxPanel } from './dev-reference/LinuxPanel';
import { MethodsPanel } from './dev-reference/MethodsPanel';
import { MimePanel } from './dev-reference/MimePanel';
import { MqttPanel } from './dev-reference/MqttPanel';
import { PortsPanel } from './dev-reference/PortsPanel';
import { StatusPanel } from './dev-reference/StatusPanel';

type DevReferenceMode =
  | 'http-status'
  | 'http-headers'
  | 'http-methods'
  | 'ports'
  | 'mime-type'
  | 'linux-commands'
  | 'mqtt';

export default function DevReferenceTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<DevReferenceMode>('http-status');

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented<DevReferenceMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '速查手册分类', en: 'Reference category' })}
          options={[
            {
              value: 'http-status',
              label: t({ zh: '状态码', en: 'Status' }),
              icon: <Hash className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'http-headers',
              label: t({ zh: '请求头', en: 'Headers' }),
              icon: <Heading className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'http-methods',
              label: t({ zh: '方法', en: 'Methods' }),
              icon: <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'ports',
              label: t({ zh: '端口', en: 'Ports' }),
              icon: <Plug className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'mime-type',
              label: 'MIME',
              icon: <FileType className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'linux-commands',
              label: t({ zh: 'Linux 命令', en: 'Linux' }),
              icon: <Terminal className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'mqtt',
              label: 'MQTT',
              icon: <Radio className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <div className={mode === 'http-status' ? 'contents' : 'hidden'}>
        <StatusPanel active={mode === 'http-status'} />
      </div>
      <div className={mode === 'http-headers' ? 'contents' : 'hidden'}>
        <HeadersPanel active={mode === 'http-headers'} />
      </div>
      <div className={mode === 'http-methods' ? 'contents' : 'hidden'}>
        <MethodsPanel active={mode === 'http-methods'} />
      </div>
      <div className={mode === 'ports' ? 'contents' : 'hidden'}>
        <PortsPanel active={mode === 'ports'} />
      </div>
      <div className={mode === 'mime-type' ? 'contents' : 'hidden'}>
        <MimePanel active={mode === 'mime-type'} />
      </div>
      <div className={mode === 'linux-commands' ? 'contents' : 'hidden'}>
        <LinuxPanel active={mode === 'linux-commands'} />
      </div>
      <div className={mode === 'mqtt' ? 'contents' : 'hidden'}>
        <MqttPanel active={mode === 'mqtt'} />
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '七类开发速查合并为一个手册：HTTP 状态码、请求头、方法、常用端口、MIME 类型、Linux 命令与 MQTT 速查 · 切换分类不会丢失各自的搜索词与筛选',
          en: 'Seven developer references in one handbook: HTTP status codes, headers, methods, common ports, MIME types, Linux commands, and an MQTT cheatsheet · switching categories keeps each panel\'s search and filter',
        })}
      </p>
    </div>
  );
}
