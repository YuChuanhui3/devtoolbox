import { useEffect, useRef, useState } from 'react';
import { MonitorSmartphone, ScanLine, Send } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Panel } from '@/components/ui/Panel';
import { Textarea } from '@/components/ui/Textarea';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { shouldWarnHuge } from '@/lib/filedrop';
import { DQX_PREFIX } from '@/lib/qr-transfer';
import type { DqxSession } from '@/hooks/useDqxSession';
import { useDropConnection } from './useDropConnection';
import { EndSessionButton, PairingFlow } from './PairingFlow';
import { Scanner } from './Scanner';
import { Timeline } from './Timeline';
import { DqxResult, SessionProgress } from './DqxResult';

const TOUCH_DEVICE = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

interface DropPanelProps {
  session: DqxSession;
}

export default function DropPanel({ session }: DropPanelProps) {
  const { t } = useI18n();
  const conn = useDropConnection();
  const [pendingHuge, setPendingHuge] = useState<File | null>(null);
  const [composer, setComposer] = useState('');
  const [scanMode, setScanMode] = useState(TOUCH_DEVICE);
  const [manualScan, setManualScan] = useState('');
  const [mismatch, setMismatch] = useState<{ sid: string; crc: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fedRef = useRef<Set<string>>(new Set());

  const deliverFile = (file: File) => {
    if (shouldWarnHuge(file.size)) {
      setPendingHuge(file);
      return;
    }
    conn.sendFile(file);
  };

  const onFilesPicked = (files: FileList | File[]) => {
    for (const file of Array.from(files)) deliverFile(file);
  };

  const connected = conn.phase === 'connected';

  // 对方转发来的 DQX 帧直接进共享会话收集器：缺帧清单、CRC 校验、解压全是接收页现成的。
  const acceptRef = useRef(session.accept);
  acceptRef.current = session.accept;
  useEffect(() => {
    for (const item of conn.items) {
      if (item.kind !== 'scan' || item.mine || fedRef.current.has(item.id)) continue;
      const body = item.body.trim();
      if (!body.startsWith(DQX_PREFIX)) continue;
      fedRef.current.add(item.id);
      acceptRef.current(body);
    }
  }, [conn.items]);

  const lastEvent = session.event;
  useEffect(() => {
    if (lastEvent?.kind === 'mismatch') setMismatch({ sid: lastEvent.session.sid, crc: lastEvent.crcActual });
    if (lastEvent?.kind === 'complete') setMismatch(null);
  }, [lastEvent]);

  const sessions = session.sessions;
  const { complete } = session;

  return (
    <div className="space-y-4">
      <ToolAlert
        tone="info"
        title={{ zh: '两台设备连接同一 Wi-Fi，数据点对点直传', en: 'Connect both devices to the same Wi-Fi; data goes peer-to-peer' }}
        hint={{
          zh: '文件不经过任何服务器。连上后勾选「手机充当扫码器」，手机扫到的二维码内容会实时出现在另一台设备上。',
          en: 'Files never pass through a server. Once connected, tick "Use this phone as the scanner" and every QR code it reads appears live on the other device.',
        }}
      />

      <PairingFlow conn={conn} />

      {sessions.length > 0 ? (
        <Panel
          title={t({ zh: '转发来的二维码帧', en: 'Forwarded QR frames' })}
          subtitle={t({ zh: '手机扫到的 DQX 帧自动在这里重组、解压', en: 'DQX frames the phone scans are reassembled and inflated here' })}
          actions={
            <Button variant="ghost" size="sm" onClick={session.reset}>
              {t({ zh: '清空重来', en: 'Reset' })}
            </Button>
          }
          bodyClassName="p-4"
        >
          <div className="space-y-3">
            {sessions.map((view) => (
              <SessionProgress key={view.sid} view={view} mismatch={mismatch?.sid === view.sid ? mismatch.crc : undefined} />
            ))}
            {complete ? <DqxResult view={complete.view} payload={complete.payload} /> : null}
          </div>
        </Panel>
      ) : null}

      {conn.items.length > 0 && conn.phase !== 'idle' ? (
        <Panel
          title={t({ zh: '传输会话', en: 'Transfer session' })}
          subtitle={conn.peerLabel ? t({ zh: `已连接：${conn.peerLabel}`, en: `Connected: ${conn.peerLabel}` }) : t({ zh: '等待连接…', en: 'Waiting for connection…' })}
          actions={<EndSessionButton onClick={conn.cancelPairing} />}
        >
          <Timeline items={conn.items} onAccept={conn.acceptIncoming} onReject={conn.rejectIncoming} />
        </Panel>
      ) : null}

      {connected ? (
        <Panel bodyClassName="space-y-2">
          {pendingHuge ? (
            <ToolAlert
              tone="warning"
              title={t({ zh: `「${pendingHuge.name}」超过 1GB`, en: `"${pendingHuge.name}" is over 1GB` })}
              hint={{ zh: '手机端内存有限，超大文件可能传输失败。确认仍要发送？', en: 'Phones have limited memory; very large files may fail. Send anyway?' }}
            >
              <div className="mt-2 flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    conn.sendFile(pendingHuge);
                    setPendingHuge(null);
                  }}
                >
                  {t({ zh: '仍要发送', en: 'Send anyway' })}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPendingHuge(null)}>
                  {t({ zh: '取消', en: 'Cancel' })}
                </Button>
              </div>
            </ToolAlert>
          ) : null}
          <Textarea
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files).filter((f) => f.size > 0);
              if (files.length) {
                event.preventDefault();
                onFilesPicked(files);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (composer.trim()) {
                  conn.sendText(composer);
                  setComposer('');
                }
              }
            }}
            rows={3}
            placeholder={t({ zh: '输入文本直接发送；粘贴截图或选择文件后由对方确认接收（Enter 发送，Shift+Enter 换行）', en: 'Type text to send; paste a screenshot or pick files for the peer to confirm (Enter sends, Shift+Enter for a new line)' })}
            className="text-sm"
            aria-label={t({ zh: '发送内容', en: 'Send content' })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) onFilesPicked(event.target.files);
                event.target.value = '';
              }}
            />
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden="true" />
              {t({ zh: '选择文件', en: 'Choose files' })}
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="ml-auto"
              onClick={() => {
                conn.sendText(composer);
                setComposer('');
              }}
              disabled={!composer.trim()}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {t({ zh: '发送', en: 'Send' })}
            </Button>
          </div>

          <div className="space-y-3 border-t border-dashed border-line pt-3">
            <Checkbox
              checked={scanMode}
              onChange={setScanMode}
              label={t({ zh: '本机充当对方的扫码器', en: 'Use this device as the peer\'s scanner' })}
              description={t({
                zh: '勾选后摄像头连续扫码，每个结果实时回传给对方；扫到 DQX 协议帧会自动重组解压。没有摄像头的电脑关掉它，用下方粘贴框转发。',
                en: 'When ticked the camera scans continuously and forwards every result to the peer; DQX protocol frames are reassembled and inflated automatically. On a computer with no camera, turn it off and paste instead.',
              })}
              className="text-xs"
            />
            {scanMode ? <Scanner active mode="any" onResult={(text) => conn.sendScan(text)} /> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Textarea
                value={manualScan}
                onChange={(event) => setManualScan(event.target.value)}
                rows={2}
                mono
                className="min-w-0 flex-1 text-[11px]"
                placeholder={t({ zh: '摄像头扫不到时，把二维码内容粘贴到这里再回传', en: 'Camera can\'t read it? Paste the QR content here and forward it' })}
                aria-label={t({ zh: '手动回传扫码内容', en: 'Forward scanned content manually' })}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!manualScan.trim()}
                onClick={() => {
                  conn.sendScan(manualScan);
                  setManualScan('');
                }}
              >
                <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '回传给对方', en: 'Forward to peer' })}
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: '配对信息一次性有效；连接后保持页面打开即可反复互传文本、文件与扫码结果，无需重新配对。',
          en: 'Pairing info works once. Keep both pages open to exchange text, files and scan results without pairing again.',
        })}
      </p>
      <Badge tone="neutral" className="mx-auto block w-fit">
        <Send className="h-3 w-3" aria-hidden="true" />
        {t({ zh: 'WebRTC DataChannel · 局域网直连 · ZXing 扫码回传', en: 'WebRTC DataChannel · LAN direct · ZXing scan forward' })}
      </Badge>
    </div>
  );
}
