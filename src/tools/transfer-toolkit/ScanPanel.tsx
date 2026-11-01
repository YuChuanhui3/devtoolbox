import { useState } from 'react';
import { ScanLine, Send } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Panel } from '@/components/ui/Panel';
import { Textarea } from '@/components/ui/Textarea';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { useDropConnection } from './useDropConnection';
import { EndSessionButton, PairingFlow } from './PairingFlow';
import { Scanner } from './Scanner';
import { Timeline } from './Timeline';

const TOUCH_DEVICE = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

export default function ScanPanel() {
  const { t } = useI18n();
  const conn = useDropConnection();
  const [useCamera, setUseCamera] = useState(TOUCH_DEVICE);
  const [manual, setManual] = useState('');
  const connected = conn.phase === 'connected';

  const scans = conn.items.filter((item) => item.kind === 'scan');

  return (
    <div className="space-y-4">
      <ToolAlert
        tone="info"
        title={{ zh: '把手机当成电脑的扫码器', en: 'Turn the phone into the computer\'s scanner' }}
        hint={{ zh: '两台设备连同一 Wi-Fi、都打开本页签并配对；之后手机每扫到一个二维码，内容就实时出现在电脑上的这条会话里。', en: 'Put both devices on the same Wi-Fi, open this tab on both, then pair. Every QR code the phone scans shows up live in the session on the other screen.' }}
      />

      <PairingFlow conn={conn} />

      {connected ? (
        <Panel
          title={t({ zh: '扫码回传', en: 'Scan and forward' })}
          subtitle={conn.peerLabel ? t({ zh: `已连接：${conn.peerLabel}`, en: `Connected: ${conn.peerLabel}` }) : undefined}
          actions={<EndSessionButton onClick={conn.cancelPairing} />}
          bodyClassName="space-y-3"
        >
          <Checkbox
            checked={useCamera}
            onChange={setUseCamera}
            label={t({ zh: '用本机摄像头连续扫码', en: 'Scan continuously with this camera' })}
            description={t({
              zh: '关掉后仍可手动粘贴扫码结果转发；无摄像头的电脑正是这样用的。',
              en: 'Turn it off to paste results instead — which is how a computer without a camera uses this tab.',
            })}
          />
          {useCamera ? <Scanner active mode="any" onResult={(text) => conn.sendScan(text)} /> : null}
          <div className="space-y-2 border-t border-dashed border-line pt-3">
            <Textarea
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              rows={2}
              mono
              className="text-[11px]"
              placeholder={t({ zh: '摄像头扫不到时，把二维码内容粘贴到这里再回传', en: 'Camera can\'t read it? Paste the QR content here and forward it' })}
              aria-label={t({ zh: '手动回传扫码内容', en: 'Forward scanned content manually' })}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={!manual.trim()}
              onClick={() => {
                conn.sendScan(manual);
                setManual('');
              }}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {t({ zh: '回传给对方', en: 'Forward to peer' })}
            </Button>
          </div>
        </Panel>
      ) : null}

      {conn.items.length > 0 && conn.phase !== 'idle' ? (
        <Panel
          title={t({ zh: '扫码记录', en: 'Scan log' })}
          subtitle={scans.length
            ? t({ zh: `${scans.length} 条`, en: `${scans.length} entries` })
            : t({ zh: '还没有扫码结果', en: 'No scans yet' })}
          bodyClassName="space-y-2"
        >
          <Timeline items={conn.items} onAccept={conn.acceptIncoming} onReject={conn.rejectIncoming} />
        </Panel>
      ) : null}

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: '扫码内容只在两台设备之间直传，不经过服务器；内网/外网隔离场景请改用「发送 / 接收」页签。',
          en: 'Scanned content travels directly between the two devices, never through a server; for air-gapped transfer use the Send / Receive tabs.',
        })}
      </p>
      <Badge tone="neutral" className="mx-auto block w-fit">
        <ScanLine className="h-3 w-3" aria-hidden="true" />
        {t({ zh: 'ZXing 扫码 · 局域网实时回传', en: 'ZXing scanning · live LAN forward' })}
      </Badge>
    </div>
  );
}
