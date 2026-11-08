import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { CollectionTree } from './CollectionTree';
import { blankRequest, newCollection } from '@/lib/apiworkbench/tree';
import type { WorkbenchDoc } from '@/lib/apiworkbench/types';

const downloadText = vi.fn();
vi.mock('@/lib/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/download')>()),
  downloadText: (...args: [string, string, string?]) => downloadText(...args),
}));

function docWith(collections: WorkbenchDoc['collections']): WorkbenchDoc {
  return { version: 2, collections, environments: [], activeEnvId: null, history: [], mockEnabled: false, mockRoutes: [], sockets: [] };
}

function renderTree(doc = docWith([])) {
  return render(
    <I18nProvider>
      <ToastProvider>
        <CollectionTree
          doc={doc}
          update={() => undefined}
          selectedRequestId={null}
          onSelectRequest={() => undefined}
          onNewRequest={() => undefined}
          onImport={() => undefined}
        />
      </ToastProvider>
    </I18nProvider>,
  );
}

function collectionWith(requests: WorkbenchDoc['collections'][0]['root']['requests']) {
  const collection = newCollection('Local');
  collection.root.requests = requests;
  return collection;
}

describe('CollectionTree 导入导出入口', () => {
  beforeEach(() => {
    useAppStore.setState({ locale: 'zh' });
    downloadText.mockClear();
  });

  afterEach(cleanup);

  test('空集合时也提供导入入口', () => {
    renderTree();
    expect(screen.getByRole('button', { name: '导入集合（Postman / Hoppscotch / HAR）' })).toBeInTheDocument();
  });

  test('导出弹窗默认 Postman v2.1，含头/体/auth 与并进 URL 的参数', async () => {
    const collection = collectionWith([
      {
        ...blankRequest(),
        name: 'R1',
        url: 'https://api.test/r?x=1',
        params: [{ key: 'x', value: '1', enabled: true }],
        headers: [{ key: 'X-A', value: '1', enabled: true }],
        body: { mode: 'json' as const, text: '{"a":1}' },
        auth: { type: 'bearer' as const, token: 'tkn' },
      },
    ]);
    renderTree(docWith([collection]));
    await userEvent.click(screen.getByRole('button', { name: '导出集合' }));
    const dialog = await screen.findByRole('dialog', { name: '导出集合「Local」' });
    await userEvent.click(within(dialog).getByRole('button', { name: '下载 JSON' }));

    expect(downloadText).toHaveBeenCalledTimes(1);
    const [filename, text, mime] = downloadText.mock.calls[0];
    expect(filename).toBe('Local.postman_collection.json');
    expect(mime).toContain('application/json');
    const parsed = JSON.parse(text) as { info: { schema: string }; item: { request: Record<string, unknown> }[] };
    expect(parsed.info.schema).toContain('v2.1.0');
    expect(parsed.item).toHaveLength(1);
    expect(parsed.item[0].request).toMatchObject({
      method: 'GET',
      url: { raw: 'https://api.test/r?x=1' },
      header: [{ key: 'X-A', value: '1', disabled: false }],
      body: { mode: 'raw', raw: '{"a":1}', options: { raw: { language: 'json' } } },
      auth: { type: 'bearer', bearer: [{ key: 'token', value: 'tkn' }] },
    });
  });

  test('切到 Hoppscotch 后导出他们的 v12 集合数组', async () => {
    renderTree(docWith([collectionWith([{ ...blankRequest(), name: 'R1', url: 'https://api.test/r' }])]));
    await userEvent.click(screen.getByRole('button', { name: '导出集合' }));
    const dialog = await screen.findByRole('dialog', { name: '导出集合「Local」' });
    await userEvent.click(within(dialog).getByRole('tab', { name: 'Hoppscotch v12' }));
    await userEvent.click(within(dialog).getByRole('button', { name: '下载 JSON' }));

    const [filename, text] = downloadText.mock.calls[0];
    expect(filename).toBe('Local.hoppscotch-collection.json');
    const parsed = JSON.parse(text) as { v: number; requests: Record<string, unknown>[] }[];
    expect(parsed[0].v).toBe(12);
    expect(parsed[0].requests[0]).toMatchObject({ v: '1', endpoint: 'https://api.test/r' });
  });

  test('搜索按名称与 URL 过滤，文件夹名命中就整支留下', () => {
    const collection = newCollection('Local');
    const keep = { ...blankRequest(), name: 'List users', url: 'https://api.test/users' };
    const drop = { ...blankRequest(), name: 'Delete thing', url: 'https://api.test/other' };
    collection.root.folders = [{ id: 'f1', name: 'Users', folders: [], requests: [keep, drop] }];
    renderTree(docWith([collection]));

    const search = screen.getByRole('textbox', { name: '搜索集合内请求' });
    fireEvent.change(search, { target: { value: 'list' } });
    expect(screen.getByText('List users')).toBeInTheDocument();
    expect(screen.queryByText('Delete thing')).not.toBeInTheDocument();

    // 命中文件夹名意味着找的是这一组，不该只挑出其中名字对得上的那条。
    fireEvent.change(search, { target: { value: 'users' } });
    expect(screen.getByText('Delete thing')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'no-such-thing' } });
    expect(screen.getByText(/没有匹配/)).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByText('List users')).toBeInTheDocument();
  });
});
