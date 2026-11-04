import { describe, expect, it } from 'vitest';
import { bytesToBase64 } from './base64';
import {
  DQX_LIMITS,
  FrameAssembler,
  crc32OfPayload,
  encodeFrame,
  gzipBytes,
  inflatePayloadBytes,
  makeSessionId,
  parseFrame,
  sniffPayloadKind,
  splitFrames,
  tuneFrameBytes,
} from './qr-transfer';

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('DQX1 frame codec', () => {
  it('encodes and parses a middle frame', () => {
    const data = bytes('hello world payload!!'); // 21 字节，对齐 3 的倍数（发送端切块规则）
    const text = encodeFrame('abc123', 2, 9, data);
    expect(text.startsWith('DQX1:abc123::2of9:')).toBe(true);
    const frame = parseFrame(text);
    expect(frame).not.toBeNull();
    expect(frame!.sid).toBe('abc123');
    expect(frame!.index).toBe(2);
    expect(frame!.total).toBe(9);
    expect(new TextDecoder().decode(frame!.data)).toBe('hello world payload!!');
    expect(frame!.crc).toBeUndefined();
  });

  it('carries session meta on the first frame only', () => {
    const data = bytes('x'.repeat(30));
    const first = encodeFrame('abc123', 0, 2, data, { fileName: '配置.json', rawBytes: 30, gzipped: true });
    const parsed = parseFrame(first)!;
    expect(parsed.meta).toEqual({ fileName: '配置.json', rawBytes: 30, gzipped: true });
    const second = encodeFrame('abc123', 1, 2, data, { fileName: '配置.json' }, 'DEADBEEF');
    const parsedSecond = parseFrame(second)!;
    expect(parsedSecond.meta).toBeUndefined();
    expect(parsedSecond.crc).toBe('DEADBEEF');
  });

  it('rejects non-protocol and malformed frames', () => {
    expect(parseFrame('https://example.com')).toBeNull();
    expect(parseFrame('DQX1:AB!CD::0of1:AAA=')).toBeNull();
    expect(parseFrame('DQX1:abc123::5of3:QUJD')).toBeNull();
    expect(parseFrame('DQX1:abc123::0of1:not_base64!!')).toBeNull();
  });

  it('makes ids that parse back', () => {
    const sid = makeSessionId();
    expect(sid).toMatch(/^[0-9a-z]{6}$/);
    expect(parseFrame(encodeFrame(sid, 0, 1, bytes('a'), undefined, crc32OfPayload(bytes('a'))))).not.toBeNull();
  });
});

describe('splitFrames + FrameAssembler roundtrip', () => {
  it('reassembles a multi-frame payload in order', () => {
    const payload = bytes(JSON.stringify({ items: Array.from({ length: 400 }, (_, i) => ({ id: i, name: `n${i}` })) }));
    const { frames, frameBytes } = splitFrames(payload, { sid: 's1aaaa', frameBytes: 300, fileName: 'data.json', rawBytes: payload.length });
    expect(frameBytes % 3).toBe(0);
    expect(frames.length).toBeGreaterThan(3);
    const assembler = new FrameAssembler();
    let complete: { payload: Uint8Array } | null = null;
    for (const text of frames) {
      const event = assembler.push(text);
      if (event.kind === 'complete') complete = event;
    }
    expect(complete).not.toBeNull();
    expect(Buffer.from(complete!.payload)).toEqual(Buffer.from(payload));
  });

  it('tolerates duplicates and out-of-order frames', () => {
    const payload = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 256));
    const { frames } = splitFrames(payload, { sid: 's2bbbb', frameBytes: 150 });
    const shuffled = [...frames.slice(3), ...frames.slice(0, 3)];
    const assembler = new FrameAssembler();
    const events = shuffled.map((text) => assembler.push(text));
    events.push(assembler.push(frames[0]));
    events.push(assembler.push(frames[1]));
    expect(events.filter((e) => e.kind === 'ignored' && e.reason === 'duplicate').length).toBeGreaterThan(0);
    const complete = events.concat(shuffled.map((text) => assembler.push(text))).find((e) => e.kind === 'complete');
    expect(complete?.kind).toBe('complete');
    if (complete?.kind === 'complete') expect(Buffer.from(complete.payload)).toEqual(Buffer.from(payload));
  });

  it('stays incomplete while frames are missing', () => {
    const payload = bytes('y'.repeat(700));
    const { frames } = splitFrames(payload, { sid: 's3cccc', frameBytes: 100 });
    const assembler = new FrameAssembler();
    for (const text of frames.slice(0, -2)) assembler.push(text);
    const view = assembler.view('s3cccc')!;
    expect(view.received).toBe(frames.length - 2);
    expect(view.missing).toEqual([frames.length - 2, frames.length - 1]);
    expect(assembler.sessionsList().length).toBe(1);
  });

  it('reports CRC mismatch when a frame carries corrupt bytes', () => {
    const payload = bytes('z'.repeat(500));
    const { frames } = splitFrames(payload, { sid: 's4dddd', frameBytes: 100 });
    const assembler = new FrameAssembler();
    const parts = frames[0].split(':');
    // 长度仍为 3 的倍数（无 padding），但字节内容被错读，CRC 必须报警。
    parts[4] = bytesToBase64(bytes('2'.repeat(99)));
    const tampered = [parts.join(':'), ...frames.slice(1)];
    let mismatch = false;
    for (const text of tampered) {
      const event = assembler.push(text);
      if (event.kind === 'mismatch') mismatch = true;
      if (event.kind === 'complete') mismatch = false;
    }
    expect(mismatch).toBe(true);
  });

  it('keeps concurrent sessions separate', () => {
    const a = splitFrames(bytes('A'.repeat(240)), { sid: 'saaaaa', frameBytes: 80 });
    const b = splitFrames(bytes('B'.repeat(240)), { sid: 'sbbbbb', frameBytes: 80 });
    const assembler = new FrameAssembler();
    for (let i = 0; i < a.frames.length; i += 1) {
      assembler.push(a.frames[i]);
      assembler.push(b.frames[i]);
    }
    const viewA = assembler.view('saaaaa')!;
    expect(viewA.received).toBe(viewA.total);
    expect(Buffer.from(assembler.payloadBytes('saaaaa'))).toEqual(Buffer.from(bytes('A'.repeat(240))));
    expect(Buffer.from(assembler.payloadBytes('sbbbbb'))).toEqual(Buffer.from(bytes('B'.repeat(240))));
  });

  it('handles an empty payload with a single frame', () => {
    const { frames } = splitFrames(new Uint8Array(0), { sid: 'seeeee', frameBytes: 100 });
    expect(frames.length).toBe(1);
    const assembler = new FrameAssembler();
    const event = assembler.push(frames[0]);
    expect(event.kind).toBe('complete');
    if (event.kind === 'complete') expect(event.payload.length).toBe(0);
  });

  it('ignores a mid-frame whose total conflicts with the session', () => {
    const assembler = new FrameAssembler();
    assembler.push(encodeFrame('sfffff', 0, 3, bytes('aaa')));
    const event = assembler.push(encodeFrame('sfffff', 1, 4, bytes('bbb')));
    expect(event).toEqual({ kind: 'ignored', reason: 'conflict' });
  });

  it('restarts the session when frame 0 declares a new total', () => {
    const assembler = new FrameAssembler();
    assembler.push(encodeFrame('sfffff', 0, 3, bytes('aaa'), { fileName: 'old.txt' }));
    assembler.push(encodeFrame('sfffff', 1, 3, bytes('bbb')));
    assembler.push(encodeFrame('sfffff', 2, 3, bytes('ccc')));
    const restarted = assembler.push(encodeFrame('sfffff', 0, 2, bytes('ddd'), { fileName: 'new.txt' }));
    expect(restarted.kind).toBe('progress');
    const view = assembler.view('sfffff')!;
    expect(view.total).toBe(2);
    expect(view.received).toBe(1);
    expect(view.meta?.fileName).toBe('new.txt');
    assembler.push(encodeFrame('sfffff', 1, 2, bytes('eee')));
    expect(Buffer.from(assembler.payloadBytes('sfffff'))).toEqual(Buffer.from(bytes('dddeee')));
  });

  it('lists the most recently touched session first', () => {
    const assembler = new FrameAssembler();
    assembler.push(encodeFrame('aaaaaa', 0, 2, bytes('x')));
    assembler.push(encodeFrame('bbbbbb', 0, 1, bytes('y'), undefined, crc32OfPayload(bytes('y'))));
    assembler.push(encodeFrame('aaaaaa', 1, 2, bytes('z')));
    expect(assembler.sessionsList().map((view) => view.sid)).toEqual(['aaaaaa', 'bbbbbb']);
  });
});

describe('payload helpers', () => {
  it('gzips and inflates back to the original bytes', async () => {
    const payload = bytes('{"repeat":"value"}'.repeat(200));
    const compressed = await gzipBytes(payload);
    expect(compressed[0]).toBe(0x1f);
    expect(compressed[1]).toBe(0x8b);
    expect(compressed.length).toBeLessThan(payload.length);
    const restored = await inflatePayloadBytes(compressed);
    expect(Buffer.from(restored)).toEqual(Buffer.from(payload));
  });

  it('passes raw non-gzip payloads through', async () => {
    const payload = bytes('plain text');
    expect(await inflatePayloadBytes(payload)).toBe(payload);
  });
});

describe('resource limits', () => {
  it('rejects frames declaring too many parts or oversized payloads', () => {
    expect(parseFrame(encodeFrame('abc123', 0, DQX_LIMITS.maxTotalFrames + 1, bytes('aaa')))).toBeNull();
    const fat = 'A'.repeat(10924); // 解码后 8193 字节，刚好超过单帧上限
    expect(parseFrame(`DQX1:abc123::0of2:${fat}`)).toBeNull();
  });

  it('ignores new sessions past the session cap', () => {
    const assembler = new FrameAssembler();
    for (let i = 0; i < DQX_LIMITS.maxSessions; i += 1) {
      assembler.push(encodeFrame(`s${i.toString(36).padStart(5, '0')}`, 0, 2, bytes('aaa')));
    }
    const event = assembler.push(encodeFrame('zzzzzz', 0, 2, bytes('bbb')));
    expect(event).toEqual({ kind: 'ignored', reason: 'overflow' });
    expect(assembler.has('zzzzzz')).toBe(false);
  });

  it('caps a session at the byte limit', () => {
    const assembler = new FrameAssembler();
    const chunk = new Uint8Array(10 * 1024 * 1024);
    assembler.push({ sid: 'cap123', index: 0, total: 3, data: chunk });
    assembler.push({ sid: 'cap123', index: 1, total: 3, data: chunk });
    const overflowing = assembler.push({ sid: 'cap123', index: 2, total: 3, data: chunk });
    expect(overflowing).toEqual({ kind: 'ignored', reason: 'overflow' });
    expect(assembler.view('cap123')!.received).toBe(2);
  });

  it('bounds the missing-frame preview but counts them all', () => {
    const assembler = new FrameAssembler();
    const total = 300;
    assembler.push(encodeFrame('ms1234', total - 1, total, bytes('xyz'), undefined, crc32OfPayload(new Uint8Array(0))));
    const view = assembler.view('ms1234')!;
    expect(view.missing.length).toBe(DQX_LIMITS.missingPreview);
    expect(view.missingCount).toBe(total - 1);
  });

  it('aborts inflating a decompression bomb', async () => {
    const bomb = new Uint8Array(DQX_LIMITS.maxInflatedBytes + 1024); // 全零，压缩后极小
    const compressed = await gzipBytes(bomb);
    await expect(inflatePayloadBytes(compressed)).rejects.toThrow();
  });
});

describe('tuneFrameBytes', () => {
  it('binary-searches the largest validating size', () => {
    const limit = 800;
    const validate = (frameBytes: number) => frameBytes + 55 <= limit;
    expect(tuneFrameBytes(60, 3000, validate)).toBe(744);
    expect(tuneFrameBytes(60, 700, validate)).toBe(699);
    expect(tuneFrameBytes(60, 100, () => false)).toBe(0);
  });
});

describe('sniffPayloadKind', () => {
  const head = (magic: number[], filler = 0x00) => Uint8Array.from([...magic, filler, filler]);

  it('reads containers as already-packed', () => {
    // docx / xlsx / pptx 都是 ZIP 容器；jar、apk、epub 同理
    expect(sniffPayloadKind(head([0x50, 0x4b, 0x03, 0x04]))).toBe('container');
    expect(sniffPayloadKind(head([0x52, 0x61, 0x72, 0x21]))).toBe('container'); // RAR
    expect(sniffPayloadKind(head([0x37, 0x7a, 0xbc, 0xaf]))).toBe('container'); // 7z
    expect(sniffPayloadKind(head([0x1f, 0x8b]))).toBe('container'); // gzip
  });

  it('reads bitmaps as images, including RIFF....WEBP', () => {
    expect(sniffPayloadKind(head([0x89, 0x50, 0x4e, 0x47]))).toBe('image');
    expect(sniffPayloadKind(head([0xff, 0xd8, 0xff]))).toBe('image');
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46, 8, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffPayloadKind(webp)).toBe('image');
  });

  it('sees UTF-8 Chinese and GBK-ish text as text, not binary', () => {
    expect(sniffPayloadKind(bytes('{"客户":["张三","李四"]}\n'))).toBe('text');
    // GBK 里大量字节 ≥0x80，按 ASCII 比例判会把它当二进制
    const gbk = Uint8Array.from(Array.from({ length: 400 }, (_, i) => (i % 90 === 0 ? 0x0a : 0x80 + (i % 100))));
    expect(sniffPayloadKind(gbk)).toBe('text');
  });

  it('falls back to other for real binary and empty payloads', () => {
    const elf = new Uint8Array(256);
    elf.set([0x7f, 0x45, 0x4c, 0x46]);
    elf[4] = 0x00;
    expect(sniffPayloadKind(elf)).toBe('other');
    expect(sniffPayloadKind(new Uint8Array(0))).toBe('other');
  });
});
