import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import { RequestPanel } from './RequestPanel';
import { WorkbenchProvider } from './WorkbenchContext';

function seedDoc(overrides: Record<string, unknown> = {}) {
  localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      collections: [],
      environments: [],
      activeEnvId: null,
      mockEnabled: false,
      mockRoutes: [],
      history: [],
      ...overrides,
    }),
  );
}

function seedMockDoc() {
  seedDoc({
    mockEnabled: true,
    mockRoutes: [
      {
        id: 'r1',
        enabled: true,
        method: 'GET',
        path: '/users/:id',
        status: 201,
        headers: [],
        body: '{"id":"{{params.id}}"}',
        delayMs: 0,
      },
    ],
  });
}

function renderPanel() {
  render(
    <I18nProvider>
      <ToastProvider>
        <WorkbenchProvider>
          <RequestPanel active />
        </WorkbenchProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ locale: 'zh' });
  vi.unstubAllGlobals();
});

describe('RequestPanel mock interception', () => {
  test('命中路由时零网络调用并展示 Mock 徽标', async () => {
    seedMockDoc();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    fireEvent.change(screen.getByLabelText('请求 URL'), { target: { value: 'https://api.test/users/42' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('Mock 命中')).toBeInTheDocument();
    expect(screen.getByText('201')).toBeInTheDocument();
    expect(await screen.findByText((_, node) => !!node?.classList.contains('json-string') && node.textContent === '"42"')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('未命中时照常走网络', async () => {
    seedMockDoc();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'hello',
      headers: new Headers(),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    fireEvent.change(screen.getByLabelText('请求 URL'), { target: { value: 'https://api.test/orders' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('hello')).toBeInTheDocument();
  });
});

const POSTMAN_V21_WITH_SCRIPT = JSON.stringify({
  info: { name: 'Demo API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [
    { name: 'Ping', request: { method: 'GET', url: 'https://api.test/ping' } },
    {
      name: 'Pong',
      event: [{ listen: 'test', script: { exec: ['pm.test("x", () => pm.expect(1).to.be(1));'] } }],
      request: { method: 'POST', url: 'https://api.test/pong', body: { mode: 'raw', raw: 'hi' } },
    },
  ],
});

describe('RequestPanel Postman 导入', () => {
  test('粘贴集合 JSON → 导入为新集合并提示跳过的脚本', async () => {
    seedDoc();
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '导入 Postman 集合' }));
    const dialog = await screen.findByRole('dialog', { name: '导入 Postman 集合' });
    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: POSTMAN_V21_WITH_SCRIPT } });
    fireEvent.click(screen.getByRole('button', { name: '导入为新集合' }));

    expect(await screen.findByText(/已导入「Demo API」，共 2 个请求/)).toBeInTheDocument();
    expect(screen.getByText(/已跳过：request-script/)).toBeInTheDocument();
    const headers = screen.getAllByText('Demo API').filter((node) => node.tagName === 'SPAN');
    expect(headers.length).toBeGreaterThan(0);
    expect(screen.getByText('Ping')).toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();
  });

  test('非法 JSON 报错但不关闭弹窗', async () => {
    seedDoc();
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '导入 Postman 集合' }));
    const dialog = await screen.findByRole('dialog', { name: '导入 Postman 集合' });
    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: 'not json' } });
    fireEvent.click(screen.getByRole('button', { name: '导入为新集合' }));

    expect(await screen.findByText(/不是合法 JSON/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '导入 Postman 集合' })).toBeInTheDocument();
  });
});
