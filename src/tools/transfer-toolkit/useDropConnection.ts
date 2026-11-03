import { useCallback, useEffect, useRef, useState } from 'react';
import { UAParser } from 'ua-parser-js';
import {
  CHUNK_SIZE,
  EventQueue,
  FrameReassembler,
  MANIFEST_MAX_BYTES,
  MANIFEST_MAX_ENTRIES,
  PacedSender,
  PROTOCOL_VERSION,
  createHasher,
  encodeControl,
  hashFile,
  parseControl,
  type BatchKind,
  type ControlFrame,
  type HashAlgo,
  type IncrementalHash,
  type ManifestEntry,
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
import { buildJoinUrl, isPickupCode, makePickupCode, openLanSocket, resolveLanBase } from '@/lib/lanSignal';
import {
  cleanupEmptyDirs,
  flattenDirectory,
  hasFsAccess,
  makeFsSink,
  makeMemorySink,
  removeLocalFile,
  type FileSink,
  type FlatMap,
} from '@/lib/fsaccess';
import { diffMaps, type DiffMode, type DiffResult } from '@/lib/dirSync';
import { RateTracker } from '@/lib/transferStats';
import { useI18n } from '@/i18n/I18nProvider';
import { tl, type Locale, type Localized } from '@/i18n/locale';

export type Phase =
  | 'idle'
  | 'waiting-answer'
  | 'waiting-phone'
  | 'entering-code'
  | 'scanning-offer'
  | 'waiting-scan'
  | 'connecting'
  | 'connected'
  | 'closed';

export type EntryStatus = 'pending' | 'active' | 'done' | 'failed' | 'canceled' | 'mismatch' | 'skipped';

export interface BatchEntryState {
  key: string;
  name: string;
  path: string[];
  size: number;
  mime: string;
  status: EntryStatus;
  received: number;
  /** 内存降级路径收好的文件（FS 流式写路径直接落盘，没有 blob）。 */
  blob?: Blob;
  url?: string;
}

export interface SyncState {
  phase: 'need-dir' | 'diffing' | 'review' | 'running' | 'done';
  mode: DiffMode;
  progress?: [number, number];
  diff?: DiffResult;
  targetName?: string;
}

export interface TimelineBatch {
  kind: 'batch';
  id: string;
  batchId: string;
  mine: boolean;
  root: string;
  batchKind: BatchKind;
  algo: HashAlgo;
  entries: BatchEntryState[];
  status: 'review' | 'active' | 'done' | 'failed' | 'canceled';
  totalSize: number;
  totalReceived: number;
  speed: number;
  etaMs: number;
  sync?: SyncState;
}

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

export interface TimelineSys {
  kind: 'sys';
  id: string;
  text: Localized;
}

export type TimelineItem = TimelineText | TimelineScan | TimelineBatch | TimelineSys;

const GATHER_TIMEOUT_MS = 2500;
// STUN 要走一次公网查询，候选到齐更慢
const GATHER_TIMEOUT_STUN_MS = 6000;
const HASH_WAIT_TIMEOUT_MS = 30_000;
const utf8 = new TextEncoder();

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

interface EntryRuntime {
  file: File | null;
  path: string[];
  size: number;
  lastModified: number;
  mime: string;
  name: string;
}

interface BatchRuntime {
  mine: boolean;
  kind: BatchKind;
  algo: HashAlgo;
  root: string;
  entries: Map<string, EntryRuntime>;
  tracker: RateTracker;
  /** 已完成文件的累计字节：进度 = base + 当前文件字节。 */
  base: number;
  totalSize: number;
}

interface SyncRuntime {
  dir: FileSystemDirectoryHandle;
  localFlat: FlatMap;
  /** diff 用去根相对键 ↔ manifest 键的互转。 */
  relToKey: Map<string, string>;
  mode: DiffMode;
}

interface ReceiveRuntime {
  batchId: string;
  key: string;
  re: FrameReassembler;
  sink: FileSink;
  hasher: IncrementalHash;
}

interface PullPlan {
  batchId: string;
  queue: string[];
  dir: FileSystemDirectoryHandle | null;
  /** syncDir 批次写进目标目录本身：落盘路径去掉根目录首段。 */
  stripRoot: boolean;
}

const EMPTY_MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
function emptyHash(algo: HashAlgo): string {
  return algo === 'md5' ? EMPTY_MD5 : EMPTY_SHA256;
}

/** 抢占 6 位取件码房间：碰撞时换新码重试，直到服务端确认 'created'。 */
function claimPickupRoom(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const fail = (error: unknown) => {
      window.clearTimeout(timer);
      socket.onmessage = null;
      reject(error);
    };
    const sendCreate = (attempts: number) => {
      const code = makePickupCode();
      socket.onmessage = (event) => {
        let message: { type?: string; reason?: string };
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.type === 'created') {
          window.clearTimeout(timer);
          socket.onmessage = null;
          resolve(code);
        } else if (message.type === 'error') {
          if (message.reason === 'room-unavailable' && attempts < 10) sendCreate(attempts + 1);
          else fail(new ToolError({ zh: '取件码创建失败，请重新发起', en: 'Failed to claim a pickup code. Start again.' }));
        }
      };
      socket.send(JSON.stringify({ type: 'create', room: code }));
    };
    const timer = window.setTimeout(
      () => fail(new ToolError({ zh: '内网信令没有响应，请重新发起', en: 'The LAN signaling server did not respond. Start again.' })),
      4000,
    );
    sendCreate(0);
  });
}

export interface PendingBatchSummary {
  count: number;
  totalSize: number;
  kind: BatchKind;
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
  const [roomCode, setRoomCode] = useState('');
  const [pendingBatch, setPendingBatch] = useState<PendingBatchSummary | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const signalRef = useRef<WebSocket | null>(null);
  const roleRef = useRef<'initiator' | 'joiner' | null>(null);
  const peerIpRef = useRef('');
  const stunRef = useRef(false);
  const batchesRef = useRef<Map<string, BatchRuntime>>(new Map());
  const syncsRef = useRef<Map<string, SyncRuntime>>(new Map());
  const pacedSenderRef = useRef<PacedSender | null>(null);
  const serveChainRef = useRef<Promise<void>>(Promise.resolve());
  const receiveRef = useRef<ReceiveRuntime | null>(null);
  const pullPlanRef = useRef<PullPlan | null>(null);
  const lastPulledKeyRef = useRef('');
  const hashWaitersRef = useRef<Map<string, (hash: string) => void>>(new Map());
  const canceledBatchesRef = useRef<Set<string>>(new Set());
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const pendingSendRef = useRef<{ payload: { file: File; path: string[] }[]; kind: BatchKind } | null>(null);
  const sendItemsRef = useRef<(payload: { file: File; path: string[] }[], kind: BatchKind) => void>(() => {});

  const revokeObjectUrls = useCallback(() => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
  }, []);

  const patchBatch = useCallback(
    (batchId: string, patch: Partial<TimelineBatch>) =>
      setItems((prev) =>
        prev.map((item) => (item.kind === 'batch' && item.batchId === batchId ? { ...item, ...patch } : item)),
      ),
    [],
  );

  const patchEntry = useCallback(
    (batchId: string, key: string, patch: Partial<BatchEntryState>) =>
      setItems((prev) =>
        prev.map((item) => {
          if (item.kind !== 'batch' || item.batchId !== batchId) return item;
          return { ...item, entries: item.entries.map((e) => (e.key === key ? { ...e, ...patch } : e)) };
        }),
      ),
    [],
  );

  const addSys = useCallback(
    (text: Localized) => setItems((prev) => [...prev, { kind: 'sys', id: nextId(), text }]),
    [],
  );

  const sendFrame = useCallback((frame: ControlFrame) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === 'open') dc.send(encodeControl(frame));
  }, []);

  const refreshBatchRate = useCallback((batchId: string, received: number, now: number) => {
    const rt = batchesRef.current.get(batchId);
    if (!rt) return;
    rt.tracker.sample(received, 0, now);
    patchBatch(batchId, {
      totalReceived: received,
      speed: rt.tracker.instant(),
      etaMs: rt.tracker.eta(rt.totalSize - received, now),
    });
  }, [patchBatch]);

  // —— 发送端：被动按 pull 供片，串行链保证同通道一次一个文件 ——

  const serveFile = useCallback(async (batchId: string, key: string) => {
    const dc = dcRef.current;
    const paced = pacedSenderRef.current;
    const rt = batchesRef.current.get(batchId);
    if (!dc || !paced || !rt || !rt.mine) return;
    if (dc.readyState !== 'open' || canceledBatchesRef.current.has(batchId)) return;
    const entry = rt.entries.get(key);
    if (!entry || !entry.file) {
      sendFrame({ t: 'err', code: 404, msg: 'no such file', batchId, key });
      return;
    }
    const file = entry.file;
    const count = Math.ceil(file.size / CHUNK_SIZE);
    dc.send(encodeControl({ t: 'begin', batchId, key, size: file.size, count }));
    patchEntry(batchId, key, { status: 'active' });
    try {
      const hash = await paced.sendFile(file, rt.algo, (sent) => {
        patchEntry(batchId, key, { received: sent });
        refreshBatchRate(batchId, rt.base + sent, Date.now());
      });
      dc.send(encodeControl({ t: 'fileDone', batchId, key, hash }));
      rt.base += file.size;
      patchEntry(batchId, key, { status: 'done', received: file.size });
      refreshBatchRate(batchId, rt.base, Date.now());
    } catch {
      if (!canceledBatchesRef.current.has(batchId)) patchEntry(batchId, key, { status: 'failed' });
    }
  }, [patchEntry, refreshBatchRate, sendFrame]);

  const enqueueServe = useCallback((task: () => Promise<void>) => {
    serveChainRef.current = serveChainRef.current.then(task).catch(() => undefined);
  }, []);

  const computeHashResult = useCallback(async (batchId: string, key: string) => {
    const rt = batchesRef.current.get(batchId);
    const entry = rt?.entries.get(key);
    if (!rt || rt.mine !== true || !entry?.file) {
      sendFrame({ t: 'err', code: 404, msg: 'no such file', batchId, key });
      return;
    }
    const hash = await hashFile(entry.file, rt.algo);
    sendFrame({ t: 'hashResult', batchId, key, hash });
  }, [sendFrame]);

  // —— 接收端：pull 流水线 ——

  const finishBatch = useCallback((batchId: string) => {
    pullPlanRef.current = null;
    lastPulledKeyRef.current = '';
    receiveRef.current = null;
    sendFrame({ t: 'batchDone', batchId });
    setItems((prev) =>
      prev.map((item) => {
        if (item.kind !== 'batch' || item.batchId !== batchId) return item;
        const bad = item.entries.some((e) => e.status === 'mismatch' || e.status === 'failed');
        return {
          ...item,
          status: bad ? 'failed' : 'done',
          ...(item.sync ? { sync: { ...item.sync, phase: 'done' as const } } : {}),
        };
      }),
    );
  }, [sendFrame]);

  const nextPull = useCallback(() => {
    const plan = pullPlanRef.current;
    const dc = dcRef.current;
    if (!plan || !dc || dc.readyState !== 'open') return;
    if (receiveRef.current) return; // 上一个还没收尾
    const key = plan.queue.shift();
    if (key === undefined) {
      finishBatch(plan.batchId);
      return;
    }
    lastPulledKeyRef.current = key;
    dc.send(encodeControl({ t: 'pull', batchId: plan.batchId, key }));
  }, [finishBatch]);

  const abortCurrentReceive = useCallback(async () => {
    const receive = receiveRef.current;
    receiveRef.current = null;
    if (!receive) return null;
    try {
      await receive.sink.abort();
    } catch { /* 已断开时忽略 */ }
    return receive;
  }, []);

  const handleBinary = useCallback(async (data: ArrayBuffer) => {
    const receive = receiveRef.current;
    const rt = receive ? batchesRef.current.get(receive.batchId) : null;
    if (!receive || !rt) return;
    const bytes = receive.re.consume(data);
    if (!bytes) return;
    receive.hasher.update(bytes);
    await receive.sink.write(bytes);
    patchEntry(receive.batchId, receive.key, { received: receive.re.received });
    refreshBatchRate(receive.batchId, rt.base + receive.re.received, Date.now());
  }, [patchEntry, refreshBatchRate]);

  const finalizeReceivedFile = useCallback(async (expectedHash: string) => {
    const receive = receiveRef.current;
    if (!receive) return;
    receiveRef.current = null;
    const rt = batchesRef.current.get(receive.batchId);
    const actual = receive.hasher.digestHex();
    if (actual !== expectedHash) {
      // 参照 FastSend：校验失败即删除半写文件，绝不静默保留。
      try {
        await receive.sink.abort();
      } catch { /* 忽略 */ }
      patchEntry(receive.batchId, receive.key, { status: 'mismatch' });
      sendFrame({ t: 'err', code: 409, msg: 'checksum mismatch', batchId: receive.batchId, key: receive.key });
      addSys({ zh: `「${receive.key}」校验不匹配，半写文件已删除`, en: `"${receive.key}" failed the checksum; the partial file was removed` });
      nextPull();
      return;
    }
    await receive.sink.close();
    const size = rt?.entries.get(receive.key)?.size ?? 0;
    if (rt) rt.base += size;
    patchEntry(receive.batchId, receive.key, { status: 'done', received: size });
    refreshBatchRate(receive.batchId, rt?.base ?? 0, Date.now());
    nextPull();
  }, [addSys, nextPull, patchEntry, refreshBatchRate, sendFrame]);

  const handleControl = useCallback(
    async (frame: ControlFrame): Promise<void> => {
      switch (frame.t) {
        case 'hello':
          setPeerLabel(frame.agent);
          if (frame.v !== PROTOCOL_VERSION) {
            addSys({
              zh: `对端传输协议版本为 v${frame.v}，本页是 v${PROTOCOL_VERSION}：请两端刷新页面后再传输`,
              en: `Peer protocol v${frame.v} differs from this page v${PROTOCOL_VERSION}: refresh both pages before transferring`,
            });
          }
          break;
        case 'text':
        case 'scan':
          setItems((prev) => [
            ...prev,
            { kind: frame.t, id: frame.id, mine: false, body: frame.body, ts: frame.ts },
          ]);
          break;
        case 'manifest': {
          if (frame.kind === 'syncDir' && !hasFsAccess()) {
            sendFrame({ t: 'err', code: 403, msg: 'directory sync unsupported', batchId: frame.batchId });
            addSys({ zh: '对方请求目录同步，但本浏览器不支持直接写盘（需桌面 Chrome/Edge + HTTPS）', en: 'The peer wants folder sync, but this browser cannot write to disk (needs desktop Chrome/Edge over HTTPS)' });
            return;
          }
          const rt: BatchRuntime = {
            mine: false,
            kind: frame.kind,
            algo: frame.algo,
            root: frame.root,
            entries: new Map(frame.entries.map((e) => [e.key, {
              file: null,
              path: e.path,
              size: e.size,
              lastModified: e.lastModified,
              mime: e.mime,
              name: e.path[e.path.length - 1],
            }])),
            tracker: new RateTracker(),
            base: 0,
            totalSize: frame.entries.reduce((sum, e) => sum + e.size, 0),
          };
          batchesRef.current.set(frame.batchId, rt);
          const batch: TimelineBatch = {
            kind: 'batch',
            id: nextId(),
            batchId: frame.batchId,
            mine: false,
            root: frame.root,
            batchKind: frame.kind,
            algo: frame.algo,
            entries: frame.entries.map((e) => ({
              key: e.key,
              name: e.path[e.path.length - 1],
              path: e.path,
              size: e.size,
              mime: e.mime,
              status: 'pending' as EntryStatus,
              received: 0,
            })),
            status: 'review',
            totalSize: rt.totalSize,
            totalReceived: 0,
            speed: 0,
            etaMs: Number.POSITIVE_INFINITY,
            ...(frame.kind === 'syncDir' ? { sync: { phase: 'need-dir' as const, mode: 'quick' as DiffMode } } : {}),
          };
          setItems((prev) => [...prev, batch]);
          break;
        }
        case 'pull':
          enqueueServe(() => serveFile(frame.batchId, frame.key));
          break;
        case 'calcHash':
          enqueueServe(() => computeHashResult(frame.batchId, frame.key));
          break;
        case 'begin': {
          const plan = pullPlanRef.current;
          if (!plan || plan.batchId !== frame.batchId || lastPulledKeyRef.current !== frame.key) return;
          const rt = batchesRef.current.get(frame.batchId);
          const entry = rt?.entries.get(frame.key);
          if (!rt || !entry) return;
          const re = new FrameReassembler();
          re.expect(frame.count);
          const strip = plan.stripRoot && entry.path.length > 1 ? 1 : 0;
          const sinkPath = entry.path.slice(strip);
          let sink: FileSink;
          if (plan.dir) {
            sink = await makeFsSink(plan.dir, sinkPath);
          } else {
            const { batchId } = plan;
            const { key } = frame;
            sink = makeMemorySink((blob) => {
              const url = URL.createObjectURL(blob);
              objectUrlsRef.current.add(url);
              patchEntry(batchId, key, { blob, url });
            });
          }
          receiveRef.current = { batchId: frame.batchId, key: frame.key, re, sink, hasher: createHasher(rt.algo) };
          patchEntry(frame.batchId, frame.key, { status: 'active' });
          patchBatch(frame.batchId, { status: 'active' });
          if (frame.count === 0) {
            // 空文件没有数据块：立即收尾，fileDone 到达时会被 receiveRef 已空而忽略。
            await finalizeReceivedFile(emptyHash(rt.algo));
          }
          break;
        }
        case 'fileDone': {
          const receive = receiveRef.current;
          if (!receive || receive.batchId !== frame.batchId || receive.key !== frame.key) return;
          await finalizeReceivedFile(frame.hash);
          break;
        }
        case 'hashResult': {
          const waiterKey = `${frame.batchId}\u0000${frame.key}`;
          const waiter = hashWaitersRef.current.get(waiterKey);
          if (waiter) {
            hashWaitersRef.current.delete(waiterKey);
            waiter(frame.hash);
          }
          break;
        }
        case 'batchDone': {
          // 发送端收到：对方不再拉取，剩余条目记为跳过。
          const rt = batchesRef.current.get(frame.batchId);
          if (!rt || !rt.mine) return;
          setItems((prev) =>
            prev.map((item) => {
              if (item.kind !== 'batch' || item.batchId !== frame.batchId) return item;
              return {
                ...item,
                status: 'done',
                entries: item.entries.map((e) => (e.status === 'pending' ? { ...e, status: 'skipped' as EntryStatus } : e)),
              };
            }),
          );
          break;
        }
        case 'cancel': {
          const rt = batchesRef.current.get(frame.batchId);
          if (rt?.mine) {
            if (frame.key) {
              pacedSenderRef.current?.cancel();
              patchEntry(frame.batchId, frame.key, { status: 'canceled' });
            } else {
              canceledBatchesRef.current.add(frame.batchId);
              pacedSenderRef.current?.cancel();
              patchBatch(frame.batchId, { status: 'canceled' });
            }
            return;
          }
          if (frame.key) {
            const receive = await abortCurrentReceive();
            if (receive) patchEntry(receive.batchId, receive.key, { status: 'canceled' });
            nextPull();
          } else {
            pullPlanRef.current = null;
            await abortCurrentReceive();
            patchBatch(frame.batchId, { status: 'canceled' });
          }
          break;
        }
        case 'err': {
          if (frame.code === 403 && frame.batchId) {
            const rt = batchesRef.current.get(frame.batchId);
            if (rt?.mine) {
              canceledBatchesRef.current.add(frame.batchId);
              patchBatch(frame.batchId, { status: 'canceled' });
              addSys({ zh: '对方拒绝接收这一批文件', en: 'The peer rejected this batch' });
            }
            return;
          }
          if (frame.code === 409 && frame.batchId && frame.key) {
            const rt = batchesRef.current.get(frame.batchId);
            if (rt?.mine) patchEntry(frame.batchId, frame.key, { status: 'mismatch' });
            return;
          }
          if (frame.code === 404 && frame.batchId && frame.key) {
            const plan = pullPlanRef.current;
            if (plan && plan.batchId === frame.batchId) {
              patchEntry(frame.batchId, frame.key, { status: 'failed' });
              nextPull();
              return;
            }
          }
          addSys({ zh: `对端报错：${frame.msg}`, en: `Peer error: ${frame.msg}` });
          break;
        }
        default:
          break;
      }
    },
    [
      addSys, abortCurrentReceive, computeHashResult, enqueueServe, finalizeReceivedFile,
      nextPull, patchBatch, patchEntry, refreshBatchRate, sendFrame, serveFile,
    ],
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
      setRoomCode('');
      pacedSenderRef.current?.cancel();
      pacedSenderRef.current = null;
      void receiveRef.current?.sink.abort().catch(() => undefined);
      receiveRef.current = null;
      pullPlanRef.current = null;
      batchesRef.current.clear();
      syncsRef.current.clear();
      hashWaitersRef.current.clear();
      canceledBatchesRef.current.clear();
      serveChainRef.current = Promise.resolve();
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
      const queue = new EventQueue<ArrayBuffer | string>(
        (message) => {
          if (typeof message === 'string') {
            try {
              return handleControl(parseControl(message));
            } catch (caught) {
              addSys(toToolError(caught).localized);
              return undefined;
            }
          }
          return handleBinary(message);
        },
        (caught) => addSys(toToolError(caught).localized),
      );
      channel.onopen = () => {
        pacedSenderRef.current = new PacedSender(channel);
        closeSignaling();
        setPhase('connected');
        channel.send(encodeControl({ t: 'hello', agent: agentLabel(locale), v: PROTOCOL_VERSION }));
        addSys({ zh: '连接已建立，可以互传内容', en: 'Connected. You can exchange content now.' });
        const pending = pendingSendRef.current;
        if (pending) {
          pendingSendRef.current = null;
          setPendingBatch(null);
          sendItemsRef.current?.(pending.payload, pending.kind);
          addSys({ zh: '已把暂存的文件清单送达对方，等待对方选择接收', en: 'The staged manifest was delivered; waiting for the peer to choose what to receive' });
        }
      };
      channel.onclose = () => teardown({ zh: '连接已关闭', en: 'Connection closed' });
      channel.onmessage = (event: MessageEvent) => {
        queue.enqueue(event.data as ArrayBuffer | string);
      };
    },
    [addSys, closeSignaling, handleBinary, handleControl, locale, teardown],
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
  }, [teardown]);

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
    setRoomCode('');
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
      const room = await claimPickupRoom(socket);
      setRoomCode(room);
      setMySignal(buildJoinUrl(base, room));
      setPhase('waiting-phone');

      const pc = createPeer();
      roleRef.current = 'initiator';
      bindChannel(pc.createDataChannel('filedrop'));
      socket.onmessage = (event) => {
        void (async () => {
          const message = JSON.parse(String(event.data)) as { type?: string; payload?: string; reason?: string };
          if (message.type === 'peer-joined') {
            setPairingNotice({ zh: '对方已接入取件码，正在自动建立连接…', en: 'The peer joined with your pickup code. Connecting automatically…' });
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
      // 取件码依赖内网信令服务。失败时明确报错回到 idle，离线配对由用户在「高级」区自行发起。
      teardown();
      setPhase('idle');
      setError({
        message: { zh: '内网信令服务连不上，取件码不可用', en: 'Cannot reach the LAN signaling service, so pickup codes are unavailable' },
        hint: {
          zh: '取件码需要 npm run dev:lan 或 npm run start:lan 启动的服务，并用局域网 IP 打开本页；静态托管请在下方「高级 · 离线配对」手动配对。',
          en: 'Pickup codes need the server from npm run dev:lan or npm run start:lan, opened via this machine\'s LAN IP. On static hosting, use "Advanced · Offline pairing" below.',
        },
      });
    }
  }, [bindChannel, closeSignaling, createPeer, gatherLocal, teardown]);

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
              { zh: '取件码无效、已被使用或已过期', en: 'The pickup code is invalid, already used, or expired' },
              { zh: '请让对方重新生成取件码；手机也可以重新扫码。', en: 'Ask the peer to generate a new pickup code; phones can rescan the QR.' },
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

  /** 输入取件码接入：先切到输入面板，提交时再真正入房。 */
  const startCodeJoin = useCallback(() => {
    closeSignaling();
    setError(null);
    setPairingMode('lan');
    setPhase('entering-code');
  }, [closeSignaling]);

  const joinByCode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!isPickupCode(trimmed)) {
        setError({
          message: { zh: '取件码应为 6 位数字', en: 'A pickup code is 6 digits' },
          hint: { zh: '请核对发送端屏幕上显示的取件码。', en: 'Double-check the code shown on the sender\'s screen.' },
        });
        return;
      }
      await joinViaLink(trimmed);
    },
    [joinViaLink],
  );

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

  /** 发送一组条目：kind 决定接收端的呈现与流程（散文件 / 目录 / 目录同步）。 */
  const sendItems = useCallback(
    (payload: { file: File; path: string[] }[], kind: BatchKind) => {
      if (payload.length === 0) return;
      const tooMany = () =>
        addSys({
          zh: `一批最多 ${MANIFEST_MAX_ENTRIES} 个文件，请拆分后再发送`,
          en: `Up to ${MANIFEST_MAX_ENTRIES} files per batch. Split and send again.`,
        });
      const dc = dcRef.current;
      if (!dc || dc.readyState !== 'open') {
        // FastSend 式「先选后发」：未连接时暂存，通道打开自动送达清单
        if (pendingSendRef.current) {
          addSys({
            zh: '已有一批暂存内容在等待连接，这批送达后再接着准备',
            en: 'A staged batch is already waiting for the connection. Prep the next one after it ships.',
          });
          return;
        }
        if (payload.length > MANIFEST_MAX_ENTRIES) {
          tooMany();
          return;
        }
        pendingSendRef.current = { payload, kind };
        setPendingBatch({ count: payload.length, totalSize: payload.reduce((sum, e) => sum + e.file.size, 0), kind });
        addSys({
          zh: `已暂存 ${payload.length} 项，连接建立后自动送达`,
          en: `Staged ${payload.length} item(s); they ship automatically once connected.`,
        });
        return;
      }
      if (payload.length > MANIFEST_MAX_ENTRIES) {
        tooMany();
        return;
      }
      const batchId = nextId();
      const manifestEntries: ManifestEntry[] = payload.map(({ file, path }) => ({
        key: path.join('/'),
        path,
        size: file.size,
        lastModified: file.lastModified,
        mime: file.type || 'application/octet-stream',
      }));
      const root = kind === 'files' ? '' : payload[0].path[0] ?? '';
      const frame: ControlFrame = { t: 'manifest', batchId, kind, root, algo: 'md5', entries: manifestEntries };
      const text = encodeControl(frame);
      if (utf8.encode(text).length > MANIFEST_MAX_BYTES) {
        addSys({
          zh: '文件清单过大（路径太深或名字太长），请拆分目录后再传',
          en: 'The manifest is too large (deep paths or long names). Split the directory first.',
        });
        return;
      }
      const totalSize = payload.reduce((sum, e) => sum + e.file.size, 0);
      batchesRef.current.set(batchId, {
        mine: true,
        kind,
        algo: 'md5',
        root,
        entries: new Map(payload.map(({ file, path }) => [
          path.join('/'),
          {
            file,
            path,
            size: file.size,
            lastModified: file.lastModified,
            mime: file.type || 'application/octet-stream',
            name: path[path.length - 1],
          },
        ])),
        tracker: new RateTracker(),
        base: 0,
        totalSize,
      });
      canceledBatchesRef.current.delete(batchId);
      setItems((prev) => [
        ...prev,
        {
          kind: 'batch',
          id: nextId(),
          batchId,
          mine: true,
          root,
          batchKind: kind,
          algo: 'md5' as HashAlgo,
          entries: manifestEntries.map((e) => ({
            key: e.key,
            name: e.path[e.path.length - 1],
            path: e.path,
            size: e.size,
            mime: e.mime,
            status: 'pending' as EntryStatus,
            received: 0,
          })),
          status: 'active',
          totalSize,
          totalReceived: 0,
          speed: 0,
          etaMs: Number.POSITIVE_INFINITY,
        },
      ]);
      dc.send(text);
    },
    [addSys],
  );

  sendItemsRef.current = sendItems;

  const clearPendingBatch = useCallback(() => {
    pendingSendRef.current = null;
    setPendingBatch(null);
  }, []);

  const sendFiles = useCallback(
    (files: File[]) => {
      sendItems(files.map((file) => ({ file, path: [file.name] })), 'files');
    },
    [sendItems],
  );

  const acceptBatch = useCallback(
    (batchId: string, keys: string[], dir: FileSystemDirectoryHandle | null) => {
      const dc = dcRef.current;
      const rt = batchesRef.current.get(batchId);
      if (!dc || dc.readyState !== 'open' || !rt || rt.mine || keys.length === 0) return;
      if (pullPlanRef.current) return; // 同一时刻只维持一个拉取计划
      pullPlanRef.current = { batchId, queue: [...keys], dir, stripRoot: rt.kind === 'syncDir' };
      patchBatch(batchId, { status: 'active' });
      nextPull();
    },
    [nextPull, patchBatch],
  );

  const rejectBatch = useCallback(
    (batchId: string) => {
      const rt = batchesRef.current.get(batchId);
      if (!rt || rt.mine) return;
      sendFrame({ t: 'err', code: 403, msg: 'rejected', batchId });
      patchBatch(batchId, { status: 'canceled' });
    },
    [patchBatch, sendFrame],
  );

  const cancelBatch = useCallback(
    (batchId: string) => {
      const rt = batchesRef.current.get(batchId);
      if (!rt) return;
      sendFrame({ t: 'cancel', batchId });
      if (rt.mine) {
        canceledBatchesRef.current.add(batchId);
        pacedSenderRef.current?.cancel();
        patchBatch(batchId, { status: 'canceled' });
      } else {
        pullPlanRef.current = null;
        void abortCurrentReceive();
        patchBatch(batchId, { status: 'canceled' });
      }
    },
    [abortCurrentReceive, patchBatch, sendFrame],
  );

  const requestRemoteHash = useCallback(
    (batchId: string, key: string): Promise<string> =>
      new Promise<string>((resolve, reject) => {
        const waiterKey = `${batchId}\u0000${key}`;
        const timer = window.setTimeout(() => {
          if (hashWaitersRef.current.delete(waiterKey)) {
            reject(new ToolError({ zh: '等待对端文件哈希超时', en: 'Timed out waiting for the peer file hash' }));
          }
        }, HASH_WAIT_TIMEOUT_MS);
        hashWaitersRef.current.set(waiterKey, (hash) => {
          window.clearTimeout(timer);
          resolve(hash);
        });
        sendFrame({ t: 'calcHash', batchId, key });
      }),
    [sendFrame],
  );

  /** 目录同步：选定本地目录后与远端清单 diff（快速 size+mtime / 精确内容哈希）。 */
  const startSyncDiff = useCallback(
    async (batchId: string, dir: FileSystemDirectoryHandle, mode: DiffMode) => {
      const rt = batchesRef.current.get(batchId);
      if (!rt || rt.mine || rt.kind !== 'syncDir') return;
      patchBatch(batchId, { sync: { phase: 'diffing', mode, targetName: dir.name } });
      try {
        const localFlat = await flattenDirectory(dir);
        const prefix = rt.root ? `${rt.root}/` : '';
        const relToKey = new Map<string, string>();
        const remote: Record<string, { size: number; lastModified: number }> = {};
        for (const [key, entry] of rt.entries) {
          const rel = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
          relToKey.set(rel, key);
          remote[rel] = { size: entry.size, lastModified: entry.lastModified };
        }
        syncsRef.current.set(batchId, { dir, localFlat, relToKey, mode });
        const diff = await diffMaps(
          remote,
          localFlat,
          mode,
          async (rel) => {
            const manifestKey = relToKey.get(rel) ?? rel;
            const remoteHash = await requestRemoteHash(batchId, manifestKey);
            const local = localFlat[rel];
            const localHash = local ? await hashFile(await local.getFile(), rt.algo) : '';
            return { remoteHash, localHash };
          },
          (done, total) => patchBatch(batchId, { sync: { phase: 'diffing', mode, targetName: dir.name, progress: [done, total] } }),
        );
        patchBatch(batchId, { sync: { phase: 'review', mode, targetName: dir.name, diff } });
      } catch (caught) {
        patchBatch(batchId, { sync: { phase: 'need-dir', mode } });
        addSys(toToolError(caught).localized);
      }
    },
    [addSys, patchBatch, requestRemoteHash],
  );

  /** 执行同步：删除桶回收 + 新增/更新桶走同一 pull 流水线写入目标目录。 */
  const runSync = useCallback(
    async (batchId: string, pullRels: string[], deleteRels: string[]) => {
      const rt = batchesRef.current.get(batchId);
      const sync = syncsRef.current.get(batchId);
      if (!rt || !sync || rt.mine) return;
      patchBatch(batchId, { sync: { phase: 'running', mode: sync.mode, targetName: sync.dir.name } });
      const deleted: string[] = [];
      for (const rel of deleteRels) {
        try {
          await removeLocalFile(sync.dir, rel);
          deleted.push(rel);
        } catch { /* 本地文件已被外部改动则跳过 */ }
      }
      if (deleted.length > 0) await cleanupEmptyDirs(sync.dir, deleted);
      const manifestKeys = pullRels.map((rel) => sync.relToKey.get(rel) ?? rel);
      if (manifestKeys.length > 0) {
        acceptBatch(batchId, manifestKeys, sync.dir);
      } else {
        patchBatch(batchId, { status: 'done', sync: { phase: 'done', mode: sync.mode, targetName: sync.dir.name } });
      }
    },
    [acceptBatch, patchBatch],
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
    roomCode,
    pendingBatch,
    fsWritable: hasFsAccess(),
    setPeerIp: updatePeerIp,
    setStunEnabled: updateStunEnabled,
    startAsInitiator,
    startManualPairing,
    startAsJoiner,
    startCodeJoin,
    joinByCode,
    joinViaLink,
    consumeSignal,
    cancelPairing,
    clearPendingBatch,
    sendText,
    sendScan,
    sendFiles,
    sendItems,
    acceptBatch,
    rejectBatch,
    cancelBatch,
    startSyncDiff,
    runSync,
  };
}

export type DropConnection = ReturnType<typeof useDropConnection>;
