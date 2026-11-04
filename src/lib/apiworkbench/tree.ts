import { newId } from './id';
import type { WbCollection, WbFolder, WbRequest, WorkbenchDoc } from './types';

/** 深度优先遍历全部请求。 */
export function walkRequests(root: WbFolder): WbRequest[] {
  return [...root.requests, ...root.folders.flatMap(walkRequests)];
}

export function findRequest(doc: WorkbenchDoc, requestId: string): WbRequest | null {
  for (const collection of doc.collections) {
    const hit = walkRequests(collection.root).find((r) => r.id === requestId);
    if (hit) return hit;
  }
  return null;
}

/** 按 id 替换任意层级下的请求；不存在则加入目标文件夹（默认根）。 */
export function putRequest(
  collection: WbCollection,
  request: WbRequest,
  folderId: string = collection.root.id,
): WbCollection {
  const replace = (folder: WbFolder): WbFolder => {
    const index = folder.requests.findIndex((r) => r.id === request.id);
    const own = folder.id === folderId && index < 0;
    return {
      ...folder,
      requests: index >= 0
        ? folder.requests.map((r, i) => (i === index ? request : r))
        : own
          ? [...folder.requests, request]
          : folder.requests,
      folders: folder.folders.map(replace),
    };
  };
  return { ...collection, root: replace(collection.root) };
}

export function removeRequest(collection: WbCollection, requestId: string): WbCollection {
  const strip = (folder: WbFolder): WbFolder => ({
    ...folder,
    requests: folder.requests.filter((r) => r.id !== requestId),
    folders: folder.folders.map(strip),
  });
  return { ...collection, root: strip(collection.root) };
}

/** 删除文件夹（连子树）；根文件夹 id 传入时不动。 */
export function removeFolder(collection: WbCollection, folderId: string): WbCollection {
  if (collection.root.id === folderId) return collection;
  const strip = (folder: WbFolder): WbFolder => ({
    ...folder,
    folders: folder.folders.filter((f) => f.id !== folderId).map(strip),
  });
  return { ...collection, root: strip(collection.root) };
}

/** 对指定 id 的文件夹（含根）做变换。 */
export function updateFolder(
  collection: WbCollection,
  folderId: string,
  fn: (folder: WbFolder) => WbFolder,
): WbCollection {
  const apply = (folder: WbFolder): WbFolder =>
    folder.id === folderId ? fn(folder) : { ...folder, folders: folder.folders.map(apply) };
  return { ...collection, root: apply(collection.root) };
}

export function newFolder(name: string): WbFolder {
  return { id: newId(), name, folders: [], requests: [] };
}

export function newCollection(name: string): WbCollection {
  return { id: newId(), name, root: newFolder(name), variables: [] };
}

export function blankRequest(): WbRequest {
  return {
    id: newId(),
    name: 'New request',
    method: 'GET',
    url: 'https://',
    headers: [],
    body: { mode: 'none', text: '' },
    auth: { type: 'none' },
  };
}
