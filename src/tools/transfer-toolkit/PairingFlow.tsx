import { useMemo, useState } from 'react';
import { Camera, Pause, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Textarea } from '@/components/ui/Textarea';
import { CopyButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { buildQrSvg, createQrMatrix, QR_DEFAULT_STYLE } from '@/lib/qr';
import { Scanner } from './Scanner';
import type { DropConnection } from './useDropConnection';

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

/** 配对阶段（未连接时）的共享流程：互传与手机扫码页都用它建立同一条 WebRTC 通道。 */
export function PairingFlow({ conn }: { conn: DropConnection }) {
  const { t } = useI18n();
  if (conn.phase === 'connected') return null;

  return (
    <>
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
    </>
  );
}

export function EndSessionButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      <Pause className="h-3.5 w-3.5" aria-hidden="true" />
      {t({ zh: '结束会话', en: 'End session' })}
    </Button>
  );
}
