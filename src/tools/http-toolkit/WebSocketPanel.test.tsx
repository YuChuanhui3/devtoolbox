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
  binaryType = 'blob';
  sent: Array<string | Uint8Array> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols === undefined ? [] : Array.isArray(protocols) ? protocols : [protocols];
    FakeWebSocket.instances.push(this);
  }

  send(data: string | Uint8Array) {
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

  emit(data: unknown) {
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

function connectedSocket(url = 'wss://echo.test/ws') {
  setUrl(url);
  fireEvent.click(screen.getByRole('button', { name: '连接' }));
  const socket = FakeWebSocket.instances[0];
  socket.open();
  return socket;
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

  test('二进制帧可切文本/Base64/十六进制看法，字节统计按真实长度', () => {
    renderPanel();
    const socket = connectedSocket();
    expect(socket.binaryType).toBe('arraybuffer');

    socket.emit(new TextEncoder().encode('hello').buffer);
    expect(logLine((text) => text === 'hello')).toBeDefined();
    expect(screen.getByText('5 B')).toBeInTheDocument();

    socket.emit(new Uint8Array([0, 0x11, 0xab]).buffer);
    expect(logLine((text) => text.includes('[二进制 3 B · 非 UTF-8]'))).toBeDefined();
    expect(screen.getByText('收到 2 条')).toBeInTheDocument();
    // 8 = hello 的 5 字节 + 那一帧的 3 字节，摘要文字的长度不算数
    expect(screen.getByText('8 B')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Base64' }));
    expect(logLine((text) => text === 'ABGr')).toBeDefined();
    expect(logLine((text) => text === 'aGVsbG8=')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: '十六进制' }));
    expect(logLine((text) => text === '00 11 ab')).toBeDefined();
    expect(logLine((text) => text === '68 65 6c 6c 6f')).toBeDefined();
    // 换看法不影响文本行
    expect(logLine((text) => text.includes('连接已建立'))).toBeDefined();
  });

  test('十六进制模式按字节发出，非法输入拦在发送之前', () => {
    renderPanel();
    const socket = connectedSocket();
    fireEvent.click(screen.getByRole('tab', { name: '二进制帧（十六进制）' }));
    fireEvent.change(screen.getByLabelText('消息内容'), { target: { value: '0x00 11 22 ab' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0]).toBeInstanceOf(Uint8Array);
    expect([...(socket.sent[0] as Uint8Array)]).toEqual([0, 17, 34, 171]);
    expect(logLine((text) => text.includes('[二进制 4 B · 非 UTF-8]'))).toBeDefined();

    fireEvent.change(screen.getByLabelText('消息内容'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(screen.getByText(/十六进制内容不合法/)).toBeInTheDocument();
    expect(socket.sent).toHaveLength(1);
  });

  test('复用记录带着发送格式，十六进制历史不会被当文本发出去', () => {
    renderPanel();
    const socket = connectedSocket();
    fireEvent.change(screen.getByLabelText('消息内容'), { target: { value: 'plain text' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(socket.sent[0]).toBe('plain text');

    fireEvent.click(screen.getByRole('tab', { name: '二进制帧（十六进制）' }));
    fireEvent.change(screen.getByLabelText('消息内容'), { target: { value: 'de ad' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect([...(socket.sent[1] as Uint8Array)]).toEqual([0xde, 0xad]);

    // 手动切回文本帧，再从历史里挑那串十六进制：格式必须跟着历史条目一起回来
    fireEvent.click(screen.getByRole('tab', { name: '文本帧' }));
    fireEvent.click(screen.getByLabelText('复用上次的消息'));
    fireEvent.click(screen.getByRole('option', { name: 'HEX de ad' }));
    expect(screen.getByRole('tab', { name: '二进制帧（十六进制）' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('消息内容')).toHaveValue('de ad');
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect([...(socket.sent[2] as Uint8Array)]).toEqual([0xde, 0xad]);
  });
});
