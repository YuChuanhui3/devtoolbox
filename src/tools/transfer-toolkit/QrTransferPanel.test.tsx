import { beforeEach, describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useDqxSession } from '@/hooks/useDqxSession';
import { useAppStore } from '@/store/appStore';
import { QrTransferPanel } from './QrTransferPanel';

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
