import { useCallback, useEffect, useRef, useState } from 'react';
import { UAParser } from 'ua-parser-js';
import {
  ChunkAssembler,
  encodeControl,
  parseControl,
  sliceFile,
  type ControlFrame,
} from '@/lib/filedrop';
import {
  compactSdp,
  decodeSignal,
  encodeSignal,
  hasMdnsCandidate,
  isValidIpv4,
  parseCandidates,
  replaceMdnsAddresses,
  STUN_SERVERS,
  type CandidateInfo,
  type SignalEnvelope,
} from '@/lib/sdp';
import { toToolError, ToolError } from '@/lib/errors';
import { buildJoinUrl, makePairCode, openLanSocket, resolveLanBase } from '@/lib/lanSignal';
import { useI18n } from '@/i18n/I18nProvider';
import { tl, type Locale, type Localized } from '@/i18n/locale';

export type Phase =
  | 'idle'
  | 'waiting-answer'
  | 'waiting-phone'
  | 'scanning-offer'
  | 'waiting-scan'
  | 'connecting'
  | 'connected'
  | 'closed';

export type FileStatus =
  | 'incoming'
  | 'waiting'
  | 'active'
  | 'done'
  | 'rejected'
  | 'canceled'
  | 'failed';

export interface TimelineText {
  kind: 'text';
  id: string;
  mine: boolean;
  body: string;
  ts: number;
}

/** 手机扫码器回传的二维码内容。 */
export interface TimelineScan {
  kind: 'scan';
  id: string;
  mine: boolean;
  body: string;
  ts: number;
}

export interface TimelineFile {
  kind: 'file';
  id: string;
  mine: boolean;
  name: string;
  size: number;
  mime: string;
  status: FileStatus;
  received: number;
  blob?: Blob;
  url?: string;
}

export interface TimelineSys {
  kind: 'sys';
  id: string;
  text: Localized;
}

export type TimelineItem = TimelineText | TimelineScan | TimelineFile | TimelineSys;

const SEND_BUFFER_HIGH = 256 * 1024;
const SEND_BUFFER_LOW = 64 * 1024;
const GATHER_TIMEOUT_MS = 2500;
// STUN 要走一次公网查询，候选到齐更慢
const GATHER_TIMEOUT_STUN_MS = 6000;

export interface ConnectionDiagnostics {
  local: CandidateInfo[];
  remote: CandidateInfo[];
  states: string[];
  /** 上一次配对用掉的 IP 覆盖值，用于失败后判断是否已经试过直连。 */
  appliedIp: string;
}

const EMPTY_DIAGNOSTICS: ConnectionDiagnostics = {
  local: [],
  remote: [],
  states: [],
  appliedIp: '',
};

let seq = 0;
const nextId = () => `t${Date.now().toString(36)}-${(seq += 1)}`;

function agentLabel(locale: Locale): string {
  const result = new UAParser().getResult();
  const browser = [result.browser.name, result.browser.version?.split('.')[0]].filter(Boolean).join(' ');
  const os = [result.os.name, result.os.version].filter(Boolean).join(' ');
  const unknownBrowser = locale === 'zh' ? '未知浏览器' : 'Unknown browser';
  const unknownOs = locale === 'zh' ? '未知系统' : 'Unknown OS';
  return [browser || unknownBrowser, os || unknownOs].join(' · ');
}

export function useDropConnection() {
  const { locale } = useI18n();
  const [phase, setPhase] = useState<Phase>('idle');
  const [mySignal, setMySignal] = useState('');
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [peerLabel, setPeerLabel] = useState('');
  const [error, setError] = useState<{ message: Localized; hint?: Localized } | null>(null);
  const [peerIp, setPeerIp] = useState('');
  const [stunEnabled, setStunEnabled] = useState(false);
  const [pairingMode, setPairingMode] = useState<'lan' | 'manual'>('lan');
  const [pairingNotice, setPairingNotice] = useState<Localized>('');
  const [diagnostics, setDiagnostics] = useState<ConnectionDiagnostics>(EMPTY_DIAGNOSTICS);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const signalRef = useRef<WebSocket | null>(null);
  const roleRef = useRef<'initiator' | 'joiner' | null>(null);
  const peerIpRef = useRef('');
  const stunRef = useRef(false);
  const activeSendRef = useRef<{ id: string; file: File } | null>(null);
  const sendQueueRef = useRef<{ id: string; file: File }[]>([]);
  const activeReceiveRef = useRef<{ id: string; assembler: ChunkAssembler } | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const revokeObjectUrls = useCallback(() => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
  }, []);

  const patchFile = useCallback(
    (id: string, patch: Partial<TimelineFile>) =>
      setItems((prev) =>
        prev.map((item) => (item.kind === 'file' && item.id === id ? { ...item, ...patch } : item)),
      ),
    [],
  );

  const addSys = useCallback(
    (text: Localized) => setItems((prev) => [...prev, { kind: 'sys', id: nextId(), text }]),
    [],
  );

  const pumpQueue = useCallback(() => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open' || activeSendRef.current) return;
    const next = sendQueueRef.current.shift();
    if (!next) return;
    activeSendRef.current = next;
    const frame: ControlFrame = {
      t: 'meta',
      id: next.id,
      name: next.file.name,
      size: next.file.size,
      mime: next.file.type || 'application/octet-stream',
    };
    dc.send(encodeControl(frame));
  }, []);

  const streamActiveFile = useCallback(async () => {
    const dc = dcRef.current;
    const active = activeSendRef.current;
    if (!dc || !active) return;
    let sent = 0;
    try {
      dc.bufferedAmountLowThreshold = SEND_BUFFER_LOW;
      for await (const chunk of sliceFile(active.file)) {
        if (dcRef.current !== dc || dc.readyState !== 'open') throw new Error('连接已断开');
        if (dc.bufferedAmount > SEND_BUFFER_HIGH) {
          await new Promise<void>((resolve) => {
            dc.addEventListener('bufferedamountlow', () => resolve(), { once: true });
          });
        }
        dc.send(chunk);
        sent += chunk.byteLength;
        patchFile(active.id, { received: sent });
      }
      dc.send(encodeControl({ t: 'done', id: active.id }));
      patchFile(active.id, { status: 'done', received: active.file.size });
      addSys({ zh: `已发送「${active.file.name}」`, en: `Sent "${active.file.name}"` });
    } catch {
      patchFile(active.id, { status: 'failed' });
      if (dcRef.current === dc) addSys({ zh: `「${active.file.name}」发送中断，请重新发送`, en: `Sending "${active.file.name}" was interrupted. Send it again.` });
    } finally {
      if (activeSendRef.current?.id === active.id) {
        activeSendRef.current = null;
        pumpQueue();
      }
    }
  }, [addSys, patchFile, pumpQueue]);

  const handleControl = useCallback(
    (frame: ControlFrame) => {
      switch (frame.t) {
        case 'hello':
          setPeerLabel(frame.agent);
          break;
        case 'text':
        case 'scan':
          setItems((prev) => [
            ...prev,
            { kind: frame.t, id: frame.id, mine: false, body: frame.body, ts: frame.ts },
          ]);
          break;
        case 'meta':
          setItems((prev) => [
            ...prev,
            {
              kind: 'file',
              id: frame.id,
              mine: false,
              name: frame.name,
              size: frame.size,
              mime: frame.mime,
              status: 'incoming',
              received: 0,
            },
          ]);
          break;
        case 'accept':
          if (activeSendRef.current?.id === frame.id) void streamActiveFile();
          break;
        case 'reject':
          if (activeSendRef.current?.id === frame.id) {
            patchFile(frame.id, { status: 'rejected' });
            activeSendRef.current = null;
            addSys({ zh: '对方取消了接收', en: 'The peer canceled the transfer' });
            pumpQueue();
          }
          break;
        case 'done': {
          const receiving = activeReceiveRef.current;
          if (receiving && receiving.id === frame.id) {
            const blob = receiving.assembler.finish();
            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.add(url);
            patchFile(frame.id, { status: 'done', blob, url, received: blob.size });
            activeReceiveRef.current = null;
            addSys({ zh: '接收完成', en: 'Received' });
          }
          break;
        }
        case 'cancel':
          if (activeReceiveRef.current?.id === frame.id) {
            activeReceiveRef.current.assembler.dispose();
            activeReceiveRef.current = null;
            patchFile(frame.id, { status: 'canceled' });
          }
          break;
        case 'begin':
          break;
      }
    },
    [addSys, patchFile, pumpQueue, streamActiveFile],
  );

  const closeSignaling = useCallback(() => {
    const socket = signalRef.current;
    signalRef.current = null;
    if (socket) {
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
  }, []);

  const teardown = useCallback(
    (note?: Localized) => {
      closeSignaling();
      dcRef.current?.close();
      dcRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
      roleRef.current = null;
      activeSendRef.current = null;
      sendQueueRef.current = [];
      activeReceiveRef.current = null;
      setMySignal('');
      setPhase('closed');
      if (note) addSys(note);
    },
    [addSys],
  );

  const bindChannel = useCallback(
    (channel: RTCDataChannel) => {
      dcRef.current = channel;
      channel.binaryType = 'arraybuffer';
      channel.onopen = () => {
        closeSignaling();
        setPhase('connected');
        channel.send(encodeControl({ t: 'hello', agent: agentLabel(locale) }));
        addSys({ zh: '连接已建立，可以互传内容', en: 'Connected. You can exchange content now.' });
        pumpQueue();
      };
      channel.onclose = () => teardown({ zh: '连接已关闭', en: 'Connection closed' });
      channel.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          try {
            handleControl(parseControl(event.data));
          } catch (caught) {
            addSys(toToolError(caught).localized);
          }
          return;
        }
        const receiving = activeReceiveRef.current;
        if (receiving) {
          receiving.assembler.push(event.data as ArrayBuffer);
          patchFile(receiving.id, { received: receiving.assembler.received });
        }
      };
    },
    [addSys, closeSignaling, handleControl, locale, patchFile, pumpQueue, teardown],
  );

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: stunRef.current ? STUN_SERVERS.map((urls) => ({ urls })) : [],
    });
    const note = () =>
      setDiagnostics((current) => ({
        ...current,
        states: [...current.states, `${pc.connectionState}/${pc.iceConnectionState}`].slice(-8),
      }));
    pc.oniceconnectionstatechange = note;
    pc.onconnectionstatechange = () => {
      note();
      if (pc.connectionState === 'failed' && pcRef.current === pc) {
        teardown({ zh: '连接失败：请确保两台设备在同一 Wi-Fi 后重新配对', en: 'Connection failed: make sure both devices are on the same Wi-Fi, then pair again' });
        setError({
          message: {
            zh: '点对点通道没建立：浏览器的局域网地址解析失败',
            en: 'The peer-to-peer channel did not open: the browser could not resolve the LAN address',
          },
          hint: {
            zh: '展开下方「连不上？」：填对方设备的局域网 IP 后重新配对，或开启 STUN 兜底。',
            en: 'Open "Can\'t connect?" below: enter the peer device\'s LAN IP and pair again, or enable the STUN fallback.',
          },
        });
      }
    };
    pcRef.current = pc;
    return pc;
  }, [teardown, closeSignaling]);

  const gatherLocal = useCallback(async (pc: RTCPeerConnection): Promise<SignalEnvelope> => {
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const timer = window.setTimeout(resolve, stunRef.current ? GATHER_TIMEOUT_STUN_MS : GATHER_TIMEOUT_MS);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          window.clearTimeout(timer);
          resolve();
        }
      });
    });
    const local = pc.localDescription;
    if (!local || (local.type !== 'offer' && local.type !== 'answer')) {
      throw new ToolError({ zh: '本地连接信息未就绪，请重试', en: 'Local connection info is not ready. Try again.' });
    }
    setDiagnostics((current) => ({ ...current, local: parseCandidates(local.sdp) }));
    return { type: local.type, sdp: compactSdp(local.sdp, stunRef.current) };
  }, []);

  const startManualPairing = useCallback(async () => {
    closeSignaling();
    setError(null);
    setPairingMode('manual');
    setDiagnostics((current) => ({ ...current, states: [] }));
    try {
      const pc = createPeer();
      roleRef.current = 'initiator';
      bindChannel(pc.createDataChannel('filedrop'));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      setMySignal(await encodeSignal(await gatherLocal(pc)));
      setPhase('waiting-answer');
    } catch (caught) {
      const loc = toToolError(caught).localized;
      setError({ message: { zh: `生成配对信息失败：${tl(loc, 'zh')}`, en: `Failed to create pairing info: ${tl(loc, 'en')}` } });
      teardown();
    }
  }, [bindChannel, closeSignaling, createPeer, gatherLocal, teardown]);

  const startAsInitiator = useCallback(async () => {
    setError(null);
    setPairingNotice('');
    setPairingMode('lan');
    setPhase('connecting');
    setDiagnostics((current) => ({ ...current, states: [] }));
    try {
      const base = await resolveLanBase();
      const socket = await openLanSocket(base);
      closeSignaling();
      signalRef.current = socket;
      const room = makePairCode();
      socket.send(JSON.stringify({ type: 'create', room }));
      setMySignal(buildJoinUrl(base, room));
      setPhase('waiting-phone');

      const pc = createPeer();
      roleRef.current = 'initiator';
      bindChannel(pc.createDataChannel('filedrop'));
      socket.onmessage = (event) => {
        void (async () => {
          const message = JSON.parse(String(event.data)) as { type?: string; payload?: string; reason?: string };
          if (message.type === 'peer-joined') {
            setPairingNotice({ zh: '手机已打开配对链接，正在自动建立连接…', en: 'The phone opened the pairing link. Connecting automatically…' });
          }
          if (message.type === 'signal' && message.payload) {
            const decoded = await decodeSignal(message.payload);
            const override = peerIpRef.current.trim();
            const usableOverride = isValidIpv4(override) && hasMdnsCandidate(decoded.sdp);
            const remote = usableOverride ? { ...decoded, sdp: replaceMdnsAddresses(decoded.sdp, override) } : decoded;
            setDiagnostics((current) => ({ ...current, remote: parseCandidates(remote.sdp), appliedIp: usableOverride ? override : '' }));
            await pc.setRemoteDescription(remote);
            setPhase('connecting');
          }
          if (message.type === 'error' || message.type === 'closed') {
            throw new ToolError({ zh: '手机配对已中断，请重新发起', en: 'Phone pairing was interrupted. Start again.' });
          }
        })().catch((caught) => {
          if (signalRef.current === socket) {
            setError({ message: toToolError(caught).localized });
            teardown();
          }
        });
      };
      socket.onclose = () => {
        if (signalRef.current === socket && dcRef.current?.readyState !== 'open') {
          setError({ message: { zh: '内网配对通道已断开，请重新发起', en: 'The LAN pairing channel closed. Start again.' } });
          teardown();
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const signal = await encodeSignal(await gatherLocal(pc));
      socket.send(JSON.stringify({ type: 'signal', payload: signal }));
    } catch {
      // 静态托管没有 WebSocket 信令：保留原来的双向 SDP 配对，不让功能直接不可用。
      setPairingNotice({
        zh: '当前部署未启用内网信令，已切换为离线配对。使用 npm run start:lan 部署可实现只扫一次。',
        en: 'LAN signaling is not enabled on this deployment, so offline pairing is used. Deploy with npm run start:lan for one-scan pairing.',
      });
      await startManualPairing();
    }
  }, [bindChannel, closeSignaling, createPeer, gatherLocal, startManualPairing, teardown]);

  const joinViaLink = useCallback(async (room: string) => {
    setError(null);
    setPairingNotice('');
    setPairingMode('lan');
    setPhase('connecting');
    try {
      const base = new URL(window.location.href).origin;
      const socket = await openLanSocket(base);
      closeSignaling();
      signalRef.current = socket;
      const pc = createPeer();
      roleRef.current = 'joiner';
      pc.ondatachannel = (event) => bindChannel(event.channel);
      socket.onmessage = (event) => {
        void (async () => {
          const message = JSON.parse(String(event.data)) as { type?: string; payload?: string };
          if (message.type === 'signal' && message.payload) {
            const decoded = await decodeSignal(message.payload);
            const override = peerIpRef.current.trim();
            const usableOverride = isValidIpv4(override) && hasMdnsCandidate(decoded.sdp);
            const remote = usableOverride ? { ...decoded, sdp: replaceMdnsAddresses(decoded.sdp, override) } : decoded;
            setDiagnostics((current) => ({ ...current, remote: parseCandidates(remote.sdp), appliedIp: usableOverride ? override : '' }));
            await pc.setRemoteDescription(remote);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            const signal = await encodeSignal(await gatherLocal(pc));
            socket.send(JSON.stringify({ type: 'signal', payload: signal }));
            return;
          }
          if (message.type === 'error' || message.type === 'closed') {
            throw new ToolError(
              { zh: '配对链接无效或已过期', en: 'This pairing link is invalid or expired' },
              { zh: '请让电脑重新发起配对，再扫新的二维码。', en: 'Ask the computer to start pairing again, then scan the new QR code.' },
            );
          }
        })().catch((caught) => {
          if (signalRef.current === socket) {
            setError({ message: toToolError(caught).localized });
            teardown();
          }
        });
      };
      socket.onclose = () => {
        if (signalRef.current === socket && dcRef.current?.readyState !== 'open') {
          setError({ message: { zh: '内网配对通道已断开', en: 'The LAN pairing channel closed' } });
          teardown();
        }
      };
      socket.send(JSON.stringify({ type: 'join', room }));
    } catch (caught) {
      setError({
        message: toToolError(caught).localized,
        hint: { zh: '请确认手机与电脑在同一局域网，并让电脑重新生成配对二维码。', en: 'Make sure the phone and computer share a LAN, then ask the computer to generate a new pairing QR.' },
      });
      teardown();
    }
  }, [bindChannel, closeSignaling, createPeer, gatherLocal, teardown]);

  const consumeSignal = useCallback(
    async (text: string) => {
      setError(null);
      try {
        const envelope = await decodeSignal(text);
        // 浏览器把对方局域网 IP 藏成了 <uuid>.local；组播解析不通时，用填好的 IP 原地替换。
        const override = peerIpRef.current.trim();
        const usableOverride = isValidIpv4(override) && hasMdnsCandidate(envelope.sdp);
        const remote: SignalEnvelope = usableOverride
          ? { ...envelope, sdp: replaceMdnsAddresses(envelope.sdp, override) }
          : envelope;
        setDiagnostics((current) => ({
          ...current,
          remote: parseCandidates(remote.sdp),
          appliedIp: usableOverride ? override : '',
        }));
        let pc = pcRef.current;
        if (!pc) {
          if (remote.type !== 'offer') {
            throw new ToolError({ zh: '请在本页先点击「发起配对」生成连接信息，再粘贴对方的回执', en: 'Tap "Start pairing" on this page first to generate connection info, then paste the peer\'s reply' });
          }
          pc = createPeer();
          roleRef.current = 'joiner';
        }
        const expect = roleRef.current === 'initiator' ? 'answer' : 'offer';
        if (remote.type !== expect) {
          throw new ToolError({ zh: `当前需要对方的 ${expect} 信息，粘贴的是 ${remote.type}`, en: `Expecting the peer's ${expect}, but pasted ${remote.type}` });
        }
        if (roleRef.current === 'initiator') {
          await pc.setRemoteDescription(remote);
          setPhase('connecting');
          return;
        }
        pc.ondatachannel = (event) => bindChannel(event.channel);
        await pc.setRemoteDescription(remote);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        setMySignal(await encodeSignal(await gatherLocal(pc)));
        setPhase('waiting-scan');
      } catch (caught) {
        setError({ message: toToolError(caught).localized });
      }
    },
    [bindChannel, createPeer, gatherLocal],
  );

  const startAsJoiner = useCallback(() => {
    closeSignaling();
    setError(null);
    setPairingMode('manual');
    setDiagnostics((current) => ({ ...current, states: [] }));
    createPeer();
    roleRef.current = 'joiner';
    setPhase('scanning-offer');
  }, [closeSignaling, createPeer]);

  // 回调里要读到最新值，不能被 render 闭包冻住
  const updatePeerIp = useCallback((value: string) => {
    peerIpRef.current = value;
    setPeerIp(value);
  }, []);

  const updateStunEnabled = useCallback((value: boolean) => {
    stunRef.current = value;
    setStunEnabled(value);
  }, []);

  const cancelPairing = useCallback(() => {
    teardown();
    revokeObjectUrls();
    setPhase('idle');
    setItems([]);
    setPeerLabel('');
    setPairingNotice('');
    setError(null);
  }, [teardown, revokeObjectUrls]);

  const sendText = useCallback((body: string) => {
    const dc = dcRef.current;
    const trimmed = body.trim();
    if (!dc || dc.readyState !== 'open' || !trimmed) return;
    const frame: ControlFrame = { t: 'text', id: nextId(), body: trimmed, ts: Date.now() };
    dc.send(encodeControl(frame));
    setItems((prev) => [
      ...prev,
      { kind: 'text', id: frame.id, mine: true, body: frame.body, ts: frame.ts },
    ]);
  }, []);

  /** 扫码器回传：与 sendText 同一条通道，但对方以「扫码结果」样式展示。 */
  const sendScan = useCallback((body: string) => {
    const dc = dcRef.current;
    // 只拒绝全空白内容，保留二维码里的首尾空格与换行，回传文本与扫描结果逐字一致。
    if (!dc || dc.readyState !== 'open' || !body.trim()) return;
    const frame: ControlFrame = { t: 'scan', id: nextId(), body, ts: Date.now() };
    dc.send(encodeControl(frame));
    setItems((prev) => [
      ...prev,
      { kind: 'scan', id: frame.id, mine: true, body: frame.body, ts: frame.ts },
    ]);
  }, []);

  const sendFile = useCallback(
    (file: File) => {
      const id = nextId();
      sendQueueRef.current.push({ id, file });
      setItems((prev) => [
        ...prev,
        {
          kind: 'file',
          id,
          mine: true,
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          status: 'waiting',
          received: 0,
        },
      ]);
      pumpQueue();
    },
    [pumpQueue],
  );

  const acceptIncoming = useCallback(
    (item: TimelineFile) => {
      const dc = dcRef.current;
      if (!dc || dc.readyState !== 'open' || activeReceiveRef.current) return;
      activeReceiveRef.current = { id: item.id, assembler: new ChunkAssembler() };
      dc.send(encodeControl({ t: 'accept', id: item.id }));
      patchFile(item.id, { status: 'active' });
    },
    [patchFile],
  );

  const rejectIncoming = useCallback(
    (item: TimelineFile) => {
      const dc = dcRef.current;
      if (!dc || dc.readyState !== 'open') return;
      dc.send(encodeControl({ t: 'reject', id: item.id }));
      patchFile(item.id, { status: 'canceled' });
    },
    [patchFile],
  );

  useEffect(() => {
    return () => {
      closeSignaling();
      dcRef.current?.close();
      dcRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
      roleRef.current = null;
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current.clear();
    };
  }, [closeSignaling]);

  return {
    phase,
    mySignal,
    items,
    peerLabel,
    error,
    peerIp,
    stunEnabled,
    pairingMode,
    pairingNotice,
    diagnostics,
    setPeerIp: updatePeerIp,
    setStunEnabled: updateStunEnabled,
    startAsInitiator,
    startManualPairing,
    startAsJoiner,
    joinViaLink,
    consumeSignal,
    cancelPairing,
    sendText,
    sendScan,
    sendFile,
    acceptIncoming,
    rejectIncoming,
  };
}

export type DropConnection = ReturnType<typeof useDropConnection>;
