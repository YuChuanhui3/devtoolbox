import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import { StressPanel } from './StressPanel';
import { WorkbenchProvider } from './WorkbenchContext';

beforeEach(() => {
  localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      environments: [],
      activeEnvId: null,
      mockEnabled: false,
      mockRoutes: [],
      history: [],
      collections: [
        {
          id: 'c1',
          name: 'Demo',
          variables: [],
          root: {
            id: 'f0',
            name: 'root',
            folders: [],
            requests: [
              { id: 'q1', name: 'zen', method: 'GET', url: 'https://api.test/zen', headers: [], body: { mode: 'none', text: '' }, auth: { type: 'none' } },
            ],
          },
        },
      ],
    }),
  );
  useAppStore.setState({ locale: 'zh' });
  vi.unstubAllGlobals();
});

function renderPanel() {
  render(
    <I18nProvider>
      <ToastProvider>
        <WorkbenchProvider>
          <StressPanel active />
        </WorkbenchProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('StressPanel', () => {
  test('跑完 count 计划后展示统计与取消入口', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'ok',
      headers: new Headers(),
    })));
    renderPanel();

    fireEvent.change(screen.getByLabelText('次数'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: '开始压测' }));

    await waitFor(() => expect(screen.getByText('按计划完成')).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText('6 / 0')).toBeInTheDocument();
    expect(screen.getByText('错误率')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始压测' })).toBeInTheDocument();
  });

  test('全 5xx 时熔断并给出错误分类', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => 'busy',
      headers: new Headers(),
    })));
    renderPanel();

    fireEvent.change(screen.getByLabelText('次数'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: '开始压测' }));

    await waitFor(() => expect(screen.getByText(/熔断/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText(/http-5xx ×/)).toBeInTheDocument();
  });
});
