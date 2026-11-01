import { useRef, useState } from 'react';
import { MonitorSmartphone, Send } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Textarea } from '@/components/ui/Textarea';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { shouldWarnHuge } from '@/lib/filedrop';
import { useDropConnection } from './useDropConnection';
import { EndSessionButton, PairingFlow } from './PairingFlow';
import { Timeline } from './Timeline';

export default function DropPanel() {
  const { t } = useI18n();
  const conn = useDropConnection();
  const [pendingHuge, setPendingHuge] = useState<File | null>(null);
  const [composer, setComposer] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="space-y-4">
      <ToolAlert
        tone="info"
        title={{ zh: '两台设备连接同一 Wi-Fi，数据点对点直传', en: 'Connect both devices to the same Wi-Fi; data goes peer-to-peer' }}
        hint={{ zh: '文件不经过任何服务器，关闭页面后连接即失效。', en: 'Files never pass through a server. Closing the page ends the connection.' }}
      />

      <PairingFlow conn={conn} />

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
        </Panel>
      ) : null}

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '配对信息一次性有效；连接后保持页面打开即可多次互传，无需重新配对。', en: 'Pairing info works once. Keep both pages open to transfer multiple times without re-pairing.' })}
      </p>
      <Badge tone="neutral" className="mx-auto block w-fit">
        <Send className="h-3 w-3" aria-hidden="true" />
        {t({ zh: 'WebRTC DataChannel · 局域网直连', en: 'WebRTC DataChannel · LAN direct' })}
      </Badge>
    </div>
  );
}
