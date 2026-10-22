import { ToolError } from './errors';

export const CHUNK_SIZE = 16 * 1024;
export const HUGE_FILE_BYTES = 1024 * 1024 * 1024;

export type ControlFrame =
  | { t: 'hello'; agent: string }
  | { t: 'text'; id: string; body: string; ts: number }
  | { t: 'meta'; id: string; name: string; size: number; mime: string }
  | { t: 'accept'; id: string }
  | { t: 'reject'; id: string }
  | { t: 'begin'; id: string }
  | { t: 'done'; id: string }
  | { t: 'cancel'; id: string };

const FRAME_TYPES = new Set(['hello', 'text', 'meta', 'accept', 'reject', 'begin', 'done', 'cancel']);

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
  switch (t) {
    case 'hello':
      return { t, agent: str('agent') };
    case 'text':
      return { t, id: str('id'), body: str('body'), ts: num('ts') };
    case 'meta':
      return { t, id: str('id'), name: str('name'), size: num('size'), mime: str('mime') };
    case 'accept':
    case 'reject':
    case 'begin':
    case 'done':
    case 'cancel':
      return { t, id: str('id') };
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
