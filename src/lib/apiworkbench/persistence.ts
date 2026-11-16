import { loadWorkbench, sanitizeWorkbench, WORKBENCH_STORAGE_KEY } from './store';
import type { WorkbenchDoc } from './types';

const stores = ['meta', 'collections', 'environments', 'history', 'responses'] as const;
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
  });
}
async function open(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  const req = factory.open('devtoolbox-apiworkbench', 1);
  req.onupgradeneeded = () => stores.forEach((name) => req.result.createObjectStore(name));
  const db = await request(req);
  db.onversionchange = () => db.close();
  return db;
}

export async function persistWorkbench(input: WorkbenchDoc, factory: IDBFactory = indexedDB): Promise<void> {
  const doc = sanitizeWorkbench(input);
  const db = await open(factory);
  try {
    const tx = db.transaction([...stores], 'readwrite');
    const done = committed(tx);
    try {
    for (const name of stores) tx.objectStore(name).clear();
    const { collections, environments, history, ...meta } = doc;
    tx.objectStore('meta').put(meta, 'document');
    collections.forEach((value, i) => tx.objectStore('collections').put(value, i));
    environments.forEach((value, i) => tx.objectStore('environments').put(value, i));
    history.forEach(({ bodyExcerpt, ...value }, i) => {
      tx.objectStore('history').put(value, i);
      tx.objectStore('responses').put(bodyExcerpt, i);
    });
    } catch (error) {
      try { tx.abort(); } catch { /* already aborted */ }
      await done.catch(() => undefined);
      throw error;
    }
    await done;
  } finally { db.close(); }
}

export async function restoreWorkbench(): Promise<WorkbenchDoc> {
  const factory = indexedDB;
  const source = localStorage.getItem(WORKBENCH_STORAGE_KEY);
  const legacy = loadWorkbench();
  const db = await open(factory);
  let restored: WorkbenchDoc | undefined;
  try {
    const tx = db.transaction([...stores], 'readonly');
    const done = committed(tx);
    const [meta, collections, environments, history, responses] = await Promise.all([
      request(tx.objectStore('meta').get('document')),
      ...stores.slice(1).map((name) => request(tx.objectStore(name).getAll())),
    ]);
    await done;
    if (meta) restored = sanitizeWorkbench({ ...meta, collections, environments,
      history: history.map((entry: object, i: number) => ({ ...entry, bodyExcerpt: responses[i] ?? '' })) });
  } finally { db.close(); }
  if (restored) return restored;
  await persistWorkbench(legacy, factory);
  if (localStorage.getItem(WORKBENCH_STORAGE_KEY) === source) localStorage.removeItem(WORKBENCH_STORAGE_KEY);
  return legacy;
}
