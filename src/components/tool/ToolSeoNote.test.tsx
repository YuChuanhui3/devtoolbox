import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { useAppStore } from '@/store/appStore';
import { ToolSeoNote } from './ToolSeoNote';
import { getTool } from '@/data/tools';

function renderNote(id: string, locale: 'zh' | 'en') {
  useAppStore.setState({ locale });
  const tool = getTool(id);
  if (!tool) throw new Error(`unknown tool ${id}`);
  return render(
    <I18nProvider>
      <MemoryRouter>
        <ToolSeoNote tool={tool} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('ToolSeoNote', () => {
  test('中文界面渲染在线XX工具标题句与别名导流', () => {
    const { container } = renderNote('json-formatter', 'zh');
    expect(container.textContent).toContain('关于此工具');
    expect(container.textContent).toContain('在线JSON 格式化工具');
    expect(container.textContent).toContain('也被称为');
    expect(container.textContent).toContain('数据格式');
  });

  test('英文界面渲染 Online X Tool 并隐藏中文别名细节', () => {
    const { container } = renderNote('json-formatter', 'en');
    expect(container.textContent).toContain('About this tool');
    expect(container.textContent).toContain('Online JSON Formatter Tool');
  });
});
