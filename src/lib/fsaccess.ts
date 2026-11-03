import { ToolError } from './errors';
import { ChunkAssembler } from './filedrop';

export interface DirStat {
  size: number;
  lastModified: number;
}

export interface FlatEntry extends DirStat {
  getFile: () => Promise<File>;
}

export type FlatMap = Record<string, FlatEntry>;

// lib.dom 未收录全局 picker，这里做最小声明。
interface PickerWindow extends Window {
  showDirectoryPicker?: (options?: { id?: string }) => Promise<FileSystemDirectoryHandle>;
  showSaveFilePicker?: (options?: {
    id?: string;
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
}

type IterableHandle = FileSystemDirectoryHandle & {
  entries?: () => AsyncIterable<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
  values?: () => AsyncIterable<FileSystemFileHandle | FileSystemDirectoryHandle>;
};

type RemovableHandle = FileSystemFileHandle & { remove?: () => Promise<void> };
type ClosableStream = FileSystemWritableFileStream & {
  close?: () => Promise<void>;
  abort?: () => Promise<void>;
};

/** File System Access API 仅在安全上下文的 Chromium 系可用（Safari/Firefox/HTTP 局域网访问均不可用）。 */
export function hasFsAccess(): boolean {
  return typeof window !== 'undefined'
    && window.isSecureContext === true
    && 'showSaveFilePicker' in window
    && 'showDirectoryPicker' in window;
}

function pickers(): PickerWindow {
  return window as PickerWindow;
}

async function callPicker<T>(promise: Promise<T> | undefined): Promise<T | null> {
  if (!promise) {
    throw new ToolError({ zh: '当前浏览器不支持直接写入本地文件夹', en: 'This browser cannot write to a local folder directly' });
  }
  try {
    return await promise;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw new ToolError({ zh: '选择保存位置失败', en: 'Failed to choose the save location' });
  }
}

export async function pickSaveFile(suggestedName: string): Promise<FileSink | null> {
  const handle = await callPicker(pickers().showSaveFilePicker?.({ suggestedName }));
  if (!handle) return null;
  return makeFileSink(handle);
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  return callPicker(pickers().showDirectoryPicker?.());
}

/** 落盘汇：流式写盘与内存 Blob 两种实现共用，close 后 onBlob 只在内存路径回调。 */
export interface FileSink {
  write(chunk: ArrayBuffer | Uint8Array): Promise<void>;
  close(): Promise<void>;
  /** 取消或校验失败时清理半写文件；旧内核没有 remove() 时静默跳过，由 UI 提示手动删除。 */
  abort(): Promise<void>;
}

export async function makeFileSink(handle: FileSystemFileHandle): Promise<FileSink> {
  const writable = await handle.createWritable();
  return {
    write: (chunk) => writable.write(chunk),
    close: async () => {
      const stream = writable as ClosableStream;
      if (stream.close) await stream.close();
      else await writable.getWriter().close();
    },
    abort: async () => {
      const stream = writable as ClosableStream;
      try {
        if (stream.abort) await stream.abort();
        else if (stream.close) await stream.close();
        else await writable.getWriter().close();
      } catch { /* 已断开则忽略 */ }
      try {
        const removable = handle as RemovableHandle;
        if (removable.remove) await removable.remove();
      } catch { /* 删不掉时由 UI 提示残留 */ }
    },
  };
}

/** 在所选目录下按 path 逐层建目录并打开写流（参照 FastSend 的 create:true 链）。 */
export async function makeFsSink(root: FileSystemDirectoryHandle, path: string[]): Promise<FileSink> {
  let dir = root;
  for (const seg of path.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(seg, { create: true });
  }
  const name = path[path.length - 1];
  const handle = await dir.getFileHandle(name, { create: true });
  return makeFileSink(handle);
}

export function makeMemorySink(onComplete: (blob: Blob) => void): FileSink {
  const assembler = new ChunkAssembler();
  let blob: Blob | null = null;
  return {
    write: async (chunk) => { assembler.push(chunk); },
    close: async () => {
      if (blob) return;
      blob = assembler.finish();
      onComplete(blob);
    },
    abort: async () => { assembler.dispose(); },
  };
}

async function* iterEntries(dir: FileSystemDirectoryHandle): AsyncGenerator<FileSystemFileHandle | FileSystemDirectoryHandle> {
  const handle = dir as IterableHandle;
  if (handle.entries) {
    for await (const [, child] of handle.entries()) yield child;
    return;
  }
  if (handle.values) {
    yield* handle.values();
    return;
  }
  throw new ToolError({ zh: '当前浏览器不支持目录遍历', en: 'This browser cannot enumerate directories' });
}

/** 递归扁平化本地目录：key 为含目录名的 `/` 路径，供与远端 manifest 做 diff。 */
export async function flattenDirectory(dir: FileSystemDirectoryHandle, prefix: string[] = []): Promise<FlatMap> {
  const out: FlatMap = {};
  const walk = async (handle: FileSystemDirectoryHandle, segments: string[]): Promise<void> => {
    for await (const child of iterEntries(handle)) {
      const path = [...segments, child.name];
      if (child.kind === 'file') {
        const file = await child.getFile();
        out[path.join('/')] = { size: file.size, lastModified: file.lastModified, getFile: () => child.getFile() };
      } else {
        await walk(child, path);
      }
    }
  };
  await walk(dir, prefix);
  return out;
}

/** 把 File[]（含 webkitdirectory 的相对路径）扁平化为同一坐标的 FlatMap。 */
export function flattenFileList(files: File[]): FlatMap {
  const out: FlatMap = {};
  for (const file of files) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const path = rel && rel.length > 0 ? rel.split('/') : [file.name];
    out[path.join('/')] = { size: file.size, lastModified: file.lastModified, getFile: () => Promise.resolve(file) };
  }
  return out;
}

/** 删除文件后回收变空的父目录：候选目录深→浅逐个判空 removeEntry（参照 FastSend cleanupEmptyDirs）。 */
export async function cleanupEmptyDirs(root: FileSystemDirectoryHandle, deletedKeys: string[]): Promise<void> {
  const dirs = new Set<string>();
  for (const key of deletedKeys) {
    const segs = key.split('/');
    for (let i = 1; i <= segs.length - 1; i += 1) dirs.add(segs.slice(0, i).join('/'));
  }
  const sorted = [...dirs].sort((a, b) => b.split('/').length - a.split('/').length);
  for (const rel of sorted) {
    const segs = rel.split('/');
    try {
      const target = await walkTo(root, segs);
      let empty = true;
      for await (const _child of iterEntries(target)) {
        void _child;
        empty = false;
        break;
      }
      if (!empty) continue;
      const parent = segs.length > 1 ? await walkTo(root, segs.slice(0, -1)) : root;
      await parent.removeEntry(segs[segs.length - 1], { recursive: false });
    } catch { /* 目录已被他人改动等情况直接跳过 */ }
  }
}

async function walkTo(root: FileSystemDirectoryHandle, segs: string[]): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const seg of segs) dir = await dir.getDirectoryHandle(seg);
  return dir;
}

/** 从本地 FlatMap 中删除一个文件（目录同步 remove 桶执行）。 */
export async function removeLocalFile(root: FileSystemDirectoryHandle, key: string): Promise<void> {
  const segs = key.split('/');
  const parent = await walkTo(root, segs.slice(0, -1));
  await parent.removeEntry(segs[segs.length - 1], { recursive: false });
}

export interface DroppedEntry {
  file: File;
  /** 拖拽目录内的相对路径（目录名开头），普通文件为 [name]。 */
  path: string[];
}

/**
 * 递归读取拖放条目（FastSend 不支持拖文件夹，我们补上）。
 * items 必须在同步阶段取完，await 之后 DataTransfer 会失效。
 */
export async function readDataTransfer(dt: DataTransfer): Promise<DroppedEntry[]> {
  const roots: FileSystemEntry[] = [];
  const items = Array.from(dt.items ?? []);
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }
  if (roots.length === 0) {
    return Array.from(dt.files ?? []).map((file) => ({ file, path: [file.name] }));
  }
  const out: DroppedEntry[] = [];
  const readFile = (entry: FileSystemFileEntry, path: string[]): Promise<void> =>
    new Promise((resolve, reject) => {
      entry.file(
        (file) => { out.push({ file, path }); resolve(); },
        (error) => reject(error),
      );
    });
  const readAllEntries = async (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => {
    const acc: FileSystemEntry[] = [];
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (batch.length === 0) return acc;
      acc.push(...batch);
    }
  };
  const walk = async (entry: FileSystemEntry, prefix: string[]): Promise<void> => {
    const path = [...prefix, entry.name];
    if (entry.isFile) {
      await readFile(entry as FileSystemFileEntry, path);
    } else if (entry.isDirectory) {
      const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
      for (const child of children) await walk(child, path);
    }
  };
  // 顶层文件直接以本身命名；顶层目录把目录名作为路径首段。
  for (const entry of roots) await walk(entry, []);
  return out;
}
