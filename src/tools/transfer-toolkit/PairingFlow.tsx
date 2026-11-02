import { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronDown, Pause, QrCode } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Textarea } from '@/components/ui/Textarea';
import { CopyButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { type Localized } from '@/i18n/locale';
import { buildQrSvg, createQrMatrix, QR_DEFAULT_STYLE } from '@/lib/qr';
import { cn } from '@/lib/cn';
import { isMdnsAddress, isValidIpv4, type CandidateInfo } from '@/lib/sdp';
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

/** 浏览器只给出 `<uuid>.local` 的 host 候选，组播不通时 ICE 必然失败——这里给出 IP 直连与 STUN 两条兜底。 */
function AdvancedPairing({ conn }: { conn: DropConnection }) {
  const { t } = useI18n();
  const { local, remote, states, appliedIp } = conn.diagnostics;
  const failed = conn.phase === 'closed' && remote.length > 0;
  const [open, setOpen] = useState(false);
  const ipValid = isValidIpv4(conn.peerIp);
  const ipKnown = conn.peerIp.trim().length > 0 && !ipValid;
  const remoteMdns = remote.some((candidate) => isMdnsAddress(candidate.address));

  useEffect(() => {
    if (failed) setOpen(true);
  }, [failed]);

  const line = (candidate: CandidateInfo) =>
    `${isMdnsAddress(candidate.address) ? `${candidate.address.slice(0, 6)}…local` : candidate.address}:${candidate.port} · ${candidate.type}`;

  return (
    <div className="rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-ink-2 transition-colors hover:text-ink"
      >
        {t({ zh: '连不上？局域网 IP 直连 / STUN 兜底', en: 'Can\'t connect? Direct LAN IP / STUN fallback' })}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open ? (
      <div className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs text-ink-3">
            {t({ zh: '对方设备局域网 IP', en: 'Peer LAN IP' })}
            <Input
              value={conn.peerIp}
              onChange={(event) => conn.setPeerIp(event.target.value)}
              placeholder="192.168.1.23"
              inputMode="numeric"
              autoComplete="off"
              aria-label={t({ zh: '对方设备局域网 IP', en: 'Peer device LAN IP' })}
              className="h-8 w-40 font-mono text-xs"
            />
          </label>
          {ipKnown ? (
            <p className="text-[11px] text-warn">{t({ zh: '格式应为 4 段点分十进制，例如 192.168.1.23', en: 'Expected a dotted quad such as 192.168.1.23' })}</p>
          ) : null}
          <p className="text-[11px] leading-5 text-ink-3">
            {t({
              zh: '浏览器会把本机 IP 换成一个只能用组播解析的假名（如 08e71a….local）。路由器拦组播或两台不在同一网段时，填上对方的 IP 再重新配对即可直连；两台各填对方的 IP 最稳。',
              en: 'The browser replaces the real IP with a multicast-only alias such as 08e71a….local. When the router blocks multicast, or the devices sit on different segments, enter the peer IP and pair again; filling both sides is most reliable.',
            })}
          </p>
          {remoteMdns && !appliedIp ? (
            <Badge tone="warning" className="w-fit">
              {t({ zh: '对方地址仍是未解析的 mDNS 假名', en: 'The peer address is still an unresolved mDNS alias' })}
            </Badge>
          ) : null}
          {appliedIp ? (
            <Badge tone="success" className="w-fit">
              {t({ zh: `上次配对已用 ${appliedIp} 直连`, en: `Last attempt used ${appliedIp} directly` })}
            </Badge>
          ) : null}
        </div>

        <Checkbox
          checked={conn.stunEnabled}
          onChange={conn.setStunEnabled}
          label={t({ zh: '允许 STUN 探测（跨网段兜底）', en: 'Allow STUN probing (cross-segment fallback)' })}
          description={t({
            zh: '会向公共 STUN 服务器询问本机公网地址，仅用于候选兜底；文件内容仍不经过任何服务器。同一 Wi-Fi 下不需要开启。',
            en: 'Asks a public STUN server for this device\'s external address, used only as extra candidates; file content still never passes through a server. Not needed on the same Wi-Fi.',
          })}
          className="text-xs"
        />

        {remote.length > 0 || states.length > 0 ? (
          <div className="space-y-1 border-t border-dashed border-line pt-2.5 font-mono text-[11px] leading-5 text-ink-3">
            <p>{t({ zh: '本机候选', en: 'Local candidates' })}：{local.map((c) => line(c)).join('  ·  ') || '—'}</p>
            <p>{t({ zh: '对方候选', en: 'Peer candidates' })}：{remote.map((c) => line(c)).join('  ·  ') || '—'}</p>
            <p>{t({ zh: '状态', en: 'States' })}：{states.join(' → ') || '—'}</p>
          </div>
        ) : null}

        {failed ? (
          <ul className="list-disc space-y-1 pl-4 text-[11px] leading-5 text-ink-3 marker:text-line">
            <li>{t({ zh: '最快验证：手机开热点、电脑连上去再配对——热点没有客户端隔离。', en: 'Quickest check: enable the phone hotspot, join it from the computer, then pair — hotspots have no client isolation.' })}</li>
            <li>{t({ zh: '两台设备的 IP 需在同一个网段（如都是 192.168.1.x），guest 网络通常会互相隔离。', en: 'Both IPs should sit in the same segment (e.g. both 192.168.1.x); guest networks usually isolate clients.' })}</li>
            <li>{t({ zh: '其中一台开着 VPN 时，浏览器可能只暴露虚拟网卡，先关掉再试。', en: 'With a VPN running on either side, the browser may only expose the tunnel interface — turn it off and retry.' })}</li>
          </ul>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}

/** 配对阶段（未连接时）的共享流程：互传与手机扫码页都用它建立同一条 WebRTC 通道。 */
export function PairingFlow({ conn }: { conn: DropConnection }) {
  const { t } = useI18n();
  if (conn.phase === 'connected') return null;

  return (
    <div className="space-y-3">
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

      <AdvancedPairing conn={conn} />
    </div>
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
