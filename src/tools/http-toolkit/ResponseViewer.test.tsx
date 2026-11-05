import { beforeEach, describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { RENDER_CHUNK_CHARS } from '@/lib/apiworkbench/response';
import { ResponseViewer, type ResponseView } from './ResponseViewer';

const base: ResponseView = {
  status: 200,
  ok: true,
  headers: [['Content-Type', 'text/plain; charset=utf-8'], ['X-Trace', 'abc']],
  text: 'hello',
  bytes: 5,
  ms: 12,
  via: 'direct',
};

function renderViewer(result: ResponseView, extra: { previous?: { text: string; status: number; ms: number } | null } = {}) {
  return render(
    <I18nProvider>
      <ToastProvider>
        <ResponseViewer result={result} error={null} previous={extra.previous ?? null} requestUrl="https://api.test/report" />
      </ToastProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  useAppStore.setState({ locale: 'zh' });
});

describe('ResponseViewer 分片渲染', () => {
  test('长正文一次一块，继续加载接上下一块', () => {
    const text = 'x'.repeat(RENDER_CHUNK_CHARS * 2 + 5_000);
    renderViewer({ ...base, text });

    expect(screen.getByText(`已显示 1/3 块 · 还有 ${RENDER_CHUNK_CHARS * 2 + 5_000 - RENDER_CHUNK_CHARS} 字符`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续加载' }));
    expect(screen.getByText('已显示 2/3 块 · 还有 5000 字符')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续加载' }));
    expect(screen.getByText(`完整正文已显示（${text.length} 字符）`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '继续加载' })).toBeNull();
  });

  test('换一条响应回到第一块，不接上一次的进度', () => {
    const { rerender } = renderViewer({ ...base, text: 'x'.repeat(RENDER_CHUNK_CHARS * 3) });
    fireEvent.click(screen.getByRole('button', { name: '继续加载' }));
    expect(screen.getByText(/^已显示 2\/3 块/)).toBeInTheDocument();

    rerender(
      <I18nProvider>
        <ToastProvider>
          <ResponseViewer
            result={{ ...base, text: 'y'.repeat(RENDER_CHUNK_CHARS * 5) }}
            error={null}
            requestUrl="https://api.test/report"
          />
        </ToastProvider>
      </I18nProvider>,
    );
    expect(screen.getByText(/^已显示 1\/5 块 · 还有 80000 字符/)).toBeInTheDocument();
  });
});

describe('ResponseViewer 按类型分视图', () => {
  test('HTML 用最小权限 iframe 预览，并可切回源码', () => {
    renderViewer({
      ...base,
      headers: [['Content-Type', 'text/html']],
      text: '<h1>hi</h1><script>alert(1)</script>',
    });

    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('<script>alert(1)</script>');
    expect(screen.getByText('预览已禁用脚本、表单与跳转')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '源码' }));
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByText(/<h1>hi<\/h1>/)).toBeInTheDocument();
  });

  test('图片没有保留字节时说清楚原因，而不是空框', () => {
    renderViewer({ ...base, headers: [['Content-Type', 'image/png']], text: '', blob: null });
    expect(screen.getByText('没有保留图片字节')).toBeInTheDocument();
    expect(screen.getByText(/代理通道与本地 Mock 只给文本/)).toBeInTheDocument();
  });

  test('压缩包这类二进制只报类型与大小，没有字节就不给下载', () => {
    renderViewer({ ...base, headers: [['Content-Type', 'application/zip']], text: '', bytes: 9000 });
    expect(screen.getByText('这份响应没有可预览的字节')).toBeInTheDocument();
    // 头部统计与二进制行各报一次大小
    expect(screen.getAllByText('9000 B')).toHaveLength(2);
    expect(screen.getByText('字节未保留，无法下载')).toBeInTheDocument();
  });

  test('JSON 默认美化视图，页签里仍是原文与差异可选', () => {
    renderViewer({ ...base, headers: [['Content-Type', 'application/json']], text: '{"a":1}' });
    expect(screen.getByRole('tab', { name: '美化' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '原文' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '与上次差异' })).toBeNull();
  });

  test('有上一条时才出现差异页签', () => {
    renderViewer(
      { ...base, headers: [['Content-Type', 'application/json']], text: '{"a":2}' },
      { previous: { text: '{"a":1}', status: 200, ms: 9 } },
    );
    fireEvent.click(screen.getByRole('tab', { name: '与上次差异' }));
    expect(screen.getByText('+ {"a":2}')).toBeInTheDocument();
    expect(screen.getByText('- {"a":1}')).toBeInTheDocument();
  });

  test('响应头数量做成徽标，明细折叠在详情里', () => {
    renderViewer(base);
    expect(screen.getByText('响应头 2')).toBeInTheDocument();
  });
});
