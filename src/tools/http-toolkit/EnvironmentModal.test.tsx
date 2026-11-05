import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import { WorkbenchProvider } from './WorkbenchContext';
import { EnvironmentModal } from './EnvironmentModal';
import type { WbEnvironment } from '@/lib/apiworkbench/types';

const v = (key: string, value: string) => ({ id: key, key, value, enabled: true });

const base: WbEnvironment = { id: 'base', name: '基础层', variables: [v('token', 'parent')] };
const prod: WbEnvironment = { id: 'prod', name: 'Prod', variables: [], inheritId: 'base' };
const app: WbEnvironment = { id: 'app', name: 'App', variables: [v('token', 'child')] };

function seed(environments: WbEnvironment[], activeEnvId: string | null = null) {
  localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      collections: [],
      environments,
      activeEnvId,
      mockEnabled: false,
      mockRoutes: [],
      history: [],
    }),
  );
}

function renderModal() {
  render(
    <I18nProvider>
      <ToastProvider>
        <WorkbenchProvider>
          <EnvironmentModal open onClose={vi.fn()} />
        </WorkbenchProvider>
      </ToastProvider>
    </I18nProvider>,
  );
  return screen.getByRole('dialog', { name: '环境与变量' });
}

/** 选项列表是 portal 到 body 的，不能 within(dialog) 找。 */
function openParentPicker(dialog: HTMLElement, parentName: string) {
  fireEvent.click(within(dialog).getByRole('combobox', { name: '继承自' }));
  fireEvent.click(within(screen.getByRole('listbox', { name: '继承自' })).getByRole('option', { name: parentName }));
}

beforeEach(() => {
  useAppStore.setState({ locale: 'zh' });
});

describe('EnvironmentModal 继承', () => {
  test('已设父层时写明整条链和覆盖规则', () => {
    seed([base, prod], 'prod');
    const dialog = renderModal();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Prod' }));

    expect(within(dialog).getByRole('combobox', { name: '继承自' })).toHaveTextContent('基础层');
    expect(dialog.textContent).toContain('继承链：「Prod」 ← 「基础层」。同名变量以本层为准');
  });

  test('选一个父层，立刻落进继承链', () => {
    seed([base, app]);
    const dialog = renderModal();

    fireEvent.click(within(dialog).getByRole('button', { name: 'App' }));
    openParentPicker(dialog, '基础层');

    expect(dialog.textContent).toContain('继承链：「App」 ← 「基础层」');
  });

  test('会成环的父层置灰，点它也不会改写', () => {
    seed([base, prod]);
    const dialog = renderModal();

    fireEvent.click(within(dialog).getByRole('button', { name: '基础层' }));
    expect(dialog.textContent).toContain('灰掉的名字会形成环');

    fireEvent.click(within(dialog).getByRole('combobox', { name: '继承自' }));
    const loopOption = within(screen.getByRole('listbox', { name: '继承自' })).getByRole('option', { name: 'Prod' });
    expect(loopOption).toBeDisabled();

    fireEvent.click(loopOption);
    expect(within(dialog).getByRole('combobox', { name: '继承自' })).toHaveTextContent('不继承');
  });

  test('删掉父层后子环境回到不继承，不留悬空引用', () => {
    seed([base, prod], 'prod');
    const dialog = renderModal();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Prod' }));
    openParentPicker(dialog, '基础层');
    expect(dialog.textContent).toContain('继承链：「Prod」 ← 「基础层」');

    fireEvent.click(within(dialog).getByRole('button', { name: '基础层' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '删除环境' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除环境？' }));

    expect(dialog.textContent).not.toContain('「基础层」');
    expect(within(dialog).getByRole('combobox', { name: '继承自' })).toHaveTextContent('不继承');
  });
});
