import { useSearchParams } from 'react-router-dom';
import { Globe, MessageSquare, Network, Radio } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { isRealtimeProtocol, REALTIME_PROTOCOLS, type RealtimeProtocol } from '@/lib/apiworkbench/subAddress';
import { Segmented } from '@/components/ui/Segmented';
import { WebSocketPanel } from './WebSocketPanel';
import { SsePanel } from './SsePanel';
import { SocketIoPanel } from './SocketIoPanel';
import { MqttPanel } from './MqttPanel';

/**
 * 「实时」页签：WebSocket / SSE / Socket.IO / MQTT 四个协议在同一面板内用 tab 切换
 * （与上游 Hoppscotch 的 /realtime 导航同构）。
 *
 * 协议 tab 切换时只渲染当前协议面板：连接本身是瞬态（浏览器标签页级），
 * 而连接配置（URL/凭据/订阅表）持久化在工作区文档里，切回来随时重连——
 * 与上游 realtime 的会话级连接状态同口径。
 *
 * URL：`?mode=realtime&proto=<websocket|sse|socketio|mqtt>`。
 * 搜索面板与旧链接写的 `?mode=<协议>` 由 HttpToolkitTool 的 foldSubMode 折到这里。
 */

const PROTO_LABEL: Record<RealtimeProtocol, { zh: string; en: string }> = {
  websocket: { zh: 'WebSocket', en: 'WebSocket' },
  sse: { zh: 'SSE', en: 'SSE' },
  socketio: { zh: 'Socket.IO', en: 'Socket.IO' },
  mqtt: { zh: 'MQTT', en: 'MQTT' },
};

const PROTO_ICON: Record<RealtimeProtocol, typeof Globe> = {
  websocket: Globe,
  sse: Radio,
  socketio: MessageSquare,
  mqtt: Network,
};

/** proto 参数的读取与写回：非法值回落 websocket（上游 /realtime 也重定向到 websocket）。 */
function useProto(): [RealtimeProtocol, (next: RealtimeProtocol) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('proto');
  const proto: RealtimeProtocol = isRealtimeProtocol(raw) ? raw : 'websocket';
  const setProto = (next: RealtimeProtocol) => {
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      if (next === 'websocket') nextParams.delete('proto');
      else nextParams.set('proto', next);
      return nextParams;
    }, { replace: true });
  };
  return [proto, setProto];
}

export function RealtimeWorkspace({ active }: { active: boolean }) {
  const { t } = useI18n();
  const [proto, setProto] = useProto();

  if (!active) return null;

  const options = REALTIME_PROTOCOLS.map((value) => ({
    value,
    label: (
      <span className="inline-flex items-center gap-1.5">
        {(() => { const Icon = PROTO_ICON[value]; return <Icon size={13} aria-hidden="true" />; })()}
        {t(PROTO_LABEL[value])}
      </span>
    ),
  }));

  return (
    <div className="space-y-4">
      <Segmented<RealtimeProtocol>
        value={proto}
        onChange={setProto}
        options={options}
        ariaLabel={t({ zh: '实时协议', en: 'Realtime protocol' })}
      />
      {proto === 'websocket' && <WebSocketPanel active />}
      {proto === 'sse' && <SsePanel active />}
      {proto === 'socketio' && <SocketIoPanel active />}
      {proto === 'mqtt' && <MqttPanel active />}
    </div>
  );
}

export default RealtimeWorkspace;
