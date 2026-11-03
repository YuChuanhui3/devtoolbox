import { describe, expect, test } from 'vitest';
import { diffMaps } from './dirSync';

const stat = (size: number, lastModified = size): { size: number; lastModified: number } => ({ size, lastModified });

describe('diffMaps quick', () => {
  test('sorts keys into add/update/remove/unchanged', async () => {
    const remote = {
      'a/keep.txt': stat(10, 100),
      'a/new.txt': stat(20, 200),
      'b/size.txt': stat(30, 300),
      'b/mtime.txt': stat(40, 400),
    };
    const local = {
      'a/keep.txt': stat(10, 100),
      'a/new.txt': stat(20, 200),
      'b/size.txt': stat(31, 300),
      'b/mtime.txt': stat(40, 999),
      'gone.txt': stat(1, 1),
    };
    const result = await diffMaps(remote, local, 'quick', () => {
      throw new Error('quick mode must not hash');
    });
    expect(result.add).toEqual([]);
    expect(result.update).toEqual(['b/mtime.txt', 'b/size.txt']);
    expect(result.remove).toEqual(['gone.txt']);
    expect(result.unchanged).toEqual(['a/keep.txt', 'a/new.txt']);
  });

  test('missing local file goes to add bucket', async () => {
    const result = await diffMaps({ 'x.txt': stat(5) }, {}, 'quick', async () => { throw new Error('unreachable'); });
    expect(result.add).toEqual(['x.txt']);
  });
});

describe('diffMaps exact', () => {
  test('size-equal entries are resolved by content hash', async () => {
    const remote = { 'same.txt': stat(10, 100), 'diff.txt': stat(10, 100) };
    const local = { 'same.txt': stat(10, 1), 'diff.txt': stat(10, 100) };
    // mtime 不同但内容相同 → unchanged；内容不同 → update
    const result = await diffMaps(remote, local, 'exact', async (key) => ({
      remoteHash: 'h1',
      localHash: key === 'same.txt' ? 'h1' : 'h2',
    }));
    expect(result.unchanged).toEqual(['same.txt']);
    expect(result.update).toEqual(['diff.txt']);
  });

  test('size mismatch short-circuits without hashing', async () => {
    let hashed = 0;
    const result = await diffMaps(
      { 'a.txt': stat(10) },
      { 'a.txt': stat(11) },
      'exact',
      async () => { hashed += 1; return { remoteHash: '', localHash: '' }; },
    );
    expect(result.update).toEqual(['a.txt']);
    expect(hashed).toBe(0);
  });

  test('hashes every candidate with progress, bounded concurrency', async () => {
    const remote: Record<string, { size: number; lastModified: number }> = {};
    const local: Record<string, { size: number; lastModified: number }> = {};
    for (let i = 0; i < 7; i += 1) {
      remote[`f${i}`] = stat(5);
      local[`f${i}`] = stat(5);
    }
    let running = 0;
    let maxRunning = 0;
    const progress: [number, number][] = [];
    const result = await diffMaps(remote, local, 'exact', async (key) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      running -= 1;
      return { remoteHash: Number(key.slice(1)) % 2 === 0 ? 'a' : 'b', localHash: 'a' };
    }, (done, total) => { progress.push([done, total]); });
    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(result.update).toEqual(['f1', 'f3', 'f5']);
    expect(result.unchanged).toEqual(['f0', 'f2', 'f4', 'f6']);
    expect(progress[progress.length - 1]).toEqual([7, 7]);
  });
});
