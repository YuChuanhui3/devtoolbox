import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Input } from '@/components/ui/Input';
import { useWorkbenchShortcuts, type WorkbenchShortcuts } from './useWorkbenchShortcuts';
const handlers = {
  onSend: vi.fn(),
  onSave: vi.fn(),
  onSaveAs: vi.fn(),
  onFocusSearch: vi.fn(),
  onOpenImport: vi.fn(),
  onToggleHelp: vi.fn(),
};

function Probe({ enabled }: { enabled: boolean }) {
  useWorkbenchShortcuts(enabled, handlers as WorkbenchShortcuts);
  return <Input aria-label="输入框" />;
}

describe('useWorkbenchShortcuts', () => {
  beforeEach(() => {
    Object.values(handlers).forEach((fn) => fn.mockClear());
  });

  afterEach(cleanup);

  test('可见页签里各组合键各归各的动作', () => {
    render(<Probe enabled />);
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'S', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'o', metaKey: true });
    fireEvent.keyDown(window, { key: '/' });
    expect(handlers.onSend).toHaveBeenCalledTimes(1);
    expect(handlers.onSave).toHaveBeenCalledTimes(1);
    expect(handlers.onSaveAs).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenImport).toHaveBeenCalledTimes(1);
    expect(handlers.onFocusSearch).toHaveBeenCalledTimes(1);
  });

  test('⌘K 不劫持：那是全局工具搜索的按键', () => {
    render(<Probe enabled />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(handlers.onFocusSearch).not.toHaveBeenCalled();
  });

  test('隐藏页签不接管：LazyPanel 挂着不卸载，一次 ⌘Enter 不能发出五个面板的请求', () => {
    render(<Probe enabled={false} />);
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    expect(handlers.onSend).not.toHaveBeenCalled();
    expect(handlers.onSave).not.toHaveBeenCalled();
  });

  test('裸键不劫持：普通 s 是打字，? 与 / 只在没聚焦输入控件时生效', () => {
    render(<Probe enabled />);
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: '?' });
    fireEvent.keyDown(window, { key: '/' });
    expect(handlers.onToggleHelp).toHaveBeenCalledTimes(1);
    expect(handlers.onFocusSearch).toHaveBeenCalledTimes(1);

    const box = screen.getByRole('textbox', { name: '输入框' });
    fireEvent.keyDown(box, { key: '?' });
    fireEvent.keyDown(box, { key: '/' });
    expect(handlers.onToggleHelp).toHaveBeenCalledTimes(1);
    expect(handlers.onFocusSearch).toHaveBeenCalledTimes(1);
  });

  test('弹窗打开时快捷键不穿透到背后的请求面板', () => {
    render(<Probe enabled />);
    const holder = document.createElement('div');
    holder.setAttribute('role', 'dialog');
    document.body.appendChild(holder);
    try {
      fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
      expect(handlers.onSend).not.toHaveBeenCalled();
    } finally {
      holder.remove();
    }
  });

  test('⌘S 与 ⇧⌘S 不会同时命中：另存时不重复保存', () => {
    render(<Probe enabled />);
    fireEvent.keyDown(window, { key: 'S', metaKey: true, shiftKey: true });
    expect(handlers.onSaveAs).toHaveBeenCalledTimes(1);
    expect(handlers.onSave).not.toHaveBeenCalled();
  });
});
