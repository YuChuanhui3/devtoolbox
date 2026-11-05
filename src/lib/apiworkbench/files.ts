import { newId } from './id';

/**
 * multipart 文件字节的临时栖息地：只活在这一页的内存里，刷新即失，绝不进 localStorage。
 * 存储里的 WbPart 只有 fileName/fileSize/mime 加一个 fileRef，发送时靠它来这儿取字节。
 */
const held = new Map<string, File>();

export function newFileRef(): string {
  return newId();
}

export function holdFile(ref: string, file: File): void {
  held.set(ref, file);
}

export function readFile(ref?: string): File | undefined {
  return ref ? held.get(ref) : undefined;
}

export function dropFile(ref?: string): void {
  if (ref) held.delete(ref);
}

/** 单测与「切换请求」时清场用。 */
export function clearHeldFiles(): void {
  held.clear();
}
