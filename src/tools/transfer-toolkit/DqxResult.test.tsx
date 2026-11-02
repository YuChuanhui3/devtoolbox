import { beforeEach, describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { gzipBytes, splitFrames } from '@/lib/qr-transfer';
import { DqxResult } from './DqxResult';

beforeEach(() => {
  useAppStore.setState({ locale: 'zh' });
});

describe('DqxResult', () => {
  test('shows restored original text instead of the DQX protocol payload', async () => {
    const original = '这是原始文本\n{"ok":true}';
    const compressed = await gzipBytes(new TextEncoder().encode(original));
    const { frames } = splitFrames(compressed, { sid: 'abc123', frameBytes: 60, fileName: 'text-utf8.txt' });
    render(
      <I18nProvider>
        <ToastProvider>
          <DqxResult
            view={{ sid: 'abc123', total: frames.length, received: frames.length, missing: [], missingCount: 0 }}
            payload={compressed}
          />
        </ToastProvider>
      </I18nProvider>,
    );

    expect(await screen.findByText((_, element) => element?.tagName === 'PRE' && element.textContent === original)).toBeInTheDocument();
    expect(screen.getByText('原文已自动还原')).toBeInTheDocument();
    expect(screen.queryByText(/DQX1:abc123/)).not.toBeInTheDocument();
  });
});
