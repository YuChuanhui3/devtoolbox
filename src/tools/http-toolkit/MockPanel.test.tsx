import { beforeEach, describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import { MockPanel } from './MockPanel';
import { WorkbenchProvider } from './WorkbenchContext';

beforeEach(() => {
  localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      collections: [],
      environments: [],
      activeEnvId: null,
      mockEnabled: false,
      mockRoutes: [
        { id: 'r1', enabled: true, method: 'GET', path: '/users/:id', status: 200, headers: [], body: '{"id":"{{params.id}}"}', delayMs: 0 },
      ],
      history: [],
    }),
  );
  useAppStore.setState({ locale: 'zh' });
});

function renderPanel() {
  render(
    <I18nProvider>
      <ToastProvider>
        <WorkbenchProvider>
          <MockPanel active />
        </WorkbenchProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('MockPanel', () => {
  test('探测框实时显示命中与渲染结果', () => {
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText('输入路径，如 /users/42'), { target: { value: '/users/9' } });
    expect(screen.getByText((_, node) => !!node && node.tagName === 'SPAN' && /^命中 GET \/users\/:id → 200$/.test(node.textContent ?? ''))).toBeInTheDocument();
    expect(screen.getByText((_, node) => !!node && node.tagName === 'PRE' && (node.textContent ?? '').includes('"id":"9"'))).toBeInTheDocument();
  });

  test('拨动开关后生效路由数更新', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('switch', { name: '拦截开关' }));
    expect(screen.getByText('1 条路由生效中')).toBeInTheDocument();
  });
});
