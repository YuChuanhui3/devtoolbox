import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { CollectionImportModal } from './CollectionImportModal';
import type { ImportedBundle } from '@/lib/apiworkbench/importers';

const POSTMAN = JSON.stringify({
  info: { name: 'PM', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [
    { name: 'Ping', request: { method: 'GET', url: { raw: 'https://api.test/ping' } } },
    { name: 'Probe', request: { method: 'PROPFIND', url: { raw: 'https://api.test/dav' } } },
  ],
});

function renderModal(onImported: (bundle: ImportedBundle) => void) {
  return render(
    <I18nProvider>
      <ToastProvider>
        <CollectionImportModal open onClose={() => undefined} onImported={onImported} />
      </ToastProvider>
    </I18nProvider>,
  );
}

/** 直接改值：JSON 里的 `{` 在 userEvent.type 里是特殊字符，没必要跟它较劲。 */
async function paste(text: string) {
  const box = await screen.findByRole('textbox', { name: '导出的 JSON' });
  fireEvent.change(box, { target: { value: text } });
}

describe('CollectionImportModal', () => {
  beforeEach(() => useAppStore.setState({ locale: 'zh' }));
  afterEach(cleanup);

  test('自动识别 Postman 文件并交出集合与计数', async () => {
    const onImported = vi.fn();
    renderModal(onImported);
    await paste(POSTMAN);
    await userEvent.click(screen.getByRole('button', { name: '导入' }));

    expect(onImported).toHaveBeenCalledTimes(1);
    const bundle = onImported.mock.calls[0][0] as ImportedBundle;
    expect([bundle.format, bundle.requestCount, bundle.collections[0].name]).toEqual(['postman', 2, 'PM']);
  });

  test('认不出的内容给出错提示，而不是静默什么都不做', async () => {
    const onImported = vi.fn();
    renderModal(onImported);
    await paste('{"hello":1}');
    await userEvent.click(screen.getByRole('button', { name: '导入' }));

    expect(onImported).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/认不出这个文件是哪种格式/)).toBeInTheDocument();
  });

  test('手选 HAR 时按 HAR 读，选错格式就报错并留在弹窗里', async () => {
    const onImported = vi.fn();
    renderModal(onImported);
    await userEvent.click(screen.getByRole('tab', { name: 'HAR' }));
    await paste(POSTMAN);
    await userEvent.click(screen.getByRole('button', { name: '导入' }));

    expect(onImported).not.toHaveBeenCalled();
    expect(within(screen.getByRole('dialog')).getByText(/不是 HAR 文件/)).toBeInTheDocument();
  });
});
