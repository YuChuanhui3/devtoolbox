import { restoreWorkbench } from '@/lib/apiworkbench/persistence';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import { SsePanel } from './SsePanel';
import { WorkbenchProvider } from './WorkbenchContext';

/**
 * 假 fetch：返回一个伪造的 ReadableStream，按给定 chunk 依次吐出 SSE 文本。
 * 面板里的 consume() 只用 response.ok / response.body.getReader() / reader.read()。
 */
function fakeSseFetch(chunks: string[], opts: { status?: number; fail?: boolean } = {}) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (opts.fail) throw new Error('network down');
    const signal = init?.signal as AbortSignal | undefined;
    let index = 0;
    const reader = {
      read: async () => {
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
        if (index >= chunks.length) return { done: true, value: undefined as Uint8Array | undefined };
        const value = new TextEncoder().encode(chunks[index]!);
        index += 1;
        return { done: false, value };
      },
      releaseLock: () => undefined,
    };
    return {
      ok: opts.status === undefined ? true : opts.status >= 200 && opts.status < 300,
      status: opts.status ?? 200,
      body: { getReader: () => reader },
    } as unknown as Response;
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fakeSseFetch([
    'event: tick\ndata: {"n":1}\n\n',
    'data: plain frame\n\n',
  ]));
  localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      collections: [],
      environments: [
        { id: 'e1', name: '测试环境', variables: [{ key: 'host', value: 'stream.test', enabled: true }], activeEnvId: 'e1' },
      ],
      activeEnvId: 'e1',
      sockets: [{ id: 's1', name: '指标流', url: 'https://stream.test/metrics', kind: 'sse', sseHeaders: [], sseReconnect: true }],
      mockEnabled: false,
      mockRoutes: [],
      history: [],
    }),
  );
  useAppStore.setState({ locale: 'zh' });
});

function renderPanel() {
  render(
    <I18nProvider>
      <ToastProvider>
        <WorkbenchProvider>
          <SsePanel active />
        </WorkbenchProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('SsePanel', () => {
  test('连接后消费 fetch 流并把事件写入日志', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('SSE 地址'), { target: { value: 'https://stream.test/metrics' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));

    // 日志区出现 IN 行与事件类型统计即说明流被消费（pretty JSON 会换行缩进，不断言原文连续子串）。
    await waitFor(async () => {
      expect(document.body.textContent).toContain('事件类型：');
      expect(document.body.textContent).toContain('tick ×1');
    });
    await waitFor(async () => {
      expect(document.body.textContent).toContain('IN');
      expect(document.body.textContent).toContain('"n": 1');
    });
    // 连接 Badge 与 SYS 日志都出现「已连接」。
    expect(document.body.textContent).toContain('已连接');
  });

  test('地址为空时连接报错而不是发出请求', async () => {
    const fetchMock = fakeSseFetch([]);
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(async () => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('变量未定义时拦截连接并列出变量名', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('SSE 地址'), { target: { value: 'https://{{host}}/metrics' } });
    // 环境里有 host，但换一个未定义的变量名验证拦截。
    fireEvent.change(screen.getByLabelText('SSE 地址'), { target: { value: 'https://{{missing}}/metrics' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(async () => {
      expect(screen.getByRole('alert').textContent).toContain('missing');
    });
  });

  test('保存连接写入 doc.sockets 且 kind 为 sse', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('SSE 地址'), { target: { value: 'https://stream.test/metrics' } });
    fireEvent.change(screen.getByLabelText('连接名称'), { target: { value: '指标流' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(async () => {
      const stored = await restoreWorkbench();
      const saved = stored.sockets.find((item: { url: string }) => item.url === 'https://stream.test/metrics')!;
      expect(saved.kind).toBe('sse');
      expect(saved.name).toBe('指标流');
    });
  });

  test('加载已保存的 sse 连接会回填地址与请求头', () => {
    renderPanel();
    // Select 是自绘组件：点击打开菜单再点选项（与 WebSocketPanel 测试同范式）。
    fireEvent.click(screen.getByLabelText('已保存的连接'));
    fireEvent.click(screen.getByRole('option', { name: '指标流' }));
    expect((screen.getByLabelText('SSE 地址') as HTMLInputElement).value).toBe('https://stream.test/metrics');
  });

  test('事件类型统计条在收到具名事件后出现', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('SSE 地址'), { target: { value: 'https://stream.test/metrics' } });
    fireEvent.click(screen.getByRole('button', { name: '连接' }));
    await waitFor(async () => {
      expect(document.body.textContent).toContain('tick ×1');
    });
  });
});
