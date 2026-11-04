import { describe, expect, test } from 'vitest';
import { emptyWorkbench } from './store';
import { blankRequest, findRequest, newCollection, putRequest, removeRequest, updateFolder, walkRequests } from './tree';
import type { WbCollection } from './types';

function fixture(): { collection: WbCollection; childId: string } {
  const req = blankRequest();
  const child = { id: 'child', name: 'Child', folders: [], requests: [req] };
  const collection = {
    ...newCollection('Demo'),
    root: { id: 'root', name: 'root', folders: [child], requests: [] },
  };
  return { collection, childId: child.id };
}

describe('tree ops', () => {
  test('walkRequests 深度优先收集', () => {
    const { collection } = fixture();
    expect(walkRequests(collection.root)).toHaveLength(1);
  });

  test('putRequest 替换深层已有请求', () => {
    const { collection } = fixture();
    const original = collection.root.folders[0].requests[0];
    const next = putRequest(collection, { ...original, name: 'renamed' });
    expect(findRequest({ ...emptyWorkbench(), collections: [next] }, original.id)?.name).toBe('renamed');
  });

  test('putRequest 新请求落入目标文件夹', () => {
    const { collection, childId } = fixture();
    const added = putRequest(collection, blankRequest(), childId);
    expect(added.root.folders[0].requests).toHaveLength(2);
    expect(added.root.requests).toHaveLength(0);
  });

  test('putRequest 未知文件夹 id 不新增', () => {
    const { collection } = fixture();
    const added = putRequest(collection, blankRequest(), 'ghost');
    expect(added.root.folders[0].requests).toHaveLength(1);
    expect(added.root.requests).toHaveLength(0);
  });

  test('removeRequest 跨层删除', () => {
    const { collection } = fixture();
    const id = collection.root.folders[0].requests[0].id;
    const next = removeRequest(collection, id);
    expect(walkRequests(next.root)).toHaveLength(0);
  });

  test('updateFolder 只变换目标文件夹', () => {
    const { collection, childId } = fixture();
    const next = updateFolder(collection, childId, (f) => ({ ...f, name: 'Renamed' }));
    expect(next.root.name).toBe('root');
    expect(next.root.folders[0].name).toBe('Renamed');
  });

  test('updateFolder 未知 id 原样返回', () => {
    const { collection } = fixture();
    expect(updateFolder(collection, 'ghost', (f) => ({ ...f, name: 'X' }))).toEqual(collection);
  });
});
