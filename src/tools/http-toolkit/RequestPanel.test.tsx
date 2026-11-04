import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import { RequestPanel } from './RequestPanel';
import { WorkbenchProvider } from './WorkbenchContext';

function seedDoc() {
  localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      collections: [],
      environments: [],
      activeEnvId: null,
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
      history: [],
    }),
  );
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
    seedDoc();
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
    seedDoc();
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
