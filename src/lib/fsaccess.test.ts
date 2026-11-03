import { describe, expect, test } from 'vitest';
import {
  cleanupEmptyDirs,
  flattenDirectory,
  flattenFileList,
  hasFsAccess,
  readDataTransfer,
  removeLocalFile,
  type DroppedEntry,
} from './fsaccess';

interface FakeFileNode { kind: 'file'; name: string; size: number; lastModified: number }
interface FakeDirNode { kind: 'directory'; name: string; children: FakeNode[] }
type FakeNode = FakeFileNode | FakeDirNode;

// 构建一次性的可变句柄树：removeEntry 真正作用于共享 Map，多次遍历看到同一状态。
function buildHandle(node: FakeNode, recorder: string[]): unknown {
  if (node.kind === 'file') {
    return {
      kind: 'file',
      name: node.name,
      getFile: async () => ({ name: node.name, size: node.size, lastModified: node.lastModified }),
    };
  }
  const children = new Map<string, unknown>();
  for (const child of node.children) children.set(child.name, buildHandle(child, recorder));
  return {
    kind: 'directory',
    name: node.name,
    async *entries(): AsyncGenerator<[string, unknown]> {
      for (const [name, child] of children) yield [name, child];
    },
    getDirectoryHandle: async (name: string) => {
      const child = children.get(name);
      if (!child) throw new Error(`NotFoundError ${name}`);
      return child;
    },
    getFileHandle: async (name: string) => {
      const child = children.get(name);
      if (!child) throw new Error(`NotFoundError ${name}`);
      return child;
    },
    removeEntry: async (name: string) => {
      if (!children.delete(name)) throw new Error(`NotFoundError ${name}`);
      recorder.push(`remove ${node.name}/${name}`);
    },
  };
}

const asDir = (node: FakeNode): FileSystemDirectoryHandle => buildHandle(node, []) as FileSystemDirectoryHandle;

function tree(): { root: FakeDirNode; recorder: string[] } {
  const root: FakeDirNode = {
    kind: 'directory',
    name: 'proj',
    children: [
      { kind: 'file', name: 'readme.md', size: 100, lastModified: 1 },
      {
        kind: 'directory',
        name: 'src',
        children: [
          { kind: 'file', name: 'a.ts', size: 10, lastModified: 2 },
          {
            kind: 'directory',
            name: 'deep',
            children: [{ kind: 'file', name: 'b.ts', size: 20, lastModified: 3 }],
          },
        ],
      },
      { kind: 'directory', name: 'logs', children: [] },
    ],
  };
  return { root, recorder: [] };
}

describe('hasFsAccess', () => {
  test('false in jsdom (no pickers)', () => {
    expect(hasFsAccess()).toBe(false);
  });
});

describe('flattenDirectory', () => {
  test('recurses with prefix and keys by slash-joined path', async () => {
    const flat = await flattenDirectory(asDir(tree().root), ['proj']);
    expect(Object.keys(flat).sort()).toEqual([
      'proj/readme.md',
      'proj/src/a.ts',
      'proj/src/deep/b.ts',
    ].sort());
    expect(flat['proj/src/a.ts'].size).toBe(10);
    expect(flat['proj/src/a.ts'].lastModified).toBe(2);
    expect(await flat['proj/readme.md'].getFile()).toMatchObject({ size: 100 });
  });
});

describe('flattenFileList', () => {
  test('uses webkitRelativePath when present', () => {
    const mk = (name: string, rel: string, size: number): File => {
      const file = new File(['x'], name);
      Object.defineProperty(file, 'webkitRelativePath', { value: rel });
      Object.defineProperty(file, 'size', { value: size });
      return file;
    };
    const flat = flattenFileList([mk('a.ts', 'proj/src/a.ts', 5), mk('solo.png', '', 9)]);
    expect(Object.keys(flat).sort()).toEqual(['proj/src/a.ts', 'solo.png']);
    expect(flat['proj/src/a.ts'].size).toBe(5);
  });
});

describe('cleanupEmptyDirs / removeLocalFile', () => {
  test('removes emptied dirs deepest-first, keeps non-empty ones', async () => {
    const { root, recorder } = tree();
    const handle = buildHandle(root, recorder) as FileSystemDirectoryHandle;
    await removeLocalFile(handle, 'src/deep/b.ts');
    expect(recorder).toContain('remove deep/b.ts');
    // 按已删除的 key 回收：deep 变空应删；src 仍有 a.ts 不该删；logs 从未有文件，
    // 只有当 deletedKeys 提到它时才作为候选出现。
    await cleanupEmptyDirs(handle, ['src/deep/b.ts', 'logs/x.txt']);
    expect(recorder).toContain('remove src/deep');
    expect(recorder).toContain('remove proj/logs');
    expect(recorder).not.toContain('remove proj/src');
  });

  test('chains bottom-up when a parent becomes empty', async () => {
    const recorder: string[] = [];
    const root: FakeDirNode = {
      kind: 'directory',
      name: 'proj',
      children: [
        { kind: 'directory', name: 'src', children: [{ kind: 'directory', name: 'deep', children: [] }] },
        { kind: 'file', name: 'keep.txt', size: 1, lastModified: 1 },
      ],
    };
    const handle = buildHandle(root, recorder) as FileSystemDirectoryHandle;
    await cleanupEmptyDirs(handle, ['src/deep/a.ts']);
    expect(recorder).toContain('remove src/deep');
    expect(recorder).toContain('remove proj/src');
    expect(recorder).not.toContain('remove proj/keep.txt');
  });

  test('tolerates missing paths', async () => {
    const handle = asDir(tree().root);
    await expect(cleanupEmptyDirs(handle, ['nope/x/a.ts'])).resolves.toBeUndefined();
  });
});

describe('readDataTransfer', () => {
  const fileEntry = (name: string, contents: string) => ({
    isFile: true,
    isDirectory: false,
    name,
    file: (ok: (f: File) => void) => { ok(new File([contents], name)); },
  });
  const dirEntry = (name: string, batches: unknown[][], chunk = 1) => {
    const flat = batches.flat(1);
    const queue: unknown[][] = [];
    for (let i = 0; i < flat.length; i += chunk) queue.push(flat.slice(i, i + chunk));
    queue.push([]); // readEntries 分批返回，必须循环取到空批
    return {
      isFile: false,
      isDirectory: true,
      name,
      createReader: () => ({
        readEntries: (ok: (batch: unknown[]) => void) => { ok(queue.shift() ?? []); },
      }),
    };
  };

  const asDT = (entries: unknown[]): DataTransfer => ({
    items: entries.map((entry) => ({ kind: 'file', webkitGetAsEntry: () => entry })),
    files: [],
  } as unknown as DataTransfer);

  test('walks nested directories with directory-prefixed paths', async () => {
    const dropped: DroppedEntry[] = await readDataTransfer(asDT([
      dirEntry('proj', [
        [fileEntry('a.ts', 'aaa')],
        [dirEntry('src', [[fileEntry('b.ts', 'bb')]])],
      ]),
      fileEntry('top.txt', 't'),
    ]));
    expect(dropped.map((d) => d.path.join('/')).sort()).toEqual(['proj/a.ts', 'proj/src/b.ts', 'top.txt']);
    expect(dropped.find((d) => d.path.join('/') === 'proj/src/b.ts')?.file.size).toBe(2);
  });

  test('falls back to dt.files when entries API missing', async () => {
    const dt = { items: [], files: [new File(['12'], 'x.txt')] } as unknown as DataTransfer;
    const dropped = await readDataTransfer(dt);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].path).toEqual(['x.txt']);
  });
});
