import { md5 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { ToolError } from './errors';

export const PROTOCOL_VERSION = 2;
export const CHUNK_SIZE = 32 * 1024;
export const HUGE_FILE_BYTES = 1024 * 1024 * 1024;
// 2000 条约 240KB JSON，已贴近浏览器 DataChannel 单消息 ~256KB 上限；
// 发送前还必须过 MANIFEST_MAX_BYTES 字节闸，超限就提示拆分批次。
export const MANIFEST_MAX_ENTRIES = 2000;
export const MANIFEST_MAX_BYTES = 192 * 1024;

// 批量 credit 背压（参照 FastSend）：单次低水位回调最多连发 32 块，
// 剩余块数 > 16 时保持 16 块的缓冲水位，收尾阶段降到 0 避免空等事件。
const CREDIT_BATCH = 32;
const CREDIT_KEEP = 16;

export type HashAlgo = 'md5' | 'sha256';
export type BatchKind = 'files' | 'dir' | 'syncDir';

export interface ManifestEntry {
  /** `/` 连接的相对路径，pull/begin/hash 的公共坐标。 */
  key: string;
  path: string[];
  size: number;
  lastModified: number;
  mime: string;
}

export type ControlFrame =
  | { t: 'hello'; agent: string; v: number }
  | { t: 'text'; id: string; body: string; ts: number }
  | { t: 'scan'; id: string; body: string; ts: number }
  | { t: 'manifest'; batchId: string; kind: BatchKind; root: string; algo: HashAlgo; entries: ManifestEntry[] }
  | { t: 'pull'; batchId: string; key: string }
  | { t: 'begin'; batchId: string; key: string; size: number; count: number }
  | { t: 'fileDone'; batchId: string; key: string; hash: string }
  | { t: 'calcHash'; batchId: string; key: string }
  | { t: 'hashResult'; batchId: string; key: string; hash: string }
  | { t: 'batchDone'; batchId: string }
  | { t: 'cancel'; batchId: string; key?: string }
  | { t: 'err'; code: number; msg: string; batchId?: string; key?: string };

const FRAME_TYPES = new Set([
  'hello', 'text', 'scan', 'manifest', 'pull', 'begin', 'fileDone',
  'calcHash', 'hashResult', 'batchDone', 'cancel', 'err',
]);

export function encodeControl(frame: ControlFrame): string {
  return JSON.stringify(frame);
}

export function parseControl(text: string): ControlFrame {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not object');
    }
    data = parsed as Record<string, unknown>;
  } catch {
    throw new ToolError({ zh: '收到无法解析的控制帧', en: 'Received an unparseable control frame' });
  }
  const { t } = data;
  if (typeof t !== 'string' || !FRAME_TYPES.has(t)) {
    throw new ToolError({
      zh: `收到未知类型的控制帧：${String(t)}`,
      en: `Received a control frame of an unknown type: ${String(t)}`,
    });
  }
  const str = (key: string): string => {
    const value = data[key];
    if (typeof value !== 'string') throw new ToolError({
      zh: `控制帧 ${t} 缺少字段 ${key}`,
      en: `Control frame ${t} is missing the field ${key}`,
    });
    return value;
  };
  const num = (key: string): number => {
    const value = data[key];
    if (typeof value !== 'number') throw new ToolError({
      zh: `控制帧 ${t} 缺少字段 ${key}`,
      en: `Control frame ${t} is missing the field ${key}`,
    });
    return value;
  };
  const optStr = (key: string): string | undefined => {
    const value = data[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new ToolError({
      zh: `控制帧 ${t} 的字段 ${key} 类型不正确`,
      en: `Control frame ${t} has an invalid field ${key}`,
    });
    return value;
  };
  switch (t) {
    case 'hello':
      return { t, agent: str('agent'), v: num('v') };
    case 'text':
    case 'scan':
      return { t, id: str('id'), body: str('body'), ts: num('ts') };
    case 'manifest': {
      const kind = str('kind');
      if (kind !== 'files' && kind !== 'dir' && kind !== 'syncDir') {
        throw new ToolError({ zh: `控制帧 manifest 的批次类型不正确：${kind}`, en: `Manifest frame has an invalid batch kind: ${kind}` });
      }
      const algo = str('algo');
      if (algo !== 'md5' && algo !== 'sha256') {
        throw new ToolError({ zh: `控制帧 manifest 的哈希算法不支持：${algo}`, en: `Manifest frame has an unsupported hash algorithm: ${algo}` });
      }
      const raw = data.entries;
      if (!Array.isArray(raw)) {
        throw new ToolError({ zh: '控制帧 manifest 缺少字段 entries', en: 'Manifest frame is missing the field entries' });
      }
      const entries: ManifestEntry[] = raw.map((item) => {
        const e = item as Record<string, unknown>;
        if (typeof e !== 'object' || e === null) {
          throw new ToolError({ zh: '控制帧 manifest 的条目结构不正确', en: 'A manifest entry has an invalid structure' });
        }
        const errAt = (key: string): never => {
          throw new ToolError({ zh: `manifest 条目缺少字段 ${key}`, en: `A manifest entry is missing the field ${key}` });
        };
        const { key, path, size, lastModified, mime } = e;
        if (typeof key !== 'string') errAt('key');
        if (!Array.isArray(path) || path.some((p) => typeof p !== 'string')) errAt('path');
        if (typeof size !== 'number') errAt('size');
        if (typeof lastModified !== 'number') errAt('lastModified');
        if (typeof mime !== 'string') errAt('mime');
        return { key: key as string, path: path as string[], size: size as number, lastModified: lastModified as number, mime: mime as string };
      });
      return { t, batchId: str('batchId'), kind, root: optStr('root') ?? '', algo, entries };
    }
    case 'pull':
    case 'calcHash':
      return { t, batchId: str('batchId'), key: str('key') };
    case 'begin':
      return { t, batchId: str('batchId'), key: str('key'), size: num('size'), count: num('count') };
    case 'fileDone':
    case 'hashResult':
      return { t, batchId: str('batchId'), key: str('key'), hash: str('hash') };
    case 'batchDone':
      return { t, batchId: str('batchId') };
    case 'cancel': {
      const key = optStr('key');
      return key === undefined ? { t, batchId: str('batchId') } : { t, batchId: str('batchId'), key };
    }
    case 'err': {
      const batchId = optStr('batchId');
      const key = optStr('key');
      return { t, code: num('code'), msg: str('msg'), ...(batchId !== undefined ? { batchId } : {}), ...(key !== undefined ? { key } : {}) };
    }
    default:
      throw new ToolError({ zh: `控制帧 ${t} 结构不正确`, en: `Control frame ${t} has an invalid structure` });
  }
}

export function shouldWarnHuge(size: number): boolean {
  return size > HUGE_FILE_BYTES;
}

/** 按 CHUNK_SIZE 分片读取 Blob/File，arrayBuffer 逐片取出，不整读进内存。 */
export async function* sliceFile(file: Blob, chunkSize = CHUNK_SIZE): AsyncGenerator<ArrayBuffer> {
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    yield await file.slice(offset, offset + chunkSize).arrayBuffer();
  }
}

export interface IncrementalHash {
  update(data: ArrayBuffer | Uint8Array): void;
  digestHex(): string;
}

// 校验目的是传输完整性（DTLS 已保证来源真实），默认 md5：纯 JS 吞吐约为 sha256 的两倍，手机 CPU 友好。
export function createHasher(algo: HashAlgo): IncrementalHash {
  const inner = algo === 'md5' ? md5.create() : sha256.create();
  return {
    update: (data) => { inner.update(data instanceof Uint8Array ? data : new Uint8Array(data)); },
    digestHex: () => bytesToHex(inner.digest()),
  };
}

const HASH_SLICE_BYTES = 1024 * 1024;

/** 1MiB 一片增量哈希；每片之间让出一个宏任务，防止手机端长任务卡死 UI。 */
export async function hashFile(file: Blob, algo: HashAlgo, sliceBytes = HASH_SLICE_BYTES): Promise<string> {
  const hasher = createHasher(algo);
  for (let offset = 0; offset < file.size; offset += sliceBytes) {
    hasher.update(await file.slice(offset, offset + sliceBytes).arrayBuffer());
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  }
  return hasher.digestHex();
}

/** 接收侧计数重组：begin 声明块数后 consume 逐块收下，收满即 done；未声明或收满后的散块返回 null。 */
export class FrameReassembler {
  private expected = 0;
  private count = 0;
  private bytes = 0;

  expect(count: number): void {
    this.expected = count;
    this.count = 0;
    this.bytes = 0;
  }

  get done(): boolean {
    return this.expected > 0 && this.count >= this.expected;
  }

  get received(): number {
    return this.bytes;
  }

  consume(data: ArrayBuffer | Uint8Array): Uint8Array | null {
    if (this.expected <= 0 || this.done) return null;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.count += 1;
    this.bytes += bytes.byteLength;
    return bytes;
  }
}

export interface SendChannel {
  readonly readyState: string;
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  onbufferedamountlow: ((ev: Event) => unknown) | null;
  send(data: string | ArrayBufferLike): void;
}

/**
 * 批量 credit 发送器：先立即试发一批，之后由 bufferedamountlow 驱动，
 * 每次低水位连发最多 32 块。缓冲上界≈水位+一批，SCTP 管道始终保持饱满。
 */
export class PacedSender {
  private rejectCurrent: ((error: Error) => void) | null = null;
  private canceled = false;

  constructor(private readonly channel: SendChannel, private readonly blockSize: number = CHUNK_SIZE) {}

  cancel(): void {
    this.canceled = true;
    this.rejectCurrent?.(new Error('send canceled'));
    this.rejectCurrent = null;
  }

  /** 串行发送一个文件的全部数据块，边发边增量哈希，返回整文件哈希。cancel 或通道关闭时 reject。 */
  async sendFile(file: Blob, algo: HashAlgo, onProgress?: (sentBytes: number) => void): Promise<string> {
    const channel = this.channel;
    const hasher = createHasher(algo);
    const total = Math.ceil(file.size / this.blockSize);
    const chunks = sliceFile(file, this.blockSize);
    let sentChunks = 0;
    let sentBytes = 0;
    this.canceled = false;
    try {
      while (sentChunks < total) {
        if (this.canceled) throw new Error('send canceled');
        if (channel.readyState !== 'open') throw new Error('data channel closed');
        channel.bufferedAmountLowThreshold = total - sentChunks > CREDIT_KEEP ? CREDIT_KEEP * this.blockSize : 0;
        const burst = Math.min(CREDIT_BATCH, total - sentChunks);
        for (let i = 0; i < burst; i += 1) {
          const { value } = await chunks.next();
          if (value === undefined) throw new Error('chunk stream ended early');
          hasher.update(value);
          channel.send(value);
          sentChunks += 1;
          sentBytes += value.byteLength;
          onProgress?.(sentBytes);
        }
        if (!this.canceled && sentChunks < total && channel.bufferedAmount > channel.bufferedAmountLowThreshold) {
          await new Promise<void>((resolve, reject) => {
            this.rejectCurrent = (error) => { reject(error); };
            channel.onbufferedamountlow = () => {
              channel.onbufferedamountlow = null;
              this.rejectCurrent = null;
              resolve();
            };
          });
        }
      }
      if (this.canceled) throw new Error('send canceled');
      channel.onbufferedamountlow = null;
      return hasher.digestHex();
    } catch (error) {
      channel.onbufferedamountlow = null;
      this.rejectCurrent = null;
      throw error;
    }
  }
}

/** 串行化消息处理：写盘等异步步骤不会与后续帧到达交错（参照 FastSend EventQueue）。 */
export class EventQueue<T> {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly handler: (item: T) => Promise<void> | void,
    private readonly onError?: (error: unknown) => void,
  ) {}

  enqueue(item: T): void {
    this.tail = this.tail
      .then(() => this.handler(item))
      .catch((error) => { this.onError?.(error); });
  }

  /** 等待当前排队的事件全部处理完（测试与优雅收尾用）。 */
  async drain(): Promise<void> {
    await this.tail;
  }
}

export class ChunkAssembler {
  private parts: Uint8Array[] = [];
  private count = 0;
  private finished = false;

  get received(): number {
    return this.count;
  }

  push(chunk: ArrayBuffer | Uint8Array): void {
    if (this.finished)
      throw new ToolError({ zh: '传输已结束，无法继续写入分块', en: 'The transfer has finished; chunks can no longer be written' });
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    this.parts.push(bytes);
    this.count += bytes.byteLength;
  }

  finish(): Blob {
    if (this.finished)
      throw new ToolError({ zh: '传输已结束，无法重复完成', en: 'The transfer has finished; it cannot be finished twice' });
    this.finished = true;
    const blob = new Blob(this.parts as BlobPart[]);
    this.parts = [];
    return blob;
  }

  dispose(): void {
    this.finished = true;
    this.parts = [];
  }
}
