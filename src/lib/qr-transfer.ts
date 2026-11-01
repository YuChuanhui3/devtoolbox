import { ToolError } from './errors';
import { bytesToBase64, base64ToBytes } from './base64';
import { CRC_PRESETS, crcHex } from './crc';

/**
 * 空气隔离二维码传输协议 DQX1：
 * 帧文本 = DQX1:<sid>:<meta>:<i>of<n>:<b64>[:<CRC32-8HEX>]
 * - sid：6 位 base36 会话 id，接收端按 sid 归组。
 * - meta：仅首帧携带，base64(JSON{f 文件名, r 原始字节数, g 是否 gzip})。
 * - 末帧携带整个载荷字节的 CRC-32 摘要。
 */
export const DQX_PREFIX = 'DQX1:';

const CRC32_SPEC = CRC_PRESETS.find((preset) => preset.width === 32)!;

export interface DqxFrameMeta {
  fileName?: string;
  rawBytes?: number;
  gzipped?: boolean;
}

export interface DqxFrame {
  sid: string;
  index: number;
  total: number;
  /** 该帧的载荷字节（Base64 解码后）。 */
  data: Uint8Array;
  meta?: DqxFrameMeta;
  /** 仅末帧：全会话载荷的 CRC-32 大写十六进制。 */
  crc?: string;
}

export function makeSessionId(): string {
  const buffer = new Uint32Array(4);
  crypto.getRandomValues(buffer);
  let id = '';
  for (const value of buffer) id += value.toString(36).padStart(7, '0');
  return id.slice(0, 6);
}

/** 协议内 Base64 段解码：允许空段（空载荷），非法字符返回 null，不走面向用户的 normalize 报错路径。 */
function decodeB64Segment(segment: string): Uint8Array | null {
  try {
    return base64ToBytes(segment);
  } catch {
    return null;
  }
}

function encodeMetaSegment(meta: DqxFrameMeta | undefined, index: number): string {
  if (index !== 0 || !meta) return '';
  const payload: Record<string, unknown> = {};
  if (meta.fileName) payload.f = meta.fileName;
  if (typeof meta.rawBytes === 'number') payload.r = meta.rawBytes;
  if (meta.gzipped) payload.g = 1;
  if (Object.keys(payload).length === 0) return '';
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodeMetaSegment(segment: string): DqxFrameMeta | undefined {
  if (!segment) return undefined;
  const decoded = decodeB64Segment(segment);
  if (!decoded) return undefined;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decoded)) as {
      f?: unknown;
      r?: unknown;
      g?: unknown;
    };
    const meta: DqxFrameMeta = {};
    if (typeof parsed.f === 'string') meta.fileName = parsed.f;
    if (typeof parsed.r === 'number') meta.rawBytes = parsed.r;
    if (parsed.g === 1) meta.gzipped = true;
    return meta;
  } catch {
    return undefined;
  }
}

/** 生成一帧的可扫文本。crc 只在末帧传入。 */
export function encodeFrame(
  sid: string,
  index: number,
  total: number,
  data: Uint8Array,
  meta?: DqxFrameMeta,
  crc?: string,
): string {
  const parts = [DQX_PREFIX + sid, encodeMetaSegment(meta, index), `${index}of${total}`, bytesToBase64(data)];
  if (index === total - 1 && crc) parts.push(crc);
  return parts.join(':');
}

/** 解析扫码文本；非本协议帧返回 null（相机画面里混有普通二维码时静默丢弃）。 */
export function parseFrame(text: string): DqxFrame | null {
  if (!text.startsWith(DQX_PREFIX)) return null;
  const parts = text.split(':');
  if (parts.length < 5 || parts.length > 6) return null;
  const sid = parts[1];
  if (!/^[0-9a-z]{4,12}$/.test(sid)) return null;
  const position = /^(\d+)of(\d+)$/.exec(parts[3]);
  if (!position) return null;
  const index = Number(position[1]);
  const total = Number(position[2]);
  if (!Number.isFinite(total) || total < 1 || index < 0 || index >= total) return null;
  // 发送端把切块长度对齐到 3 的倍数：非末帧的 Base64 必无 padding。出现 '=' 说明帧被错读，丢弃。
  if (index !== total - 1 && parts[4].includes('=')) return null;
  let data: Uint8Array | null;
  try {
    data = decodeB64Segment(parts[4]);
  } catch {
    return null;
  }
  if (!data) return null;
  const frame: DqxFrame = { sid, index, total, data };
  const meta = decodeMetaSegment(parts[2]);
  if (meta) frame.meta = meta;
  if (index === total - 1 && parts[5] && /^[0-9A-Fa-f]{8}$/.test(parts[5])) {
    frame.crc = parts[5].toUpperCase();
  }
  return frame;
}

export interface SessionView {
  sid: string;
  total: number;
  received: number;
  missing: number[];
  meta?: DqxFrameMeta;
  crcExpected?: string;
}

export type AssembleEvent =
  | { kind: 'ignored'; reason: 'not-dqx' | 'duplicate' | 'conflict' }
  | { kind: 'progress'; session: SessionView }
  | { kind: 'complete'; session: SessionView; payload: Uint8Array }
  | { kind: 'mismatch'; session: SessionView; crcActual: string };

export class FrameAssembler {
  private sessions = new Map<string, { total: number; frames: Map<number, Uint8Array>; meta?: DqxFrameMeta; crcExpected?: string }>();

  /** 记录每 sid 首帧声明的总帧数，冲突帧直接忽略。 */
  push(textOrFrame: string | DqxFrame | null): AssembleEvent {
    if (!textOrFrame) return { kind: 'ignored', reason: 'not-dqx' };
    const frame = typeof textOrFrame === 'string' ? parseFrame(textOrFrame) : textOrFrame;
    if (!frame) return { kind: 'ignored', reason: 'not-dqx' };

    let session = this.sessions.get(frame.sid);
    if (!session) {
      session = { total: frame.total, frames: new Map() };
      this.sessions.set(frame.sid, session);
    }
    if (session.total !== frame.total) return { kind: 'ignored', reason: 'conflict' };
    if (session.frames.has(frame.index)) {
      const existing = session.frames.get(frame.index)!;
      if (existing.length !== frame.data.length || existing.some((byte, i) => byte !== frame.data[i])) {
        return { kind: 'ignored', reason: 'conflict' };
      }
      return { kind: 'ignored', reason: 'duplicate' };
    }
    session.frames.set(frame.index, frame.data);
    if (frame.meta) session.meta = frame.meta;
    if (frame.crc) session.crcExpected = frame.crc;

    const view = this.view(frame.sid)!;
    if (session.frames.size < session.total) return { kind: 'progress', session: view };

    const payload = this.payloadBytes(frame.sid);
    if (!session.crcExpected) return { kind: 'complete', session: view, payload };
    const actual = crcHex(payload, CRC32_SPEC);
    if (actual === session.crcExpected) return { kind: 'complete', session: view, payload };
    return { kind: 'mismatch', session: view, crcActual: actual };
  }

  view(sid: string): SessionView | null {
    const session = this.sessions.get(sid);
    if (!session) return null;
    const missing: number[] = [];
    for (let i = 0; i < session.total; i += 1) {
      if (!session.frames.has(i)) missing.push(i);
    }
    return {
      sid,
      total: session.total,
      received: session.frames.size,
      missing,
      meta: session.meta,
      crcExpected: session.crcExpected,
    };
  }

  sessionsList(): SessionView[] {
    return Array.from(this.sessions.keys(), (sid) => this.view(sid)!);
  }

  has(sid: string): boolean {
    return this.sessions.has(sid);
  }

  /** 齐帧时按序号拼接 Base64 段并解码；各段去 padding 后拼接，整块字节数不变，重新补位即可。 */
  payloadBytes(sid: string): Uint8Array {
    const session = this.sessions.get(sid);
    if (!session || session.frames.size < session.total) {
      throw new ToolError(
        { zh: '会话帧未齐，无法拼接载荷', en: 'Session frames are incomplete; cannot build the payload' },
      );
    }
    let joined = '';
    for (let i = 0; i < session.total; i += 1) joined += bytesToBase64(session.frames.get(i)!).replace(/=+$/, '');
    return base64ToBytes(joined);
  }

  reset() {
    this.sessions.clear();
  }
}

/** 发送端切帧。frameBytes 会被自动对齐到 3 的倍数（保证中间帧 Base64 无 padding）。 */
export function splitFrames(
  payload: Uint8Array,
  options: { sid: string; frameBytes: number; fileName?: string; rawBytes?: number; gzipped?: boolean },
): { frames: string[]; frameBytes: number } {
  const aligned = Math.max(3, Math.floor(options.frameBytes / 3) * 3);
  const total = Math.max(1, Math.ceil(payload.length / aligned));
  const meta: DqxFrameMeta = { fileName: options.fileName, rawBytes: options.rawBytes, gzipped: options.gzipped };
  const crc = crcHex(payload, CRC32_SPEC);
  const frames: string[] = [];
  for (let i = 0; i < total; i += 1) {
    const data = payload.subarray(i * aligned, Math.min(payload.length, (i + 1) * aligned));
    frames.push(encodeFrame(options.sid, i, total, data, meta, i === total - 1 ? crc : undefined));
  }
  return { frames, frameBytes: aligned };
}

/** gzip magic（1f 8b）探测后解压；非 gzip 数据原样返回。 */
export async function inflatePayloadBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const Ctor = globalThis.DecompressionStream;
  if (!Ctor) {
    throw new ToolError(
      { zh: '当前浏览器不支持 Gzip 解压', en: 'This browser does not support Gzip decompression' },
      { zh: '请直接下载原始文件查看。', en: 'Download the raw file to inspect it instead.' },
    );
  }
  const buffer = await transformBytes(bytes.slice(), new Ctor('gzip'));
  return new Uint8Array(buffer);
}

/** 任意字节 gzip 压缩（发送端对文件也压缩以省帧数）。 */
export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const Ctor = globalThis.CompressionStream;
  if (!Ctor) {
    throw new ToolError(
      { zh: '当前浏览器不支持 Gzip 压缩', en: 'This browser does not support Gzip compression' },
    );
  }
  const buffer = await transformBytes(bytes.slice(), new Ctor('gzip'));
  return new Uint8Array(buffer);
}

async function transformBytes(bytes: Uint8Array, transformer: TransformStream<Uint8Array, Uint8Array>): Promise<ArrayBuffer> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(source.pipeThrough(transformer)).arrayBuffer();
}

export function textToGzipPayload(text: string): Promise<Uint8Array> {
  return gzipBytes(new TextEncoder().encode(text));
}

/**
 * 二分搜索能生成二维码的最大帧字节数。validate 传入「一帧最大文本」的容量探测函数
 * （UI 侧用 createQrMatrix 实现），库本身保持无 QR 依赖以便纯单测。
 */
export function tuneFrameBytes(
  min: number,
  max: number,
  validate: (frameBytes: number) => boolean,
): number {
  let low = Math.max(3, Math.floor(min / 3) * 3);
  let high = Math.floor(max / 3) * 3;
  if (!validate(low)) return 0;
  if (validate(high)) return high;
  while (high - low > 3) {
    const mid = Math.floor((low + high) / 2 / 3) * 3;
    if (validate(mid)) low = mid;
    else high = mid;
  }
  return low;
}

export function crc32OfPayload(bytes: Uint8Array): string {
  return crcHex(bytes, CRC32_SPEC);
}
