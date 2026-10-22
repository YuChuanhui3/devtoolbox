import { beforeAll, describe, expect, test } from 'vitest';
import {
  ChunkAssembler,
  CHUNK_SIZE,
  encodeControl,
  parseControl,
  shouldWarnHuge,
  sliceFile,
  type ControlFrame,
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
    { t: 'hello', agent: 'iPhone · Safari' },
    { t: 'text', id: 'a1', body: '你好', ts: 1 },
    { t: 'meta', id: 'a1', name: 'IMG_0001.jpg', size: 12345, mime: 'image/jpeg' },
    { t: 'accept', id: 'a1' },
    { t: 'reject', id: 'a1' },
    { t: 'begin', id: 'a1' },
    { t: 'done', id: 'a1' },
    { t: 'cancel', id: 'a1' },
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
    expect(() => parseControl('{"t":"meta","id":"x"}')).toThrowError(/缺少字段 name/);
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
