import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { useAppStore } from '@/store/appStore';
import { MAX_SCRIPT_CHARS } from '@/lib/apiworkbench/scriptEngine';
import { blankRequest } from '@/lib/apiworkbench/tree';
import type { WbRequest } from '@/lib/apiworkbench/types';
import { ScriptEditor } from './ScriptEditor';

beforeEach(() => {
  useAppStore.setState({ locale: 'zh' });
});

function renderEditor(overrides: Partial<WbRequest> = {}, deadlineMs = 5000, onDeadlineChange = vi.fn(), onChange = vi.fn()) {
  render(
    <I18nProvider>
      <ScriptEditor
        request={{ ...blankRequest(), ...overrides }}
        deadlineMs={deadlineMs}
        onDeadlineChange={onDeadlineChange}
        onChange={onChange}
      />
    </I18nProvider>,
  );
  return { onDeadlineChange, onChange };
}

describe('ScriptEditor', () => {
  test('默认看测试脚本，切到预请求就读另一段', () => {
    renderEditor({ preScript: 'pm.variables.set("a","1");', testScript: 'pm.test("t", () => {});' });
    expect(screen.getByDisplayValue('pm.test("t", () => {});')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '预请求脚本' }));
    expect(screen.getByDisplayValue('pm.variables.set("a","1");')).toBeInTheDocument();
  });

  test('编辑当前阶段的脚本，改的是那一个字段', () => {
    const { onChange } = renderEditor({ testScript: 'pm.test("t", () => {});' });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'pm.test("u", () => {});' } });
    expect(onChange).toHaveBeenCalledWith({ testScript: 'pm.test("u", () => {});' });

    fireEvent.click(screen.getByRole('tab', { name: '预请求脚本' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x();' } });
    expect(onChange).toHaveBeenCalledWith({ preScript: 'x();' });
  });

  test('超过字符上限就明说不会执行', () => {
    renderEditor({ testScript: 'x'.repeat(MAX_SCRIPT_CHARS + 1) });
    expect(screen.getByText(/不会被执行/)).toBeInTheDocument();
  });

  test('空脚本给一个能直接跑的示例', () => {
    const { onChange } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: '插入示例' }));
    expect(onChange).toHaveBeenCalledWith({ testScript: expect.stringContaining('pm.test') });
  });

  test('已有脚本时给清空', () => {
    const { onChange } = renderEditor({ testScript: 'pm.test("t", () => {});' });
    fireEvent.click(screen.getByRole('button', { name: '清空' }));
    expect(onChange).toHaveBeenCalledWith({ testScript: '' });
  });

  test('失控上限可选，改了就交回宿主', async () => {
    const { onDeadlineChange } = renderEditor({}, 5000);
    fireEvent.click(screen.getByRole('combobox', { name: '脚本失控上限' }));
    fireEvent.click(await screen.findByText('20 秒'));
    expect(onDeadlineChange).toHaveBeenCalledWith(20000);
  });

  test('限制说明讲清终止沙箱线程，不自夸绝对安全', () => {
    renderEditor();
    const copy = document.body.textContent ?? '';
    expect(copy).toContain('终止它的沙箱线程');
    expect(copy).not.toContain('绝对不会卡住');
    expect(copy).not.toContain('任何脚本都无害');
  });
});
