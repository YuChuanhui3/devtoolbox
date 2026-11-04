import { beforeEach, describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { encodeFrame } from '@/lib/qr-transfer';
import { ScanInbox } from './ScanInbox';
import { TextQrBoard } from './TextQrBoard';
import type { TimelineItem } from './useDropConnection';

function renderWithProviders(node: ReactNode) {
  return render(
    <I18nProvider>
      <ToastProvider>{node}</ToastProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  useAppStore.setState({ locale: 'zh' });
});

describe('ScanInbox', () => {
  test('shows the latest peer scan and keeps local scans out of the inbox', () => {
    const items: TimelineItem[] = [
      { kind: 'scan', id: 'local', mine: true, body: '本机扫到的内容', ts: Date.now() },
      { kind: 'scan', id: 'peer', mine: false, body: '  回传文本  ', ts: Date.now() },
    ];
    renderWithProviders(<ScanInbox items={items} />);

    // 首尾空格属于二维码原文，展示时不能被 trim 掉。
    expect(screen.getByText('回传文本').textContent).toBe('  回传文本  ');
    expect(screen.queryByText('本机扫到的内容')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /复制内容/ })).toBeInTheDocument();
  });

  test('summarises DQX frames instead of dumping the full frame text', () => {
    const frame = encodeFrame('abc123', 0, 1, new TextEncoder().encode('hello'));
    renderWithProviders(
      <ScanInbox items={[{ kind: 'scan', id: 'frame', mine: false, body: frame, ts: Date.now() }]} />,
    );

    expect(screen.getByText(/DQX 帧 1\/1/)).toBeInTheDocument();
    expect(screen.queryByText(frame)).not.toBeInTheDocument();
  });

  test('renders nothing before the peer sends a scan', () => {
    const { container } = renderWithProviders(
      <ScanInbox items={[{ kind: 'scan', id: 'local', mine: true, body: 'x', ts: Date.now() }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TextQrBoard', () => {
  test('turns typed text into a scannable QR and clears back to the empty state', () => {
    renderWithProviders(<TextQrBoard />);

    expect(screen.getByText('输入文本后自动生成')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('二维码文本内容'), { target: { value: 'https://example.com/内网' } });

    expect(screen.getByRole('img', { name: '二维码' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清空' }));

    expect(screen.getByText('输入文本后自动生成')).toBeInTheDocument();
  });

  test('密度按 240px 码框实测，而不是猜版本号', () => {
    renderWithProviders(<TextQrBoard />);
    // 400 字符 = V13（69 模块），旧的 version>=20 判断对它沉默，而 224px 里只有 2.90px/模块
    fireEvent.change(screen.getByLabelText('二维码文本内容'), { target: { value: 'x'.repeat(400) } });

    expect(screen.getByText(/每模块只有 \d\.\d\dpx（需要 ≥4px）/)).toHaveClass('text-warn');
    expect(screen.getByRole('button', { name: '放大' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('二维码文本内容'), { target: { value: 'https://example.com/短' } });
    expect(screen.getByText(/每模块 \d+\.\d\dpx，高于 4px，够扫/)).toBeInTheDocument();
  });

  test('explains when the text exceeds a single QR code', () => {
    renderWithProviders(<TextQrBoard />);
    fireEvent.change(screen.getByLabelText('二维码文本内容'), { target: { value: 'x'.repeat(5000) } });

    expect(screen.getAllByText('内容超出二维码容量').length).toBeGreaterThan(0);
  });
});
