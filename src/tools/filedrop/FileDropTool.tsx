import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  FileText,
  Image as ImageIcon,
  MonitorSmartphone,
  PackageOpen,
  Pause,
  Play,
  QrCode,
  Send,
  Video as VideoIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Textarea } from '@/components/ui/Textarea';
import { CopyButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { formatBytes } from '@/lib/number';
import { downloadBlob, safeFilename } from '@/lib/download';
import { buildQrSvg, createQrMatrix, QR_DEFAULT_STYLE } from '@/lib/qr';
import { shouldWarnHuge } from '@/lib/filedrop';
import { useDropConnection, type TimelineFile, type TimelineItem } from './useDropConnection';
import { Scanner } from './Scanner';

function QrCard({ signal, hint }: { signal: string; hint: Localized }) {
  const { t } = useI18n();
  const svg = useMemo(() => {
    try {
      return buildQrSvg(createQrMatrix(signal, 'L'), { ...QR_DEFAULT_STYLE, size: 260 });
    } catch {
      return null;
    }
  }, [signal]);

  return (
    <div className="flex flex-col items-center gap-2">
      {svg ? (
        <div
          className="rounded-card border border-line bg-white p-2 shadow-card [&>svg]:block [&>svg]:h-[240px] [&>svg]:w-[240px]"
          dangerouslySetInnerHTML={{ __html: svg }}
          role="img"
          aria-label={t({ zh: '配对二维码', en: 'Pairing QR code' })}
        />
      ) : (
        <ToolAlert
          tone="warning"
          title={{ zh: '连接信息过长，无法生成二维码', en: 'Connection info is too long to render a QR code' }}
          hint={{ zh: '请改用下方「复制连接信息」，让对方粘贴接收', en: 'Use "Copy connection info" below and have the peer paste it' }}
        />
      )}
      <p className="text-center text-xs text-ink-3">{t(hint)}</p>
      <CopyButton text={signal} label={{ zh: '复制连接信息', en: 'Copy connection info' }} />
    </div>
  );
}

function PasteBox({ label, onSubmit }: { label: Localized; onSubmit: (text: string) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        mono
        className="text-[11px]"
        placeholder={t(label)}
        aria-label={t(label)}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          if (value.trim()) onSubmit(value.trim());
        }}
        disabled={!value.trim()}
      >
        {t({ zh: '粘贴并连接', en: 'Paste and connect' })}
      </Button>
    </div>
  );
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
  if (mime.startsWith('video/')) return <VideoIcon className="h-4 w-4" aria-hidden="true" />;
  return <FileText className="h-4 w-4" aria-hidden="true" />;
}

const STATUS_TEXT: Record<TimelineFile['status'], L10n> = {
  incoming: { zh: '待接收', en: 'Incoming' },
  waiting: { zh: '等待对方接收', en: 'Waiting for peer' },
  active: { zh: '传输中', en: 'Transferring' },
  done: { zh: '已完成', en: 'Done' },
  rejected: { zh: '被拒绝', en: 'Rejected' },
  canceled: { zh: '已取消', en: 'Canceled' },
  failed: { zh: '失败', en: 'Failed' },
};

function FileCard({
  item,
  onAccept,
  onReject,
}: {
  item: TimelineFile;
  onAccept: (item: TimelineFile) => void;
  onReject: (item: TimelineFile) => void;
}) {
  const { t } = useI18n();
  const percent = item.size ? Math.min(100, Math.round((item.received / item.size) * 100)) : 0;
  return (
    <div
      className={`max-w-[86%] rounded-card border border-line bg-surface p-3 shadow-card ${item.mine ? 'ml-auto' : ''}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 text-ink-3">{fileIcon(item.mime)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink" title={item.name}>
            {item.name}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-3">
            {formatBytes(item.size)} · {t(STATUS_TEXT[item.status])}
            {item.status === 'active' ? ` ${percent}%` : ''}
          </p>
        </div>
      </div>
      {item.status === 'active' ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      {item.status === 'incoming' ? (
        <div className="mt-2.5 flex gap-2">
          <Button variant="primary" size="sm" onClick={() => onAccept(item)}>
            <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '接收', en: 'Accept' })}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onReject(item)}>
            {t({ zh: '拒绝', en: 'Reject' })}
          </Button>
        </div>
      ) : null}
      {item.status === 'done' && item.blob ? (
        <div className="mt-2.5 space-y-2">
          {item.mime.startsWith('image/') && item.url ? (
            <img src={item.url} alt={item.name} className="max-h-56 rounded-lg border border-line object-contain" />
          ) : null}
          {item.mime.startsWith('video/') && item.url ? (
            <video src={item.url} controls className="max-h-56 w-full rounded-lg border border-line" />
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadBlob(safeFilename(item.name, 'received.bin'), item.blob as Blob)}
          >
            {t({ zh: '保存文件', en: 'Save file' })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Timeline({ items, onAccept, onReject }: { items: TimelineItem[]; onAccept: (i: TimelineFile) => void; onReject: (i: TimelineFile) => void }) {
  const { t } = useI18n();
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [items.length]);
  return (
    <div className="flex max-h-[420px] min-h-[240px] flex-col gap-3 overflow-auto px-1 py-2">
      {items.map((item) => {
        if (item.kind === 'sys') {
          return (
            <p key={item.id} className="text-center text-[11px] text-ink-3">
              {t(item.text)}
            </p>
          );
        }
        if (item.kind === 'text') {
          return (
            <div
              key={item.id}
              className={`max-w-[86%] whitespace-pre-wrap break-words rounded-card px-3.5 py-2.5 text-sm leading-6 shadow-card ${
                item.mine ? 'ml-auto bg-accent text-white' : 'border border-line bg-surface text-ink'
              }`}
            >
              {item.body}
            </div>
          );
        }
        return <FileCard key={item.id} item={item} onAccept={onAccept} onReject={onReject} />;
      })}
      <div ref={bottomRef} />
    </div>
  );
}

export default function FileDropTool() {
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

      {conn.error ? <ToolAlert tone="error" title={conn.error.message} hint={conn.error.hint} /> : null}

      {conn.phase === 'idle' ? (
        <Panel title={t({ zh: '开始配对', en: 'Start pairing' })} bodyClassName="space-y-3">
          <p className="text-sm text-ink-2">
            {t({ zh: '两台设备打开本站同一页面：手机用扫码配对；', en: 'Open this same page on both devices: phones pair by scanning; ' })}
            <strong className="font-medium text-ink">{t({ zh: '两台电脑无需摄像头', en: 'two computers need no camera' })}</strong>
            {t({ zh: '——一端「发起配对」后点「复制连接信息」发给对方，对方直接粘贴即可，回执再原路粘回。', en: ' — one side taps "Start pairing" and sends its "Copy connection info" to the peer, who just pastes it; then paste the reply back the same way.' })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void conn.startAsInitiator()}>
              <QrCode className="h-4 w-4" aria-hidden="true" />
              {t({ zh: '发起配对', en: 'Start pairing' })}
            </Button>
            <Button variant="secondary" onClick={conn.startAsJoiner}>
              <Camera className="h-4 w-4" aria-hidden="true" />
              {t({ zh: '扫码 / 粘贴加入', en: 'Scan / paste to join' })}
            </Button>
          </div>
          <div className="border-t border-dashed border-line pt-3">
            <PasteBox label={{ zh: '已收到对方的配对信息？直接粘贴到这里（DTX…），自动加入', en: 'Got the peer\'s pairing info? Paste it here (DTX…) to join automatically' }} onSubmit={(text) => void conn.consumeSignal(text)} />
          </div>
        </Panel>
      ) : null}

      {conn.phase === 'waiting-answer' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title={t({ zh: '第一步 · 把连接信息发给对方', en: 'Step 1 · Send your connection info to the peer' })} bodyClassName="p-4">
            <QrCard signal={conn.mySignal} hint={{ zh: '手机可直接扫码；电脑端点「复制连接信息」发给对方粘贴，随后等待回执', en: 'Phones can scan directly; on another computer, use "Copy connection info", then wait for the reply' }} />
          </Panel>
          <Panel title={t({ zh: '第二步 · 粘贴或扫描回执', en: 'Step 2 · Paste or scan the reply' })} bodyClassName="space-y-3">
            <Scanner active onResult={(text) => void conn.consumeSignal(text)} />
            <PasteBox label={{ zh: '没有摄像头？把对方页面「复制连接信息」的内容粘贴到这里（DTX…）', en: 'No camera? Paste the peer\'s "Copy connection info" content here (DTX…)' }} onSubmit={(text) => void conn.consumeSignal(text)} />
          </Panel>
        </div>
      ) : null}

      {conn.phase === 'scanning-offer' ? (
        <Panel title={t({ zh: '加入配对 · 扫描或粘贴发起方信息', en: 'Join pairing · scan or paste the initiator\'s info' })} bodyClassName="space-y-3">
          <Scanner active onResult={(text) => void conn.consumeSignal(text)} />
          <PasteBox label={{ zh: '或粘贴发起方的配对信息（DTX…）', en: 'Or paste the initiator\'s pairing info (DTX…)' }} onSubmit={(text) => void conn.consumeSignal(text)} />
        </Panel>
      ) : null}

      {conn.phase === 'waiting-scan' ? (
        <Panel title={t({ zh: '让发起方确认此回执', en: 'Have the initiator confirm this reply' })} bodyClassName="p-4">
          <QrCard signal={conn.mySignal} hint={{ zh: '发起方扫码即可；若两台都是电脑，点「复制连接信息」把回执粘贴给发起方', en: 'The initiator can just scan; if both are computers, use "Copy connection info" and paste the reply back' }} />
        </Panel>
      ) : null}

      {conn.phase === 'connecting' ? (
        <Panel title={t({ zh: '正在建立连接', en: 'Establishing connection' })} bodyClassName="p-4">
          <p className="text-sm text-ink-2">{t({ zh: '正在协商点对点通道，请稍候…', en: 'Negotiating the peer-to-peer channel, please wait…' })}</p>
        </Panel>
      ) : null}

      {conn.phase === 'closed' ? (
        <Panel title={t({ zh: '连接已断开', en: 'Disconnected' })} bodyClassName="space-y-3">
          <p className="text-sm text-ink-2">
            {t({ zh: '会话已结束。若传输中断，未完成的文件需要重新发送。', en: 'The session has ended. If a transfer was interrupted, unfinished files must be sent again.' })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void conn.startAsInitiator()}>
              {t({ zh: '重新发起配对', en: 'Pair again' })}
            </Button>
            <Button variant="secondary" onClick={conn.startAsJoiner}>
              {t({ zh: '扫码 / 粘贴加入', en: 'Scan / paste to join' })}
            </Button>
          </div>
        </Panel>
      ) : null}

      {connected || conn.phase === 'connecting' || conn.phase === 'waiting-scan' || conn.phase === 'closed' ? (
        conn.items.length > 0 ? (
          <Panel
            title={t({ zh: '传输会话', en: 'Transfer session' })}
            subtitle={conn.peerLabel ? t({ zh: `已连接：${conn.peerLabel}`, en: `Connected: ${conn.peerLabel}` }) : t({ zh: '等待连接…', en: 'Waiting for connection…' })}
            actions={
              <Button variant="ghost" size="sm" onClick={conn.cancelPairing}>
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '结束会话', en: 'End session' })}
              </Button>
            }
          >
            <Timeline items={conn.items} onAccept={conn.acceptIncoming} onReject={conn.rejectIncoming} />
          </Panel>
        ) : null
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
        <Play className="h-3 w-3" aria-hidden="true" />
        {t({ zh: 'WebRTC DataChannel · 局域网直连', en: 'WebRTC DataChannel · LAN direct' })}
      </Badge>
    </div>
  );
}
