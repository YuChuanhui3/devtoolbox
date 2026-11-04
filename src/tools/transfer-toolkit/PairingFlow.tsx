import { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronDown, Keyboard, Pause, QrCode } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Textarea } from '@/components/ui/Textarea';
import { CopyButton } from '@/components/tool/ToolActions';
import { QrZoomFrame } from '@/components/tool/QrZoomFrame';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { type Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { getSignalBase, setSignalBase } from '@/lib/lanSignal';
import { formatBytes } from '@/lib/number';
import { buildQrSvg, createQrMatrix, QR_DEFAULT_STYLE } from '@/lib/qr';
import { cn } from '@/lib/cn';
import { isMdnsAddress, isValidIpv4, type CandidateInfo } from '@/lib/sdp';
import { Scanner } from './Scanner';
import type { DropConnection } from './useDropConnection';

/**
 * 行内配对码的显示宽度（沿用原布局的 240px 方框）。DTX2 压缩后仍有 449–521B，
 * 也就是 V14–V16、73–81 模块，240px 上只有 2.7–3.0px/模块，低于可扫下限——
 * 所以配对码必须留着「放大」这条路，而不是把 SVG 的像素尺寸调大（那不影响上屏宽度）。
 */
const PAIR_QR_INLINE_PX = 240;

function QrCard({ signal, hint, copyLabel = { zh: '复制连接信息', en: 'Copy connection info' } }: { signal: string; hint: Localized; copyLabel?: Localized }) {
  const { t } = useI18n();
  const qr = useMemo(() => {
    try {
      const matrix = createQrMatrix(signal, 'L');
      return { svg: buildQrSvg(matrix, { ...QR_DEFAULT_STYLE, size: PAIR_QR_INLINE_PX }), moduleCount: matrix.moduleCount };
    } catch {
      return null;
    }
  }, [signal]);

  return (
    <div className="flex flex-col items-center gap-2">
      {qr ? (
        <QrZoomFrame
          svg={qr.svg}
          moduleCount={qr.moduleCount}
          inlineWidth={PAIR_QR_INLINE_PX}
          remedy={{ zh: '改用「复制连接信息」让对方粘贴。', en: 'or copy the connection info for the peer to paste.' }}
        />
      ) : (
        <ToolAlert
          tone="warning"
          title={{ zh: '连接信息过长，无法生成二维码', en: 'Connection info is too long to render a QR code' }}
          hint={{ zh: '请改用下方「复制连接信息」，让对方粘贴接收', en: 'Use "Copy connection info" below and have the peer paste it' }}
        />
      )}
      <p className="text-center text-xs text-ink-3">{t(hint)}</p>
      <CopyButton text={signal} label={copyLabel} />
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

/** 取件码依赖信令服务；这里可把信令指向自建/中继地址（如 Cloudflare relay），失败时再用折叠的离线 DTX 配对。 */
function OfflinePairing({ conn }: { conn: DropConnection }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [signalInput, setSignalInput] = useState(() => getSignalBase());
  const [signalError, setSignalError] = useState<Localized | null>(null);
  useEffect(() => {
    if (conn.pairingMode === 'manual') setOpen(true);
  }, [conn.pairingMode]);

  const saveSignalBase = () => {
    try {
      setSignalBase(signalInput);
      setSignalError(null);
    } catch (caught) {
      setSignalError(toToolError(caught).localized);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-ink-2 transition-colors hover:text-ink"
      >
        {t({ zh: '高级 · 信令地址 / 离线配对', en: 'Advanced · Signaling address / offline pairing' })}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-ink-3">
              {t({ zh: '信令地址', en: 'Signaling URL' })}
              <Input
                value={signalInput}
                onChange={(event) => setSignalInput(event.target.value)}
                placeholder="https://lan-relay.example.workers.dev"
                autoComplete="off"
                aria-label={t({ zh: '信令地址', en: 'Signaling URL' })}
                className="h-8 min-w-0 flex-1 font-mono text-xs"
              />
              <Button variant="secondary" size="sm" onClick={saveSignalBase}>
                {t({ zh: '保存', en: 'Save' })}
              </Button>
            </label>
            {signalError ? <p className="text-[11px] text-danger">{t(signalError)}</p> : null}
            <p className="text-[11px] leading-5 text-ink-3">
              {t({
                zh: '留空 = 跟随本页地址（npm run start:lan 的局域网用法）；填写后取件码走该中继信令配对，文件仍点对点。HTTPS 页面只能连 wss/https 地址。',
                en: 'Empty = same origin as this page (the npm run start:lan LAN setup). Any URL here routes pickup-code signaling through that relay; files still go peer-to-peer. HTTPS pages can only reach wss/https relays.',
              })}
            </p>
          </div>
          <p className="text-[11px] leading-5 text-ink-3">
            {t({
              zh: '离线配对：没有信令服务时，一方发起、把连接信息交给对方，对方回传回执后建立连接（DTX 扫码 / 粘贴）。',
              en: 'Offline pairing: with no signaling server, one side starts, hands its connection info over, and the peer replies (DTX scan / paste).',
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void conn.startManualPairing()}>
              {t({ zh: '发起离线配对', en: 'Start offline pairing' })}
            </Button>
            <Button variant="secondary" size="sm" onClick={conn.startAsJoiner}>
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              {t({ zh: '扫码 / 粘贴加入', en: 'Scan / paste to join' })}
            </Button>
          </div>
          <PasteBox label={{ zh: '已收到对方的配对信息？直接粘贴到这里（DTX…），自动加入', en: 'Got the peer\'s pairing info? Paste it here (DTX…) to join automatically' }} onSubmit={(text) => void conn.consumeSignal(text)} />
        </div>
      ) : null}
    </div>
  );
}

/** 配对阶段（未连接时）的共享流程：互传与手机扫码页都用它建立同一条 WebRTC 通道。 */
export function PairingFlow({ conn }: { conn: DropConnection }) {
  const { t } = useI18n();
  const [codeInput, setCodeInput] = useState('');
  const [passInput, setPassInput] = useState('');
  useEffect(() => {
    if (conn.phase === 'entering-code') {
      setCodeInput('');
      setPassInput('');
    }
  }, [conn.phase]);
  if (conn.phase === 'connected') return null;

  return (
    <div className="space-y-3">
      {conn.error ? <ToolAlert tone="error" title={conn.error.message} hint={conn.error.hint} /> : null}
      {conn.pairingNotice ? <ToolAlert tone="info" title={conn.pairingNotice} /> : null}

      {conn.phase === 'idle' ? (
        <Panel title={t({ zh: '开始配对', en: 'Start pairing' })} bodyClassName="space-y-3">
          <p className="text-sm text-ink-2">
            {t({
              zh: '一方生成 6 位取件码，另一方输入取件码或扫码接入；没有内网信令服务时会明确报错，可在下方「高级 · 离线配对」手动配对。',
              en: 'One side generates a 6-digit pickup code; the other joins by typing it or scanning. Without LAN signaling the button reports the reason instead — pair manually under "Advanced · Offline pairing" below.',
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void conn.startAsInitiator()}>
              <QrCode className="h-4 w-4" aria-hidden="true" />
              {t({ zh: '生成取件码', en: 'Get a pickup code' })}
            </Button>
            <Button variant="secondary" onClick={conn.startCodeJoin}>
              <Keyboard className="h-4 w-4" aria-hidden="true" />
              {t({ zh: '输入取件码', en: 'Enter a pickup code' })}
            </Button>
          </div>
        </Panel>
      ) : null}

      {conn.phase === 'entering-code' ? (
        <Panel
          title={t({ zh: '输入对方的取件码', en: 'Enter the peer\'s pickup code' })}
          subtitle={t({ zh: '取件码 6 位数字 + 口令 4 位字符，都显示在对方屏幕上', en: 'The 6-digit code and 4-character passphrase are both shown on the peer\'s screen' })}
          bodyClassName="space-y-3"
        >
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void conn.joinByCode(codeInput, passInput);
            }}
          >
            <Input
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="123456"
              aria-label={t({ zh: '取件码', en: 'Pickup code' })}
              className="h-11 w-40 text-center font-mono text-xl tracking-[0.18em]"
            />
            <Input
              value={passInput}
              onChange={(event) => setPassInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
              autoComplete="off"
              placeholder="口令"
              aria-label={t({ zh: '房间口令', en: 'Room passphrase' })}
              className="h-11 w-28 text-center font-mono text-xl tracking-[0.18em]"
            />
            <Button variant="primary" type="submit" disabled={codeInput.length !== 6 || passInput.length !== 4}>
              {t({ zh: '接入', en: 'Join' })}
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={conn.cancelPairing}>
              {t({ zh: '取消', en: 'Cancel' })}
            </Button>
          </form>
          <p className="text-[11px] text-ink-3">
            {t({
              zh: '两台设备需打开同一个局域网服务；手机也可以直接扫对方的二维码。',
              en: 'Both devices should open the same LAN service; phones can just scan the peer\'s QR code.',
            })}
          </p>
        </Panel>
      ) : null}

      {conn.phase === 'waiting-phone' ? (
        <Panel
          title={t({ zh: '等待对方接入', en: 'Waiting for the peer' })}
          subtitle={t({ zh: '对方输入下面的取件码 + 口令，或扫码打开链接，均可自动建立连接', en: 'The peer can type the code + passphrase below, or scan the QR, to connect automatically' })}
          bodyClassName="p-4"
        >
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-[11px] text-ink-3">{t({ zh: '取件码', en: 'Pickup code' })}</p>
              <p className="font-mono text-5xl font-semibold tracking-[0.22em] text-ink">{conn.roomCode}</p>
              <p className="mt-1 text-[11px] text-ink-3">{t({ zh: '房间口令', en: 'Room passphrase' })}</p>
              <p className="font-mono text-2xl font-semibold tracking-[0.3em] text-ink">{conn.roomPass}</p>
              <CopyButton text={`${conn.roomCode} ${conn.roomPass}`} label={{ zh: '复制取件码和口令', en: 'Copy code & passphrase' }} />
            </div>
            {conn.pendingBatch ? (
              <Badge tone="accent" className="mx-auto block w-fit">
                {t({
                  zh: `已暂存 ${conn.pendingBatch.count} 项 · ${formatBytes(conn.pendingBatch.totalSize)}，连上后自动送达`,
                  en: `${conn.pendingBatch.count} item(s) staged · ${formatBytes(conn.pendingBatch.totalSize)}, delivered automatically on connect`,
                })}
              </Badge>
            ) : null}
            <QrCard
              signal={conn.mySignal}
              hint={{ zh: '手机扫码免输入；两台电脑则把取件码和口令念给对方输入', en: 'Phones can scan instead of typing; on two computers just read out the code and passphrase' }}
              copyLabel={{ zh: '复制配对链接', en: 'Copy pairing link' }}
            />
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="ghost" size="sm" onClick={conn.cancelPairing}>
                {t({ zh: '取消', en: 'Cancel' })}
              </Button>
            </div>
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
              {t({ zh: '重新生成取件码', en: 'New pickup code' })}
            </Button>
            <Button variant="secondary" onClick={conn.startCodeJoin}>
              <Keyboard className="h-4 w-4" aria-hidden="true" />
              {t({ zh: '输入取件码', en: 'Enter a pickup code' })}
            </Button>
          </div>
        </Panel>
      ) : null}

      <OfflinePairing conn={conn} />
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
