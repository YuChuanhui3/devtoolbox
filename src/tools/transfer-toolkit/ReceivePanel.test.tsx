import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { encodeFrame } from '@/lib/qr-transfer';
import { ReceivePanel } from './ReceivePanel';
import type { DqxSession } from '@/hooks/useDqxSession';

const live = vi.hoisted(() => ({ emit: null as ((text: string) => void) | null }));

// 摄像头不可用，解码循环用 mock 顶掉：这里要锁的是「读到文本之后怎么入账」
vi.mock('@/lib/live-qr', () => ({
  startLiveQr: ({ onText }: { onText: (text: string) => void }) => {
    live.emit = onText;
    return Promise.resolve(() => {
      live.emit = null;
    });
  },
}));

function harness() {
  const accept = vi.fn();
  const session = { accept, sessions: [], event: null, complete: null, reset: vi.fn() } as unknown as DqxSession;
  render(
    <I18nProvider>
      <ToastProvider>
        <ReceivePanel active session={session} />
      </ToastProvider>
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '开始扫码' }));
  return accept;
}

// 3 字节一块：非末帧的 Base64 不能带 padding，否则 parseFrame 会当错读丢掉
const frame = (index: number, total: number) =>
  encodeFrame('abc123', index, total, new Uint8Array([65 + index, 66 + index, 67 + index]));

beforeEach(() => {
  useAppStore.setState({ locale: 'zh' });
  live.emit = null;
});

describe('ReceivePanel 入账判定', () => {
  test('两帧读数交错时都要入账，重复读不再重复入账', async () => {
    const accept = harness();
    await waitFor(() => expect(live.emit).toBeTruthy());

    const f0 = frame(0, 2);
    const f1 = frame(1, 2);
    // 发送端切帧 + 解码耗时，两帧的读数会交错出现
    live.emit!(f0);
    live.emit!(f1);
    live.emit!(f0);
    live.emit!(f1);
    expect(accept).toHaveBeenCalledTimes(2);
    expect(accept).toHaveBeenCalledWith(f0);
    expect(accept).toHaveBeenCalledWith(f1);

    live.emit!(f0);
    expect(accept).toHaveBeenCalledTimes(2);
  });

  test('非 DQX 文本不入账', async () => {
    const accept = harness();
    await waitFor(() => expect(live.emit).toBeTruthy());

    live.emit!('https://example.com');
    live.emit!('https://example.com');
    expect(accept).not.toHaveBeenCalled();
  });
});
