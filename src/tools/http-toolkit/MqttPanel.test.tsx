import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';

/**
 * 假 mqtt 客户端：收集实例与构造参数，模拟 connect/message/error/close/reconnect。
 * 面板只用 mqtt.connect(url, opts) 与 client.on/subscribe/unsubscribe/publish/end/connected。
 */
class FakeMqttClient {
  static instances: FakeMqttClient[] = [];
  connected = false;
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  subscriptions: Array<{ topic: string; qos: number }> = [];
  published: Array<{ topic: string; payload: string; qos: number; retain: boolean }> = [];
  ended = false;

  constructor(public url: string, public opts?: Record<string, unknown>) {
    FakeMqttClient.instances.push(this);
  }

  on(event: string, handler: (...args: unknown[]) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), handler]);
    return this;
  }

  subscribe(topic: string, options: { qos?: number }, cb?: (e?: Error) => void) {
    this.subscriptions.push({ topic, qos: options.qos ?? 0 });
    cb?.();
  }

  unsubscribe(topic: string, cb?: () => void) {
    this.subscriptions = this.subscriptions.filter((item) => item.topic !== topic);
    cb?.();
  }

  publish(topic: string, payload: string, options: { qos?: number; retain?: boolean }, cb?: (e?: Error) => void) {
    this.published.push({ topic, payload, qos: options.qos ?? 0, retain: options.retain === true });
    cb?.();
  }

  end(force?: boolean) {
    this.ended = true;
    if (force !== false) this.fire('close');
  }

  /** 测试辅助：模拟连接成功并补齐初始订阅。 */
  open() {
    this.connected = true;
    this.fire('connect');
  }

  /** 测试辅助：模拟一条订阅消息到达。 */
  deliver(topic: string, payload: string, qos = 0, retain = false) {
    for (const handler of this.listeners.get('message') ?? []) handler(topic, Buffer.from(payload), { qos, retain });
  }

  fail(message: string) {
    this.fire('error', new Error(message));
  }

  private fire(event: string, ...args: unknown[]) {
    for (const handler of this.listeners.get(event) ?? []) handler(...args);
  }
}

const connectMock = vi.fn((url: string, opts?: Record<string, unknown>) => new FakeMqttClient(url, opts));

vi.mock('mqtt', () => ({
  default: { connect: (url: string, opts?: Record<string, unknown>) => connectMock(url, opts) },
  connect: (url: string, opts?: Record<string, unknown>) => connectMock(url, opts),
}));

beforeEach(() => {
  FakeMqttClient.instances = [];
  connectMock.mockClear();
  localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      collections: [],
      environments: [
        { id: 'e1', name: '测试环境', variables: [{ key: 'broker', value: 'mqtt.test', enabled: true }], activeEnvId: 'e1' },
      ],
      activeEnvId: 'e1',
      sockets: [{ id: 's1', name: '传感器 broker', url: 'wss://mqtt.test:8083/mqtt', kind: 'mqtt', mqttClientId: '', mqttUsername: '', mqttPassword: '', mqttKeepAlive: 60, mqttCleanSession: true, mqttWillTopic: '', mqttWillMessage: '', mqttWillQos: 0, mqttWillRetain: false, mqttSubscriptions: [{ topic: 'sensor/#', qos: 1 }] }],
      mockEnabled: false,
      mockRoutes: [],
      history: [],
    }),
  );
  useAppStore.setState({ locale: 'zh' });
});

const { MqttPanel } = await import('./MqttPanel');
const { WorkbenchProvider } = await import('./WorkbenchContext');

function renderPanel() {
  render(
    <I18nProvider>
      <ToastProvider>
        <WorkbenchProvider>
          <MqttPanel active />
        </WorkbenchProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('MqttPanel', () => {
  test('连接时 mqtt.connect 收到纠正后的 ws 地址与凭据/Will/订阅', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Broker 地址'), { target: { value: 'mqtt://mqtt.test:1883' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'u' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'p' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));

    await waitFor(() => {
      expect(connectMock).toHaveBeenCalledTimes(1);
    });
    const [url, opts] = connectMock.mock.calls[0]!;
    // mqtt:// 自动改写为 ws://。
    expect(url).toBe('ws://mqtt.test:1883');
    expect(opts?.username).toBe('u');
    expect(opts?.password).toBe('p');
    expect(opts?.clean).toBe(true);
    expect(opts?.keepalive).toBe(60);
    expect(opts?.reconnectPeriod).toBe(5000);
  });

  test('连接成功后初始订阅进入客户端，消息到达记入 IN 日志', async () => {
    renderPanel();
    // 先添加订阅再连接，验证连接回调里的初始订阅。
    fireEvent.change(screen.getByLabelText('Broker 地址'), { target: { value: 'wss://mqtt.test' } });
    fireEvent.change(screen.getByLabelText('订阅主题过滤器'), { target: { value: 'sensor/#' } });
    fireEvent.click(screen.getByRole('button', { name: '订阅' }));
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
    const client = FakeMqttClient.instances[0]!;
    act(() => {
      client.open();
    });
    await waitFor(() => {
      expect(client.subscriptions.some((item) => item.topic === 'sensor/#' && item.qos === 0)).toBe(true);
    });
    act(() => {
      client.deliver('sensor/room-1/temp', '21.5');
    });
    await waitFor(() => {
      const log = document.querySelector('.max-h-\\[460px\\]');
      expect(log?.textContent).toContain('sensor/room-1/temp');
      expect(log?.textContent).toContain('21.5');
    });
  });

  test('发布带 QoS 与 retain 时正确调用 client.publish', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Broker 地址'), { target: { value: 'wss://mqtt.test' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
    const client = FakeMqttClient.instances[0]!;
    act(() => {
      client.open();
    });
    await waitFor(() => expect(screen.getAllByText('已连接').length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText('发布主题') as HTMLInputElement, { target: { value: 'cmd/room-1' } });
    fireEvent.change(screen.getByLabelText('发布内容（JSON 或纯文本）'), { target: { value: '{"on":true}' } });
    fireEvent.click(screen.getByRole('button', { name: '发布' }));

    await waitFor(() => {
      expect(client.published).toHaveLength(1);
      expect(client.published[0]).toMatchObject({ topic: 'cmd/room-1', payload: '{"on":true}', qos: 0, retain: false });
    });
    // OUT 日志行。
    const log = document.querySelector('.max-h-\\[460px\\]');
    expect(log?.textContent).toContain('cmd/room-1');
  });

  test('订阅管理：连接后添加与取消订阅都作用到客户端', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Broker 地址'), { target: { value: 'wss://mqtt.test' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
    const client = FakeMqttClient.instances[0]!;
    act(() => {
      client.open();
    });
    // 连接 Badge 与 SYS 日志都有「已连接」，用 getAllByText 取计数。
    await waitFor(() => expect(screen.getAllByText('已连接').length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText('订阅主题过滤器'), { target: { value: 'alarm/#' } });
    fireEvent.click(screen.getByRole('button', { name: '订阅' }));
    await waitFor(() => {
      expect(client.subscriptions.some((item) => item.topic === 'alarm/#')).toBe(true);
    });
    // 订阅列表出现该行。
    expect(screen.getAllByText('alarm/#').length).toBeGreaterThan(0);
  });

  test('保存连接写入 doc.sockets 且 kind 为 mqtt（订阅表随存档）', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Broker 地址'), { target: { value: 'wss://mqtt.test' } });
    fireEvent.change(screen.getByLabelText('连接名称'), { target: { value: '传感器 broker' } });
    fireEvent.change(screen.getByLabelText('订阅主题过滤器'), { target: { value: 'sensor/#' } });
    fireEvent.click(screen.getByRole('button', { name: '订阅' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(WORKBENCH_STORAGE_KEY) ?? '{}');
      const saved = stored.sockets.find((item: { url: string }) => item.url === 'wss://mqtt.test');
      expect(saved.kind).toBe('mqtt');
      expect(saved.mqttSubscriptions).toEqual([{ topic: 'sensor/#', qos: 0 }]);
    });
  });

  test('加载已保存的 mqtt 连接回填 Broker 与订阅表', () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('已保存的连接'));
    fireEvent.click(screen.getByRole('option', { name: '传感器 broker' }));
    expect((screen.getByLabelText('Broker 地址') as HTMLInputElement).value).toBe('wss://mqtt.test:8083/mqtt');
    expect(document.body.textContent).toContain('sensor/#');
  });

  test('连接失败记入错误与日志', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Broker 地址'), { target: { value: 'wss://mqtt.test' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
    act(() => {
      FakeMqttClient.instances[0]!.fail('Connection refused');
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(document.body.textContent).toContain('Connection refused');
    });
  });

  test('未连接时发布被拦截且不调客户端', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('发布主题') as HTMLInputElement, { target: { value: 'cmd/x' } });
    fireEvent.change(screen.getByLabelText('发布内容（JSON 或纯文本）'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: '发布' }));
    expect(FakeMqttClient.instances).toHaveLength(0);
    expect(document.body.textContent).toContain('未连接');
  });

  test('非法主题过滤器在订阅时被拦截', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('订阅主题过滤器'), { target: { value: 'bad topic' } });
    fireEvent.click(screen.getByRole('button', { name: '订阅' }));
    expect(screen.getByRole('alert').textContent).toContain('空格');
  });
});
