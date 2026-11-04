import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { CollectionTree } from './CollectionTree';
import { blankRequest, newCollection } from '@/lib/apiworkbench/tree';
import type { WorkbenchDoc } from '@/lib/apiworkbench/types';

const downloadText = vi.fn();
const downloadBlob = vi.fn();
vi.mock('@/lib/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/download')>()),
  downloadText: (...args: [string, string, string?]) => downloadText(...args),
  downloadBlob: (...args: [string, Blob]) => downloadBlob(...args),
}));

function docWith(collections: WorkbenchDoc['collections']): WorkbenchDoc {
  return { version: 1, collections, environments: [], activeEnvId: null, history: [], mockEnabled: false, mockRoutes: [] };
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
          onImportPostman={() => undefined}
        />
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('CollectionTree Postman 导入导出入口', () => {
  beforeEach(() => {
    useAppStore.setState({ locale: 'zh' });
    downloadText.mockClear();
    downloadBlob.mockClear();
  });

  afterEach(cleanup);

  test('空集合时也提供导入入口', () => {
    renderTree();
    expect(screen.getByRole('button', { name: '导入 Postman 集合' })).toBeInTheDocument();
  });

  test('集合行导出的文件是 v2.1 JSON，含头/体/auth', async () => {
    const collection = newCollection('Local');
    const request = {
      ...blankRequest(),
      name: 'R1',
      headers: [{ key: 'X-A', value: '1', enabled: true }],
      body: { mode: 'json' as const, text: '{"a":1}' },
      auth: { type: 'bearer' as const, token: 'tkn' },
    };
    collection.root.requests = [request];
    renderTree(docWith([collection]));

    await userEvent.click(screen.getByRole('button', { name: '导出' }));
    expect(downloadText).toHaveBeenCalledTimes(1);
    const [filename, text, mime] = downloadText.mock.calls[0];
    expect(filename).toBe('Local.postman_collection.json');
    expect(mime).toContain('application/json');
    const parsed = JSON.parse(text) as { info: { schema: string }; item: { request: Record<string, unknown> }[] };
    expect(parsed.info.schema).toContain('v2.1.0');
    expect(parsed.item).toHaveLength(1);
    expect(parsed.item[0].request).toMatchObject({
      method: 'GET',
      header: [{ key: 'X-A', value: '1', disabled: false }],
      body: { mode: 'raw', raw: '{"a":1}', options: { raw: { language: 'json' } } },
      auth: { type: 'bearer', bearer: [{ key: 'token', value: 'tkn' }] },
    });
  });
});
