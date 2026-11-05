import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import { WebSocketPanel } from './WebSocketPanel';
import { WorkbenchProvider } from './WorkbenchContext';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  protocols: string[];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols === undefined ? [] : Array.isArray(protocols) ? protocols : [protocols];
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000, reason = '') {
    this.readyState = 3;
    act(() => {
      this.onclose?.({ code, reason });
    });
  }

  open() {
    this.readyState = 1;
    act(() => {
      this.onopen?.();
    });
  }

  emit(data: string) {
    act(() => {
      this.onmessage?.({ data });
    });
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      collections: [],
      environments: [
        { id: 'e1', name: '测试环境', variables: [{ key: 'host', value: 'echo.test', enabled: true }] },
      ],
      activeEnvId: 'e1',
      sockets: [{ id: 's1', name: '订单推送', url: 'wss://orders.test/ws', protocols: ['chat.proto'] }],
      mockEnabled: false,
      mockRoutes: [],
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
          <WebSocketPanel active />
        </WorkbenchProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

function setUrl(value: string) {
  fireEvent.change(screen.getByLabelText('WebSocket 地址'), { target: { value } });
}

function pickSavedConnection(name: string) {
  fireEvent.click(screen.getByLabelText('已保存的连接'));
  fireEvent.click(screen.getByRole('option', { name }));
}

function logLine(matcher: (text: string) => boolean) {
  return Array.from(document.querySelectorAll('pre')).find((node) => matcher(node.textContent ?? ''));
}

describe('WebSocketPanel', () => {
  test('连接→发送→收到→断开全链路，子协议透传', () => {
    renderPanel();
    setUrl('wss://echo.test/ws');
    fireEvent.change(screen.getByLabelText('子协议'), { target: { value: 'chat.proto, v2' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));

    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe('wss://echo.test/ws');
    expect(socket.protocols).toEqual(['chat.proto', 'v2']);
    expect(screen.getByText('连接中…')).toBeInTheDocument();

    socket.open();
    expect(screen.getByText('已连接')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('消息内容'), { target: { value: '{"a":1}' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(socket.sent).toEqual(['{"a":1}']);

    socket.emit('{"b":2}');
    expect(logLine((text) => text.includes('"b": 2'))).toBeDefined();
    expect(screen.getByText('收到 1 条')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '断开' }));
    expect(logLine((text) => (text ?? '').includes('连接关闭（1000'))).toBeDefined();
    expect(screen.getByText('已断开')).toBeInTheDocument();
  });

  test('地址与消息都吃环境变量，消息缺变量时不发送', () => {
    renderPanel();
    setUrl('wss://{{host}}/push');
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    expect(FakeWebSocket.instances[0].url).toBe('wss://echo.test/push');

    FakeWebSocket.instances[0].open();
    fireEvent.change(screen.getByLabelText('消息内容'), { target: { value: '{"token":"{{nope}}"}' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(screen.getByText(/变量未定义/)).toBeInTheDocument();
    expect(FakeWebSocket.instances[0].sent).toEqual([]);
  });

  test('未定义变量的地址直接拦下，不创建连接', () => {
    renderPanel();
    setUrl('wss://{{ghost}}/ws');
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    expect(screen.getByText(/ghost/)).toBeInTheDocument();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(screen.getByText('未连接')).toBeInTheDocument();
  });

  test('http:// 地址改写为 ws:// 并提示，不静默改写', () => {
    renderPanel();
    setUrl('http://echo.test/ws');
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    expect(FakeWebSocket.instances[0].url).toBe('ws://echo.test/ws');
    expect(screen.getByText(/已把 http:\/\/ 改写为 ws:\/\//)).toBeInTheDocument();
  });

  test('1006 关闭码给出可读解释', () => {
    renderPanel();
    setUrl('wss://echo.test/ws');
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    FakeWebSocket.instances[0].close(1006, '');
    expect(logLine((text) => /1006 未正常关闭/.test(text))).toBeDefined();
  });

  test('选中已存连接回填地址与子协议，保存后写入 doc.sockets', async () => {
    renderPanel();
    pickSavedConnection('订单推送');
    expect(screen.getByLabelText('WebSocket 地址')).toHaveValue('wss://orders.test/ws');
    expect(screen.getByLabelText('子协议')).toHaveValue('chat.proto');

    setUrl('wss://orders.test/ws?v=2');
    fireEvent.click(screen.getByRole('button', { name: '更新连接' }));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(WORKBENCH_STORAGE_KEY) ?? '{}');
      expect(saved.sockets[0].url).toBe('wss://orders.test/ws?v=2');
    });
  });
});
