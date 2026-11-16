import { restoreWorkbench } from '@/lib/apiworkbench/persistence';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';

/** 假 socket.io 客户端：收集实例与构造参数，模拟连接/事件/ack。 */
class FakeSocket {
  static instances: FakeSocket[] = [];
  connected = false;
  id = 'fake-socket-id';
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  private anyListeners: Array<(event: string, ...args: unknown[]) => void> = [];
  private anyOutListeners: Array<(event: string, ...args: unknown[]) => void> = [];

  constructor(public url: string, public opts?: Record<string, unknown>) {
    FakeSocket.instances.push(this);
  }

  on(event: string, handler: (...args: unknown[]) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), handler]);
    return this;
  }

  onAny(handler: (event: string, ...args: unknown[]) => void) {
    this.anyListeners.push(handler);
    return this;
  }

  offAny() {
    this.anyListeners = [];
  }

  offAnyOutgoing() {
    this.anyOutListeners = [];
  }

  onAnyOutgoing(handler: (event: string, ...args: unknown[]) => void) {
    this.anyOutListeners.push(handler);
    return this;
  }

  emit(event: string, payload: unknown, ack?: (...args: unknown[]) => void) {
    for (const handler of this.anyOutListeners) handler(event, payload);
    // 服务端立即应答 ack，面板应把它记为 ACK 行。
    ack?.call(null, { ok: true });
  }

  disconnect() {
    this.connected = false;
    this.fire('disconnect', 'io client disconnect');
  }

  /** 测试辅助：模拟服务端广播一个事件。 */
  receive(event: string, payload: unknown) {
    for (const handler of this.anyListeners) handler(event, payload);
  }

  /** 测试辅助：模拟连接成功。 */
  open() {
    this.connected = true;
    this.fire('connect');
  }

  fail(message: string) {
    this.fire('connect_error', new Error(message));
  }

  private fire(event: string, ...args: unknown[]) {
    for (const handler of this.listeners.get(event) ?? []) handler(...args);
  }
}

vi.mock('socket.io-client', () => ({
  io: (url: string, opts?: Record<string, unknown>) => new FakeSocket(url, opts),
}));

// 面板从 socket.io-client 命名导入 io 与类型；vi.mock 后 io 是工厂。
// SocketIoPanel 内部 import { io } —— 上面 mock 返回 FakeSocket 构造器即可。

beforeEach(() => {
  FakeSocket.instances = [];
  localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      collections: [],
      environments: [
        { id: 'e1', name: '测试环境', variables: [{ key: 'host', value: 'io.test', enabled: true }], activeEnvId: 'e1' },
      ],
      activeEnvId: 'e1',
      sockets: [{ id: 's1', name: '聊天服务', url: 'http://io.test', kind: 'socketio', socketIoNamespace: '/chat', socketIoQuery: '', socketIoAuth: '' }],
      mockEnabled: false,
      mockRoutes: [],
      history: [],
    }),
  );
  useAppStore.setState({ locale: 'zh' });
});

// 动态导入面板，让 vi.mock 先生效。
const { SocketIoPanel } = await import('./SocketIoPanel');
const { WorkbenchProvider } = await import('./WorkbenchContext');

function renderPanel() {
  render(
    <I18nProvider>
      <ToastProvider>
        <WorkbenchProvider>
          <SocketIoPanel active />
        </WorkbenchProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('SocketIoPanel', () => {
  test('连接后 socket.io-client 以归一化配置构造，open 后状态为已连接', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Socket.IO 服务地址'), { target: { value: 'http://io.test' } });
    fireEvent.change(screen.getByLabelText('命名空间（留空为根）'), { target: { value: '/chat' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));

    await waitFor(async () => {
      expect(FakeSocket.instances).toHaveLength(1);
    });
    const socket = FakeSocket.instances[0]!;
    expect(socket.url).toBe('http://io.test');
    expect(socket.opts?.namespace).toBe('/chat');
    expect(socket.opts?.path).toBe('/socket.io');
    expect(socket.opts?.reconnection).toBe(true);

    act(() => {
      socket.open();
    });
    await waitFor(async () => {
      expect(screen.getAllByText('已连接').length).toBeGreaterThan(0);
    });
  });

  test('发送事件带 ack，服务端应答记入 ACK 日志行', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Socket.IO 服务地址'), { target: { value: 'http://io.test' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    act(() => {
      FakeSocket.instances[0]!.open();
    });
    await waitFor(() => expect(screen.getAllByText('已连接').length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText('事件名'), { target: { value: 'chat message' } });
    fireEvent.change(screen.getByLabelText('事件内容（JSON 或纯文本）'), { target: { value: '{"text":"hi"}' } });
    fireEvent.click(screen.getByRole('button', { name: '发送（带 ack）' }));

    // payload 经 pretty JSON 缩进后断言行内字段，而不是连续子串。
    await waitFor(async () => {
      const log = document.querySelector('.max-h-\\[460px\\]');
      expect(log?.textContent).toContain('chat message');
      expect(log?.textContent).toContain('ACK');
      expect(log?.textContent).toContain('"ok": true');
    });
    // 发出事件也应有 OUT 行（onAnyOutgoing）。
    const log = document.querySelector('.max-h-\\[460px\\]');
    expect(log?.textContent).toContain('OUT');
  });

  test('服务端广播事件经 onAny 记入 IN 日志', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Socket.IO 服务地址'), { target: { value: 'http://io.test' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const socket = FakeSocket.instances[0]!;
    act(() => {
      socket.open();
      socket.receive('notification', { title: '新消息' });
    });
    await waitFor(async () => {
      const log = document.querySelector('.max-h-\\[460px\\]');
      expect(log?.textContent).toContain('notification');
      expect(log?.textContent).toContain('新消息');
    });
  });

  test('连接失败记入错误与日志', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Socket.IO 服务地址'), { target: { value: 'http://io.test' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    act(() => {
      FakeSocket.instances[0]!.fail('invalid namespace');
    });
    await waitFor(async () => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(document.body.textContent).toContain('invalid namespace');
    });
  });

  test('保存连接写入 doc.sockets 且 kind 为 socketio（命名空间随存档）', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Socket.IO 服务地址'), { target: { value: 'http://io.test' } });
    fireEvent.change(screen.getByLabelText('命名空间（留空为根）'), { target: { value: '/chat' } });
    fireEvent.change(screen.getByLabelText('连接名称'), { target: { value: '聊天服务' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(async () => {
      const stored = await restoreWorkbench();
      const saved = stored.sockets.find((item: { url: string }) => item.url === 'http://io.test')!;
      expect(saved.kind).toBe('socketio');
      expect(saved.socketIoNamespace).toBe('/chat');
    });
  });

  test('加载已保存的 socketio 连接回填命名空间', () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('已保存的连接'));
    fireEvent.click(screen.getByRole('option', { name: '聊天服务' }));
    expect((screen.getByLabelText('Socket.IO 服务地址') as HTMLInputElement).value).toBe('http://io.test');
    expect((screen.getByLabelText('命名空间（留空为根）') as HTMLInputElement).value).toBe('/chat');
  });

  test('未连接时发送被拦截且不调客户端', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('事件名'), { target: { value: 'ping' } });
    fireEvent.click(screen.getByRole('button', { name: '发送（带 ack）' }));
    expect(FakeSocket.instances).toHaveLength(0);
    // ToolAlert 的 role=alert 由 tone=error 渲染；未连接错误同步设置，flush 后可见。
    expect(document.body.textContent).toContain('未连接');
  });
});
