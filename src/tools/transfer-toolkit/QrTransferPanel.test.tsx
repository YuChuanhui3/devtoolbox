import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useDqxSession } from '@/hooks/useDqxSession';
import { useAppStore } from '@/store/appStore';
import { maxModuleCountForScan } from '@/lib/qr';
import { QrTransferPanel } from './QrTransferPanel';

// jsdom 没有 2D canvas：只替掉像素绘制，版本/密度/切帧仍走真实实现
vi.mock('@/lib/qr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/qr')>();
  return {
    ...actual,
    renderQrToCanvas: (_matrix: Parameters<typeof actual.renderQrToCanvas>[0], style: Parameters<typeof actual.renderQrToCanvas>[1]) =>
      ({ width: style.size, height: style.size, getContext: () => null }) as unknown as HTMLCanvasElement,
  };
});

function Harness({ initialDirection }: { initialDirection?: 'send' | 'receive' }) {
  const session = useDqxSession();
  return (
    <I18nProvider>
      <ToastProvider>
        <QrTransferPanel active session={session} initialDirection={initialDirection} />
      </ToastProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  useAppStore.setState({ locale: 'zh' });
});

describe('QrTransferPanel', () => {
  test('keeps send and receive under one tab and explains DQX1', () => {
    render(<Harness />);
    expect(screen.getByText('发送内容')).toBeVisible();
    expect(screen.getByText(/DQX1 是传输协议/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '接收' }));
    expect(screen.getByText('摄像头扫码')).toBeVisible();
    expect(screen.getByText('发送内容')).not.toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: '发送' }));
    expect(screen.getByText('发送内容')).toBeVisible();
  });

  test('honours legacy receive links', () => {
    render(<Harness initialDirection="receive" />);
    expect(screen.getByRole('tab', { name: '接收' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('摄像头扫码')).toBeVisible();
  });
});

/** 压缩后仍有 ~2KB 的伪随机文本：足够把每帧容量顶到密度上限。 */
const LONG_TEXT = Array.from(
  { length: 700 },
  (_, i) => `item${i},v-${((i * 2654435761) % 9973).toString(36)}`,
).join('\n');

function statValue(label: string): string {
  const cell = screen.getByText(label).parentElement;
  return (cell?.textContent ?? '').replace(label, '').trim();
}

function sessionSid(): string {
  return /会话 ([0-9a-z]{6})/.exec(screen.getAllByText(/会话 [0-9a-z]{6}/)[0].textContent ?? '')?.[1] ?? '';
}

async function typePayload() {
  fireEvent.change(screen.getByPlaceholderText(/粘贴要传输/), { target: { value: LONG_TEXT } });
  await waitFor(() => expect(screen.getByText('帧数')).toBeInTheDocument());
}

describe('SendPanel 密度预算', () => {
  test('标准档按行内显示宽度切帧：每模块像素守住下限', async () => {
    render(<Harness />);
    await typePayload();
    // 旧实现按 canvas 后备像素算预算，行内舞台会被顶到 V25（每模块 ~2.6px，扫不出来）
    expect(parseFloat(statValue('模块'))).toBeGreaterThanOrEqual(4);
    const version = Number(statValue('版本').replace('V', ''));
    const cap = maxModuleCountForScan(368, 4);
    expect(4 * version + 17).toBeLessThanOrEqual(cap);
  });

  test('放映换用更宽的舞台：重开会话、每帧更大、帧数更少', async () => {
    render(<Harness />);
    await typePayload();
    const before = sessionSid();
    const framesBefore = Number(statValue('帧数'));

    fireEvent.click(screen.getByRole('button', { name: '放映' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(sessionSid()).not.toBe(before));

    expect(Number(statValue('帧数'))).toBeLessThan(framesBefore);
    expect(parseFloat(statValue('模块'))).toBeGreaterThanOrEqual(4);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
