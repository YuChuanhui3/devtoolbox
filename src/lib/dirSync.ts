import type { DirStat } from './fsaccess';

export interface DiffResult {
  add: string[];
  update: string[];
  remove: string[];
  unchanged: string[];
}

export type DiffMode = 'quick' | 'exact';

/**
 * 目录 diff 三桶（参照 FastSend syncDir）：
 * quick 用 size+mtime；exact 在 size 相同时再比对内容哈希（远端与本地成对计算）。
 * hashPair 由调用方提供（远端走 calcHash/hashResult 帧，本地走增量 hashFile）。
 */
export async function diffMaps(
  remote: Record<string, DirStat>,
  local: Record<string, DirStat>,
  mode: DiffMode,
  hashPair: (key: string) => Promise<{ remoteHash: string; localHash: string }>,
  onProgress?: (done: number, total: number) => void,
): Promise<DiffResult> {
  // 用 Map 而不是对象直接取值：文件名可能撞上 __proto__/toString 等原型键。
  const remoteMap = new Map(Object.entries(remote));
  const localMap = new Map(Object.entries(local));
  const add: string[] = [];
  const update: string[] = [];
  const remove: string[] = [];
  const unchanged: string[] = [];
  const needHash: string[] = [];

  for (const [key, r] of remoteMap) {
    const l = localMap.get(key);
    if (!l) {
      add.push(key);
      continue;
    }
    if (l.size !== r.size) {
      update.push(key);
      continue;
    }
    if (mode === 'quick') {
      if (l.lastModified === r.lastModified) unchanged.push(key);
      else update.push(key);
    } else {
      needHash.push(key);
    }
  }
  for (const key of localMap.keys()) {
    if (!remoteMap.has(key)) remove.push(key);
  }

  const queue = [...needHash];
  let done = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const key = queue.shift();
      if (key === undefined) return;
      const { remoteHash, localHash } = await hashPair(key);
      if (remoteHash === localHash) unchanged.push(key);
      else update.push(key);
      done += 1;
      onProgress?.(done, needHash.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, needHash.length) }, worker));

  const byKey = (a: string, b: string): number => a.localeCompare(b);
  return {
    add: add.sort(byKey),
    update: update.sort(byKey),
    remove: remove.sort(byKey),
    unchanged: unchanged.sort(byKey),
  };
}
