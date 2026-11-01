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

  it('ignores conflicting totals for the same sid', () => {
    const assembler = new FrameAssembler();
    assembler.push(encodeFrame('sfffff', 0, 3, bytes('aaa')));
    const event = assembler.push(encodeFrame('sfffff', 1, 4, bytes('bbb')));
    expect(event).toEqual({ kind: 'ignored', reason: 'conflict' });
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
