import { beforeAll, describe, expect, test } from 'vitest';
import {
  ChunkAssembler,
  CHUNK_SIZE,
  EventQueue,
  FrameReassembler,
  PacedSender,
  createHasher,
  encodeControl,
  hashFile,
  parseControl,
  shouldWarnHuge,
  sliceFile,
  type ControlFrame,
  type SendChannel,
} from './filedrop';

function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

beforeAll(() => {
  // jsdom 的 Blob 没有 arrayBuffer()，浏览器原生支持，这里为测试补同名实现
  const proto = Blob.prototype as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof proto.arrayBuffer !== 'function') {
    Object.defineProperty(Blob.prototype, 'arrayBuffer', {
      value(this: Blob) {
        return blobBytes(this);
      },
      configurable: true,
      writable: true,
    });
  }
});

describe('control frames', () => {
  const frames: ControlFrame[] = [
    { t: 'hello', agent: 'iPhone · Safari', v: 2 },
    { t: 'text', id: 'a1', body: '你好', ts: 1 },
    { t: 'scan', id: 'a2', body: 'https://example.com', ts: 2 },
    {
      t: 'manifest',
      batchId: 'b1',
      kind: 'dir',
      root: 'proj',
      algo: 'md5',
      entries: [
        { key: 'proj/src/a.ts', path: ['proj', 'src', 'a.ts'], size: 10, lastModified: 20, mime: 'text/plain' },
        { key: 'proj/x.bin', path: ['proj', 'x.bin'], size: 0, lastModified: 0, mime: 'application/octet-stream' },
      ],
    },
    { t: 'manifest', batchId: 'b2', kind: 'files', root: '', algo: 'sha256', entries: [] },
    { t: 'pull', batchId: 'b1', key: 'proj/x.bin' },
    { t: 'begin', batchId: 'b1', key: 'proj/x.bin', size: 0, count: 31 },
    { t: 'fileDone', batchId: 'b1', key: 'proj/x.bin', hash: 'd41d8cd98f00b204e9800998ecf8427e' },
    { t: 'calcHash', batchId: 'b1', key: 'proj/src/a.ts' },
    { t: 'hashResult', batchId: 'b1', key: 'proj/src/a.ts', hash: 'abc' },
    { t: 'batchDone', batchId: 'b1' },
    { t: 'cancel', batchId: 'b1' },
    { t: 'cancel', batchId: 'b1', key: 'proj/x.bin' },
    { t: 'err', code: 403, msg: 'rejected' },
    { t: 'err', code: 429, msg: 'busy', batchId: 'b1', key: 'k' },
  ];

  test('encode/parse round trip', () => {
    for (const frame of frames) {
      expect(parseControl(encodeControl(frame))).toEqual(frame);
    }
  });

  test('rejects non-JSON and unknown types', () => {
    expect(() => parseControl('not json')).toThrowError(/无法解析/);
    expect(() => parseControl('[1,2]')).toThrowError(/无法解析/);
    expect(() => parseControl('{"t":"bogus"}')).toThrowError(/未知类型/);
    expect(() => parseControl('{"t":"meta","id":"x"}')).toThrowError(/未知类型/);
  });

  test('rejects missing or malformed fields', () => {
    expect(() => parseControl('{"t":"hello","agent":"x"}')).toThrowError(/缺少字段 v/);
    expect(() => parseControl('{"t":"pull","batchId":"b"}')).toThrowError(/缺少字段 key/);
    expect(() => parseControl('{"t":"begin","batchId":"b","key":"k","size":1}')).toThrowError(/缺少字段 count/);
    expect(() => parseControl('{"t":"manifest","batchId":"b","kind":"nope","algo":"md5","entries":[]}')).toThrowError(/批次类型/);
    expect(() => parseControl('{"t":"manifest","batchId":"b","kind":"files","algo":"crc32","entries":[]}')).toThrowError(/哈希算法/);
    expect(() => parseControl('{"t":"manifest","batchId":"b","kind":"files","algo":"md5","entries":[{"key":"a"}]}')).toThrowError(/条目缺少字段 path/);
    expect(() => parseControl('{"t":"manifest","batchId":"b","kind":"files","algo":"md5","entries":[{"key":"a","path":"x","size":1,"lastModified":0,"mime":""}]}')).toThrowError(/条目缺少字段 path/);
  });
});

describe('sliceFile', () => {
  test('covers whole blob without overlap or gaps', async () => {
    const data = new Uint8Array(CHUNK_SIZE * 2 + 7);
    for (let i = 0; i < data.length; i += 1) data[i] = i % 251;
    const blob = new Blob([data]);
    const chunks: Uint8Array[] = [];
    for await (const part of sliceFile(blob)) chunks.push(new Uint8Array(part));
    expect(chunks.map((c) => c.byteLength)).toEqual([CHUNK_SIZE, CHUNK_SIZE, 7]);
    const merged = new Uint8Array(data.length);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    expect(merged).toEqual(data);
  });

  test('empty blob yields no chunks', async () => {
    const chunks: ArrayBuffer[] = [];
    for await (const part of sliceFile(new Blob([]))) chunks.push(part);
    expect(chunks).toHaveLength(0);
  });
});

describe('hashing', () => {
  test('incremental md5/sha256 match known vectors', () => {
    const abc = new TextEncoder().encode('abc');
    const m = createHasher('md5');
    m.update(abc);
    expect(m.digestHex()).toBe('900150983cd24fb0d6963f7d28e17f72');
    const s = createHasher('sha256');
    s.update(abc);
    expect(s.digestHex()).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('digestHex matches between one-shot and split updates', () => {
    const data = new Uint8Array(3 * 1024 * 1024 + 5);
    for (let i = 0; i < data.length; i += 1) data[i] = (i * 31) % 256;
    const whole = createHasher('md5');
    whole.update(data);
    const split = createHasher('md5');
    for (let offset = 0; offset < data.length; offset += 65536) {
      split.update(data.slice(offset, offset + 65536));
    }
    expect(split.digestHex()).toBe(whole.digestHex());
  });

  test('hashFile slices a blob', async () => {
    expect(await hashFile(new Blob([]), 'md5')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(await hashFile(new Blob(['abc']), 'md5', 1)).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(await hashFile(new Blob(['abc']), 'sha256', 2)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('FrameReassembler', () => {
  test('counts declared chunks and completes', () => {
    const re = new FrameReassembler();
    re.expect(3);
    expect(re.consume(new Uint8Array([1, 2]))).not.toBeNull();
    expect(re.consume(new Uint8Array([3]))).not.toBeNull();
    expect(re.done).toBe(false);
    expect(re.consume(new Uint8Array([4, 5, 6]))).not.toBeNull();
    expect(re.done).toBe(true);
    expect(re.received).toBe(6);
    // 收满之后的散块忽略
    expect(re.consume(new Uint8Array([9]))).toBeNull();
  });

  test('ignores stray chunks before expect', () => {
    const re = new FrameReassembler();
    expect(re.consume(new Uint8Array([1]))).toBeNull();
  });

  test('expect resets counters for the next file', () => {
    const re = new FrameReassembler();
    re.expect(1);
    re.consume(new Uint8Array([1, 2, 3, 4]));
    re.expect(2);
    expect(re.received).toBe(0);
    expect(re.done).toBe(false);
    expect(re.consume(new Uint8Array([1]))).not.toBeNull();
    expect(re.consume(new Uint8Array([1]))).not.toBeNull();
    expect(re.done).toBe(true);
  });
});

class FakeChannel implements SendChannel {
  readyState = 'open';
  sends: (string | ArrayBufferLike)[] = [];
  bufferedAmountLowThreshold = 0;
  onbufferedamountlow: (() => void) | null = null;
  held = 0;

  get bufferedAmount(): number {
    return this.held;
  }

  send(data: string | ArrayBufferLike): void {
    this.sends.push(data);
    this.held += typeof data === 'string' ? data.length : data.byteLength;
  }

  /** 模拟 SCTP 把缓冲排空（回到 0），并按事件语义触发低水位回调。 */
  drain(): void {
    this.held = 0;
    const cb = this.onbufferedamountlow;
    if (cb) {
      this.onbufferedamountlow = null;
      cb();
    }
  }
}

describe('PacedSender', () => {
  function makeFile(bytes: number): Blob {
    const data = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i += 1) data[i] = i % 251;
    return new Blob([data]);
  }

  test('sends everything in bursts, hashes match, progress monotonic', async () => {
    const dc = new FakeChannel();
    const sender = new PacedSender(dc);
    const file = makeFile(CHUNK_SIZE * 40 + 10);
    const total = Math.ceil(file.size / CHUNK_SIZE);
    const progress: number[] = [];
    const done = sender.sendFile(file, 'md5', (sent) => progress.push(sent));
    // 首批 32 块立即发出；缓冲超水位后进入等待，由 drain 驱动第二批。
    for (let i = 0; i < 1000 && dc.sends.length < total; i += 1) {
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      if (dc.sends.length < total && dc.bufferedAmount > dc.bufferedAmountLowThreshold) dc.drain();
    }
    const hash = await done;
    expect(dc.sends).toHaveLength(total);
    expect(hash).toBe(await hashFile(file, 'md5'));
    expect(progress[progress.length - 1]).toBe(file.size);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
  });

  test('keeps the buffer bounded by threshold + one burst', async () => {
    const dc = new FakeChannel();
    const sender = new PacedSender(dc);
    const file = makeFile(CHUNK_SIZE * 100);
    const total = 100;
    const done = sender.sendFile(file, 'md5');
    let peak = 0;
    for (let i = 0; i < 3000 && dc.sends.length < total; i += 1) {
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      peak = Math.max(peak, dc.bufferedAmount);
      if (dc.sends.length < total && dc.bufferedAmount > dc.bufferedAmountLowThreshold) dc.drain();
    }
    await done;
    // 水位 16 块 + 单批 32 块 = 1.5MiB 的缓冲上界
    expect(peak).toBeLessThanOrEqual((16 + 32) * CHUNK_SIZE);
    expect(dc.sends).toHaveLength(total);
  });

  test('empty file resolves with empty hash and no chunks', async () => {
    const dc = new FakeChannel();
    const hash = await new PacedSender(dc).sendFile(new Blob([]), 'md5');
    expect(hash).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(dc.sends).toHaveLength(0);
  });

  test('cancel rejects an in-flight send', async () => {
    const dc = new FakeChannel();
    const sender = new PacedSender(dc);
    const done = sender.sendFile(makeFile(CHUNK_SIZE * 64), 'md5');
    for (let i = 0; i < 1000 && dc.sends.length === 0; i += 1) {
      await new Promise((resolve) => { setTimeout(resolve, 0); });
    }
    expect(dc.sends.length).toBeGreaterThan(0);
    sender.cancel();
    await expect(done).rejects.toThrowError(/send canceled/);
  });

  test('closed channel throws', async () => {
    const dc = new FakeChannel();
    dc.readyState = 'closed';
    await expect(new PacedSender(dc).sendFile(makeFile(CHUNK_SIZE * 40), 'md5')).rejects.toThrowError(/data channel closed/);
  });
});

describe('EventQueue', () => {
  test('serializes async handlers in enqueue order', async () => {
    const log: string[] = [];
    const queue = new EventQueue<number>(async (item) => {
      log.push(`start ${item}`);
      await new Promise((resolve) => { setTimeout(resolve, item === 1 ? 20 : 1); });
      log.push(`end ${item}`);
    });
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    await queue.drain();
    expect(log).toEqual(['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3']);
  });

  test('a failing handler does not stall the queue', async () => {
    const errors: unknown[] = [];
    const seen: number[] = [];
    const queue = new EventQueue<number>(async (item) => {
      if (item === 2) throw new Error('boom');
      seen.push(item);
    }, (error) => { errors.push(error); });
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    await queue.drain();
    expect(seen).toEqual([1, 3]);
    expect(errors).toHaveLength(1);
  });
});

describe('ChunkAssembler', () => {
  test('accumulates and assembles blob', async () => {
    const assembler = new ChunkAssembler();
    assembler.push(new Uint8Array([1, 2, 3]).buffer);
    assembler.push(new Uint8Array([4, 5]));
    expect(assembler.received).toBe(5);
    const blob = assembler.finish();
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    expect(() => assembler.finish()).toThrowError(/无法重复完成/);
    expect(() => assembler.push(new Uint8Array([6]))).toThrowError(/无法继续写入/);
  });

  test('dispose frees parts and blocks further use', async () => {
    const assembler = new ChunkAssembler();
    assembler.push(new Uint8Array([1, 2]));
    assembler.dispose();
    expect(() => assembler.finish()).toThrowError();
  });
});

describe('shouldWarnHuge', () => {
  test('only above 1GB', () => {
    expect(shouldWarnHuge(1024 * 1024 * 1024)).toBe(false);
    expect(shouldWarnHuge(1024 * 1024 * 1024 + 1)).toBe(true);
  });
});
