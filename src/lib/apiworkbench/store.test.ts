import { beforeEach, describe, expect, test } from 'vitest';
import {
  MAX_COLLECTIONS,
  MAX_HISTORY_ENTRIES,
  WORKBENCH_STORAGE_KEY,
  countRequests,
  emptyWorkbench,
  loadWorkbench,
  sanitizeWorkbench,
  saveWorkbench,
} from './store';
import { MAX_SOCKETS } from './ws';
import { WB_METHODS } from './types';
import type { WbCollection, WbFolder, WorkbenchDoc } from './types';

function folder(name: string, requests: number, childFolders: WbFolder[] = []): WbFolder {
  return {
    id: `f-${name}`,
    name,
    folders: childFolders,
    requests: Array.from({ length: requests }, (_, i) => ({
      id: `r-${name}-${i}`,
      name: `req-${i}`,
      method: 'GET' as const,
      url: 'https://example.com',
      headers: [],
      body: { mode: 'none' as const, text: '' },
      auth: { type: 'none' as const },
    })),
  };
}

function collection(name: string, requests: number): WbCollection {
  return { id: `c-${name}`, name, root: folder(name, requests), variables: [] };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('sanitizeWorkbench', () => {
  test('非对象输入回退空文档，绝不 throw', () => {
    for (const raw of [null, undefined, 42, 'x', [], true]) {
      expect(sanitizeWorkbench(raw)).toEqual(emptyWorkbench());
    }
  });

  test('保存的 WebSocket 连接逐项清洗并限额', () => {
    const doc = sanitizeWorkbench({
      sockets: [
        { id: 's1', name: '', url: ' wss://a.test/echo ', protocols: [' chat ', '', ' chat ', 'v2'], note: 'n' },
        { url: 'wss://b.test' },
        { url: '   ' },
        { url: 'wss://c.test', protocols: 'not-an-array' },
        'junk',
      ],
    });
    expect(doc.sockets).toHaveLength(3);
    expect(doc.sockets[0]).toMatchObject({ name: 'wss://a.test/echo', url: 'wss://a.test/echo', protocols: ['chat', 'v2'] });
    expect(doc.sockets[1].name).toBe('wss://b.test');
    expect(doc.sockets[2].protocols).toEqual([]);

    const capped = sanitizeWorkbench({
      sockets: Array.from({ length: MAX_SOCKETS + 20 }, (_, i) => ({ url: `wss://a.test/${i}` })),
    });
    expect(capped.sockets).toHaveLength(MAX_SOCKETS);

    saveWorkbench(capped);
    expect(loadWorkbench().sockets).toHaveLength(MAX_SOCKETS);
  });

  test('脏字段逐项回退默认值', () => {
    const doc = sanitizeWorkbench({
      collections: [
        {
          id: 'c1',
          name: 123,
          root: {
            id: 'f1',
            requests: [
              { id: 'r1', method: 'TEAPOT', url: 'https://a', headers: 'nope', body: { mode: 'weird' } },
              { url: 'https://b', auth: { type: 'oauth' } },
              { noUrl: true },
            ],
          },
          variables: [{ key: '  k  ', value: 'v', enabled: true }, { key: '  ' }, 'junk'],
        },
        'junk',
      ],
      environments: [{ id: 'e1', name: 'Env', variables: [] }, 7],
      activeEnvId: 'ghost',
      mockRoutes: [{ path: '/a', status: 'x' }, { path: '' }],
      history: [{ request: { url: 'https://h' }, bodyExcerpt: 'x'.repeat(10_000) }, 3],
    });
    expect(doc.collections).toHaveLength(1);
    const root = doc.collections[0].root;
    expect(root.name).toBe('Folder');
    expect(root.requests[0].method).toBe('GET');
    expect(root.requests[0].headers).toEqual([]);
    expect(root.requests[0].body).toEqual({ mode: 'none', text: '' });
    expect(root.requests[1].auth).toEqual({ type: 'none' });
    expect(root.requests[1].name).toBe('https://b');
    expect(root.requests).toHaveLength(2);
    expect(doc.collections[0].variables.map((v) => v.key)).toEqual(['k']);
    expect(doc.activeEnvId).toBeNull();
    expect(doc.mockRoutes[0].status).toBe(200);
    expect(doc.history[0].bodyExcerpt.length).toBe(4000);
    expect(doc.history).toHaveLength(1);
  });

  test('activeEnvId 仅在指向存在的环境时保留', () => {
    const doc = sanitizeWorkbench({
      environments: [{ id: 'e1', name: 'Env', variables: [] }],
      activeEnvId: 'e1',
    });
    expect(doc.activeEnvId).toBe('e1');
  });

  test('集合数量与请求总数限额', () => {
    const many = Array.from({ length: MAX_COLLECTIONS + 10 }, (_, i) => collection(`c${i}`, 5));
    expect(sanitizeWorkbench({ collections: many }).collections).toHaveLength(MAX_COLLECTIONS);

    const big = sanitizeWorkbench({ collections: [collection('huge', 900)] });
    expect(countRequests(big.collections[0].root)).toBeLessThanOrEqual(800);
  });

  test('历史条数限额且新条目在前保留', () => {
    const history = Array.from({ length: 150 }, (_, i) => ({
      id: `h${i}`,
      at: i,
      request: { url: `https://e${i}`, method: 'GET' },
      status: 200,
    }));
    const doc = sanitizeWorkbench({ history });
    expect(doc.history).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(doc.history[0].request.url).toBe('https://e0');
  });

  test('嵌套文件夹深度受限', () => {
    let deep: WbFolder = { id: 'leaf', name: 'leaf', folders: [], requests: [] };
    for (let i = 0; i < 20; i += 1) deep = { id: `d${i}`, name: `d${i}`, folders: [deep], requests: [] };
    const doc = sanitizeWorkbench({ collections: [{ id: 'c', name: 'c', root: deep, variables: [] }] });
    let node = doc.collections[0].root;
    let depth = 0;
    while (node.folders.length > 0) {
      node = node.folders[0];
      depth += 1;
    }
    expect(depth).toBeLessThanOrEqual(10);
  });
});

describe('load/save roundtrip', () => {
  test('save 后 load 拿回同构数据；空存储返回空文档', () => {
    expect(loadWorkbench()).toEqual(emptyWorkbench());
    const doc: WorkbenchDoc = {
      ...emptyWorkbench(),
      collections: [collection('demo', 2)],
      environments: [{ id: 'e1', name: 'Dev', variables: [{ id: 'v1', key: 'baseUrl', value: 'https://x', enabled: true }] }],
      activeEnvId: 'e1',
    };
    expect(saveWorkbench(doc)).toBe(true);
    const loaded = loadWorkbench();
    expect(loaded.collections[0].name).toBe('demo');
    expect(countRequests(loaded.collections[0].root)).toBe(2);
    expect(loaded.activeEnvId).toBe('e1');
  });

  test('损坏的存储内容不阻塞加载', () => {
    window.localStorage.setItem(WORKBENCH_STORAGE_KEY, '{not json');
    expect(loadWorkbench()).toEqual(emptyWorkbench());
  });

  test('WB_METHODS 覆盖常见 REST 方法', () => {
    expect(WB_METHODS).toContain('PATCH');
  });
});
