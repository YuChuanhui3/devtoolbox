import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import { CodegenPanel } from './CodegenPanel';
import { WorkbenchProvider } from './WorkbenchContext';
import type { WbRequest } from '@/lib/apiworkbench/types';
import { blankRequest } from '@/lib/apiworkbench/tree';

function seedDoc() {
  localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      collections: [],
      environments: [],
      activeEnvId: null,
      mockEnabled: false,
      mockRoutes: [],
      history: [],
    }),
  );
}

function renderPanel(request: WbRequest) {
  render(
    <MemoryRouter initialEntries={['/tools/http-simulator?mode=request&sub=code']}>
      <I18nProvider>
        <ToastProvider>
          <WorkbenchProvider>
            <CodegenPanel request={request} />
          </WorkbenchProvider>
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ locale: 'zh' });
  vi.unstubAllGlobals();
  seedDoc();
});

describe('CodegenPanel 语法高亮', () => {
  test('curl 片段以 bash 高亮渲染（hljs span 而非纯文本）', () => {
    const request = { ...blankRequest(), url: 'https://api.test/users', method: 'GET' as const };
    renderPanel(request);

    const code = document.querySelector('.wb-sidebar-code pre code, pre code');
    expect(code).not.toBeNull();
    // 高亮生效的特征：内部有 hljs 的 span 包装，而不是一整段转义文本。
    expect(code!.innerHTML).toContain('<span class="hljs-');
    expect(code!.className).toContain('language-bash');
  });

  test('JSON 请求体在 python 片段里不崩，高亮标签仍在', () => {
    const request = {
      ...blankRequest(),
      url: 'https://api.test/users',
      method: 'POST' as const,
      headers: [{ id: 'h1', key: 'Content-Type', value: 'application/json', enabled: true }],
      body: { mode: 'json' as const, text: '{"name":"dev"}' },
    };
    renderPanel(request);

    const code = document.querySelector('pre code');
    expect(code).not.toBeNull();
    expect(code!.innerHTML).toContain('<span class="hljs-');
  });

  test('语言下拉列出全部八种生成目标', () => {
    const request = { ...blankRequest(), url: 'https://api.test/', method: 'GET' as const };
    renderPanel(request);

    // Select 是 combobox + portal listbox，不是原生 select。
    fireEvent.click(screen.getByRole('combobox', { name: '目标语言' }));
    const listbox = screen.getByRole('listbox', { name: '目标语言' });
    const options = Array.from(listbox.querySelectorAll('[role="option"]')).map((option) => option.textContent);
    expect(options).toEqual([
      'cURL', 'JavaScript fetch', 'Axios（浏览器）', 'Axios（Node）',
      'Python requests', 'Go net/http', 'Java OkHttp', 'PHP curl',
    ]);
  });
});
