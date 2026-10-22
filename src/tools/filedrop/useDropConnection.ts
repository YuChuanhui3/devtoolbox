import { useCallback, useEffect, useRef, useState } from 'react';
import { UAParser } from 'ua-parser-js';
import {
  ChunkAssembler,
  encodeControl,
  parseControl,
  sliceFile,
  type ControlFrame,
} from '@/lib/filedrop';
import { compactSdp, decodeSignal, encodeSignal, type SignalEnvelope } from '@/lib/sdp';
import { toToolError, ToolError } from '@/lib/errors';
import { useI18n } from '@/i18n/I18nProvider';
import { tl, type Locale, type Localized } from '@/i18n/locale';

export type Phase =
  | 'idle'
  | 'waiting-answer'
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

export type TimelineItem = TimelineText | TimelineFile | TimelineSys;

const SEND_BUFFER_HIGH = 256 * 1024;
const SEND_BUFFER_LOW = 64 * 1024;
const GATHER_TIMEOUT_MS = 2500;

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

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const roleRef = useRef<'initiator' | 'joiner' | null>(null);
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
          setItems((prev) => [
            ...prev,
            { kind: 'text', id: frame.id, mine: false, body: frame.body, ts: frame.ts },
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

  const teardown = useCallback(
    (note?: Localized) => {
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
    [addSys, handleControl, locale, patchFile, pumpQueue, teardown],
  );

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && pcRef.current === pc) {
        teardown({ zh: '连接失败：请确保两台设备在同一 Wi-Fi 后重新配对', en: 'Connection failed: make sure both devices are on the same Wi-Fi, then pair again' });
      }
    };
    pcRef.current = pc;
    return pc;
  }, [teardown]);

  const gatherLocal = useCallback(async (pc: RTCPeerConnection): Promise<SignalEnvelope> => {
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const timer = window.setTimeout(resolve, GATHER_TIMEOUT_MS);
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
    return { type: local.type, sdp: compactSdp(local.sdp) };
  }, []);

  const startAsInitiator = useCallback(async () => {
    setError(null);
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
  }, [bindChannel, createPeer, gatherLocal, teardown]);

  const consumeSignal = useCallback(
    async (text: string) => {
      setError(null);
      try {
        const envelope = await decodeSignal(text);
        let pc = pcRef.current;
        if (!pc) {
          if (envelope.type !== 'offer') {
            throw new ToolError({ zh: '请在本页先点击「发起配对」生成连接信息，再粘贴对方的回执', en: 'Tap "Start pairing" on this page first to generate connection info, then paste the peer\'s reply' });
          }
          pc = createPeer();
          roleRef.current = 'joiner';
        }
        const expect = roleRef.current === 'initiator' ? 'answer' : 'offer';
        if (envelope.type !== expect) {
          throw new ToolError({ zh: `当前需要对方的 ${expect} 信息，粘贴的是 ${envelope.type}`, en: `Expecting the peer's ${expect}, but pasted ${envelope.type}` });
        }
        if (roleRef.current === 'initiator') {
          await pc.setRemoteDescription(envelope);
          setPhase('connecting');
          return;
        }
        pc.ondatachannel = (event) => bindChannel(event.channel);
        await pc.setRemoteDescription(envelope);
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
    setError(null);
    createPeer();
    roleRef.current = 'joiner';
    setPhase('scanning-offer');
  }, [createPeer]);

  const cancelPairing = useCallback(() => {
    teardown();
    revokeObjectUrls();
    setPhase('idle');
    setItems([]);
    setPeerLabel('');
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
      dcRef.current?.close();
      dcRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
      roleRef.current = null;
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current.clear();
    };
  }, []);

  return {
    phase,
    mySignal,
    items,
    peerLabel,
    error,
    startAsInitiator,
    startAsJoiner,
    consumeSignal,
    cancelPairing,
    sendText,
    sendFile,
    acceptIncoming,
    rejectIncoming,
  };
}
