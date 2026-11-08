import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import HttpToolkitTool from './HttpToolkitTool';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

/** 搜索面板只会写 `?mode=<subFeatures id>`，二级区域要在工具根上折成 `?sub=`。 */
function renderTool(entry: string) {
  localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      collections: [],
      environments: [],
      activeEnvId: null,
      mockEnabled: false,
      mockRoutes: [],
      history: [],
    }),
  );
  useAppStore.setState({ locale: 'zh' });
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/tools/http-simulator"
          element={
            <>
              <LocationProbe />
              <I18nProvider>
                <ToastProvider>
                  <HttpToolkitTool />
                </ToastProvider>
              </I18nProvider>
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HttpToolkitTool 二级寻址', () => {
  test('?mode=graphql 折回请求页签并带上 sub', () => {
    renderTool('/tools/http-simulator?mode=graphql');
    expect(screen.getByTestId('location')).toHaveTextContent('?sub=graphql');
    expect(screen.getByRole('tab', { name: /WebSocket/ })).toBeInTheDocument();
  });

  test('真页签的 mode 不被改写', () => {
    renderTool('/tools/http-simulator?mode=mock');
    expect(screen.getByTestId('location')).toHaveTextContent('?mode=mock');
  });
});

describe('HttpToolkitTool 实时协议页签', () => {
  test('五个协议页签都在导航上（本地引擎，无上游 iframe）', () => {
    renderTool('/tools/http-simulator');
    for (const label of ['REST', 'WebSocket', 'SSE', 'Socket.IO', 'MQTT', 'OpenAPI', 'Mock']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    // 默认页签是 REST；没有任何 iframe 或上游启动屏。
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.body.textContent).not.toContain('npm run api:start');
  });

  test('?mode=websocket 直达 WebSocket 页签（不再落 iframe）', () => {
    renderTool('/tools/http-simulator?mode=websocket');
    expect(screen.getByTestId('location')).toHaveTextContent('?mode=websocket');
    expect(screen.getByRole('tab', { name: 'WebSocket' })).toHaveAttribute('aria-selected', 'true');
  });

  test('?mode=sse 直达 SSE 页签', async () => {
    renderTool('/tools/http-simulator?mode=sse');
    expect(screen.getByTestId('location')).toHaveTextContent('?mode=sse');
    expect(screen.getByRole('tab', { name: 'SSE' })).toHaveAttribute('aria-selected', 'true');
    // 面板组件是 lazy 的，等待动态 import 解析后断言内容。
    expect(await screen.findByLabelText('SSE 地址')).toBeInTheDocument();
  });

  test('?mode=socketio 直达 Socket.IO 页签', async () => {
    renderTool('/tools/http-simulator?mode=socketio');
    expect(screen.getByTestId('location')).toHaveTextContent('?mode=socketio');
    expect(screen.getByRole('tab', { name: 'Socket.IO' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Socket.IO 服务地址')).toBeInTheDocument();
  });

  test('?mode=mqtt 直达 MQTT 页签', async () => {
    renderTool('/tools/http-simulator?mode=mqtt');
    expect(screen.getByTestId('location')).toHaveTextContent('?mode=mqtt');
    expect(screen.getByRole('tab', { name: 'MQTT' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Broker 地址')).toBeInTheDocument();
  });

  test('?engine=local 与裸路径行为一致（引擎参数已被移除，忽略即可）', () => {
    renderTool('/tools/http-simulator?engine=local');
    expect(screen.getByRole('tab', { name: 'REST' })).toHaveAttribute('aria-selected', 'true');
  });
});
