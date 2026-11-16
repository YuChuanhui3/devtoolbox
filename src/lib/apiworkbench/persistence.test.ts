import { beforeEach, expect, test, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { persistWorkbench, restoreWorkbench } from './persistence';
import { sanitizeWorkbench, WORKBENCH_STORAGE_KEY } from './store';
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); localStorage.clear(); });
const fixture = () => sanitizeWorkbench({ environments: [{ id: 'env', name: 'Migrated', variables: [] }] });
test('migrates legacy data and reads it again after legacy removal', async () => {
  const doc = fixture();
  localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(doc));
  expect(await restoreWorkbench()).toEqual(doc);
  expect(localStorage.getItem(WORKBENCH_STORAGE_KEY)).toBeNull();
  expect(await restoreWorkbench()).toEqual(doc);
});
test('an aborted write rejects and preserves the previous committed document', async () => {
  const doc = fixture();
  await persistWorkbench(doc);
  const put = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
    const result = put.apply(this, args);
    if (this.name === 'meta') this.transaction.abort();
    return result;
  });
  await expect(persistWorkbench(sanitizeWorkbench(null))).rejects.toBeDefined();
  spy.mockRestore();
  expect(await restoreWorkbench()).toEqual(doc);
});
test('migration failure retains the legacy source', async () => {
  localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(fixture()));
  const spy = vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new Error('unavailable'); });
  await expect(restoreWorkbench()).rejects.toThrow('unavailable');
  expect(localStorage.getItem(WORKBENCH_STORAGE_KEY)).not.toBeNull();
  spy.mockRestore();
});

test('migration transaction abort retains legacy data and can be retried', async () => {
  const doc = fixture();
  localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(doc));
  const put = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
    const result = put.apply(this, args);
    if (this.name === 'meta') this.transaction.abort();
    return result;
  });
  await expect(restoreWorkbench()).rejects.toBeDefined();
  expect(localStorage.getItem(WORKBENCH_STORAGE_KEY)).not.toBeNull();
  spy.mockRestore();
  expect(await restoreWorkbench()).toEqual(doc);
  expect(localStorage.getItem(WORKBENCH_STORAGE_KEY)).toBeNull();
});
