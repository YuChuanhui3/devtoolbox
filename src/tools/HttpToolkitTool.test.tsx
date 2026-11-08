import { describe, expect, test } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
    // 导航上五个一级页签：REST / 实时 / OpenAPI / Mock / 压测。
    expect(screen.getByRole('tab', { name: 'REST' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /实时/ })).toBeInTheDocument();
  });

  test('真页签的 mode 不被改写', () => {
    renderTool('/tools/http-simulator?mode=mock');
    expect(screen.getByTestId('location')).toHaveTextContent('?mode=mock');
  });
});

describe('HttpToolkitTool 状态栏取数通道', () => {
  test('ShieldCheck 按钮弹出代理源气泡，四类源齐全，选中程序源可填地址', async () => {
    renderTool('/tools/http-simulator');
    const channelButton = screen.getByRole('button', { name: /取数通道/ });

    // 初始关闭：没有气泡。
    expect(screen.queryByRole('dialog', { name: /取数通道/ })).toBeNull();

    fireEvent.click(channelButton);
    const dialog = await screen.findByRole('dialog', { name: /取数通道/ });
    for (const label of ['浏览器', '网络', '程序', '浏览器扩展']) {
      expect(within(dialog).getByRole('button', { name: label })).toBeInTheDocument();
    }

    // 选中「程序」出现地址输入框，输入后通道状态更新（程序源 mode 回落 direct）。
    fireEvent.click(within(dialog).getByRole('button', { name: '程序' }));
    const programInput = within(dialog).getByLabelText('本地代理程序地址');
    fireEvent.change(programInput, { target: { value: 'http://127.0.0.1:8080' } });

    // 头部关闭按钮收掉气泡。
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog', { name: /取数通道/ })).toBeNull();
  });

  test('状态栏右侧的集合侧栏开关与请求面板内的切换按钮同步', () => {
    renderTool('/tools/http-simulator');
    // 状态栏与面板内各有一个同名开关，用 footer 作用域锁定状态栏那个。
    const statusbar = document.querySelector('.wb-statusbar');
    expect(statusbar).not.toBeNull();
    const statusbarToggle = within(statusbar as HTMLElement).getByRole('button', { name: '切换集合侧栏' });
    expect(statusbarToggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(statusbarToggle);
    expect(statusbarToggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('.wb-request-layout')).toHaveClass('wb-sidebar-hidden');

    // 再点状态栏按钮恢复展开。
    fireEvent.click(statusbarToggle);
    expect(statusbarToggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('.wb-request-layout')).not.toHaveClass('wb-sidebar-hidden');
  });

  test('状态栏不再展示「本地存储」文字', () => {
    renderTool('/tools/http-simulator');
    expect(screen.queryByText('本地存储')).toBeNull();
  });
});

describe('HttpToolkitTool 状态栏页签导航开关', () => {
  test('默认收起只露图标，展开后图标下方出现名称，再点收起', () => {
    renderTool('/tools/http-simulator');
    const navigation = document.querySelector('.wb-navigation');
    const toggle = screen.getByRole('button', { name: /折叠页签导航|展开页签导航/ });

    // 默认收起：导航栏收窄、标签隐藏、图标为「展开」态。五个 tab 始终可访问。
    expect(navigation).toHaveClass('wb-nav-collapsed');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('title', '展开页签导航');
    expect(screen.getByRole('tab', { name: 'REST' })).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(navigation).not.toHaveClass('wb-nav-collapsed');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('title', '折叠页签导航');
    // 展开后五个一级页签的名称都在图标下方。
    for (const label of ['REST', '实时', 'OpenAPI', 'Mock', '压测']) {
      expect(screen.getByRole('tab', { name: label })).toHaveTextContent(label);
    }

    fireEvent.click(toggle);
    expect(navigation).toHaveClass('wb-nav-collapsed');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('HttpToolkitTool 实时协议页签', () => {
  test('导航上是五个一级页签，实时协议聚合在「实时」内', () => {
    renderTool('/tools/http-simulator');
    for (const label of ['REST', '实时', 'OpenAPI', 'Mock']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    // 默认页签是 REST；没有任何 iframe 或上游启动屏。
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.body.textContent).not.toContain('npm run api:start');
  });

  test('?mode=websocket 折进实时页签并落到 WebSocket 协议（proto 缺省）', async () => {
    renderTool('/tools/http-simulator?mode=websocket');
    expect(screen.getByTestId('location')).toHaveTextContent('?mode=realtime');
    expect(screen.getByTestId('location')).not.toHaveTextContent('proto=');
    expect(screen.getByRole('tab', { name: '实时' })).toHaveAttribute('aria-selected', 'true');
    // 协议 tab 渲染：WebSocket 选中，SSE/Socket.IO/MQTT 同屏可切换。
    expect(await screen.findByRole('tab', { name: 'WebSocket' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'SSE' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Socket.IO' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'MQTT' })).toBeInTheDocument();
  });

  test('?mode=sse 折进实时页签并带 proto=sse', async () => {
    renderTool('/tools/http-simulator?mode=sse');
    expect(screen.getByTestId('location')).toHaveTextContent('?mode=realtime&proto=sse');
    expect(await screen.findByRole('tab', { name: 'SSE' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('SSE 地址')).toBeInTheDocument();
  });

  test('?mode=socketio 折进实时页签并带 proto=socketio', async () => {
    renderTool('/tools/http-simulator?mode=socketio');
    expect(screen.getByTestId('location')).toHaveTextContent('?mode=realtime&proto=socketio');
    expect(await screen.findByRole('tab', { name: 'Socket.IO' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Socket.IO 服务地址')).toBeInTheDocument();
  });

  test('?mode=mqtt 折进实时页签并带 proto=mqtt', async () => {
    renderTool('/tools/http-simulator?mode=mqtt');
    expect(screen.getByTestId('location')).toHaveTextContent('?mode=realtime&proto=mqtt');
    expect(await screen.findByRole('tab', { name: 'MQTT' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Broker 地址')).toBeInTheDocument();
  });

  test('?mode=realtime 直达实时页签，默认 WebSocket 协议', async () => {
    renderTool('/tools/http-simulator?mode=realtime');
    expect(screen.getByRole('tab', { name: '实时' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('tab', { name: 'WebSocket' })).toHaveAttribute('aria-selected', 'true');
  });

  test('?mode=realtime&proto=mqtt 直达 MQTT 协议', async () => {
    renderTool('/tools/http-simulator?mode=realtime&proto=mqtt');
    expect(await screen.findByLabelText('Broker 地址')).toBeInTheDocument();
  });

  test('?engine=local 与裸路径行为一致（引擎参数已被移除，忽略即可）', () => {
    renderTool('/tools/http-simulator?engine=local');
    expect(screen.getByRole('tab', { name: 'REST' })).toHaveAttribute('aria-selected', 'true');
  });
});
