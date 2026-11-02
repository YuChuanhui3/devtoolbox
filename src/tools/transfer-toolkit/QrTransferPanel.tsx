import { useEffect, useState } from 'react';
import { Camera, Send } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { DqxSession } from '@/hooks/useDqxSession';
import { ReceivePanel } from './ReceivePanel';
import { SendPanel } from './SendPanel';

type Direction = 'send' | 'receive';

interface QrTransferPanelProps {
  active: boolean;
  session: DqxSession;
  initialDirection?: Direction;
}

/** 发送与接收共享同一个入口；两个面板保持挂载，切换方向不会丢掉输入或接收进度。 */
export function QrTransferPanel({ active, session, initialDirection }: QrTransferPanelProps) {
  const { t } = useI18n();
  const [direction, setDirection] = useState<Direction>(initialDirection ?? 'send');

  useEffect(() => {
    if (initialDirection) setDirection(initialDirection);
  }, [initialDirection]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Direction>
          value={direction}
          onChange={setDirection}
          ariaLabel={t({ zh: '二维码传输方向', en: 'QR transfer direction' })}
          options={[
            { value: 'send', label: t({ zh: '发送', en: 'Send' }), icon: <Send className="h-3.5 w-3.5" aria-hidden="true" /> },
            { value: 'receive', label: t({ zh: '接收', en: 'Receive' }), icon: <Camera className="h-3.5 w-3.5" aria-hidden="true" /> },
          ]}
        />
        <p className="text-xs text-ink-3">
          {direction === 'send'
            ? t({ zh: '文本/文件 → 二维码帧序列', en: 'Text/file → QR frame sequence' })
            : t({ zh: '连续扫码 → 自动还原原文/文件', en: 'Scan continuously → restore the original text/file' })}
        </p>
      </div>

      <ToolAlert
        tone="info"
        title={{ zh: '二维码里的 DQX1 是传输协议，不是最终内容', en: 'DQX1 in the QR is the transport protocol, not the final content' }}
        hint={{
          zh: '每帧包含会话号、帧序号、压缩数据和 CRC 校验。接收端集齐后会自动重组、校验并解压，直接显示原始文本；无需手动解码 DQX1。',
          en: 'Each frame carries a session id, frame number, compressed data and CRC. Once complete, the receiver reassembles, verifies and inflates it automatically, then shows the original text — no manual DQX1 decoding needed.',
        }}
      />

      <div hidden={direction !== 'send'}>
        <SendPanel active={active && direction === 'send'} />
      </div>
      <div hidden={direction !== 'receive'}>
        <ReceivePanel active={active && direction === 'receive'} session={session} />
      </div>
    </div>
  );
}
