import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import { RequestPanel } from './RequestPanel';
import { WorkbenchProvider } from './WorkbenchContext';

function seedDoc(overrides: Record<string, unknown> = {}) {
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
      ...overrides,
    }),
  );
}

function seedMockDoc() {
  seedDoc({
    mockEnabled: true,
    mockRoutes: [
      {
        id: 'r1',
        enabled: true,
        method: 'GET',
        path: '/users/:id',
        status: 201,
        headers: [],
        body: '{"id":"{{params.id}}"}',
        delayMs: 0,
      },
    ],
  });
}

/** 面板里的 ?sub= 寻址要 Router 上下文，测试与真实挂载树保持同一形状。 */
function renderPanel(entry = '/tools/http-simulator?mode=request') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <I18nProvider>
        <ToastProvider>
          <WorkbenchProvider>
            <RequestPanel active />
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
});

describe('RequestPanel mock interception', () => {
  test('命中路由时零网络调用并展示 Mock 徽标', async () => {
    seedMockDoc();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    fireEvent.change(screen.getByLabelText('请求 URL'), { target: { value: 'https://api.test/users/42' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('Mock 命中')).toBeInTheDocument();
    expect(screen.getByText('201')).toBeInTheDocument();
    expect(await screen.findByText((_, node) => !!node?.classList.contains('json-string') && node.textContent === '"42"')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('未命中时照常走网络', async () => {
    seedMockDoc();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'hello',
      headers: new Headers(),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    fireEvent.change(screen.getByLabelText('请求 URL'), { target: { value: 'https://api.test/orders' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('hello')).toBeInTheDocument();
  });
});

describe('RequestPanel 参数表格', () => {
  test('URL 里已有的查询串会解析成表格行，改表格会即时写回 URL', () => {
    seedDoc();
    renderPanel();

    fireEvent.change(screen.getByLabelText('请求 URL'), { target: { value: 'https://api.test/x?page=2' } });
    expect(screen.getByLabelText('参数名称 1')).toHaveValue('page');
    expect(screen.getByLabelText('参数值 1')).toHaveValue('2');

    fireEvent.click(screen.getByRole('button', { name: '添加参数' }));
    fireEvent.change(screen.getByLabelText('参数名称 2'), { target: { value: 'q' } });
    fireEvent.change(screen.getByLabelText('参数值 2'), { target: { value: '{{kw}}' } });
    expect(screen.getByLabelText('请求 URL')).toHaveValue('https://api.test/x?page=2&q={{kw}}');
  });

  test('取消勾选只从 URL 摘掉这一条，值仍留在表格里', () => {
    seedDoc();
    renderPanel();

    fireEvent.change(screen.getByLabelText('请求 URL'), { target: { value: 'https://api.test/x?a=1&b=2' } });
    // 按标签取行内开关：工具栏上还有一个「流式接收」的 checkbox，按下标取会误命中它
    fireEvent.click(screen.getAllByLabelText('启用参数')[0]);
    expect(screen.getByLabelText('请求 URL')).toHaveValue('https://api.test/x?b=2');
    fireEvent.click(screen.getAllByLabelText('启用参数')[0]);
    expect(screen.getByLabelText('请求 URL')).toHaveValue('https://api.test/x?a=1&b=2');
  });
});

describe('RequestPanel 方法、请求体与认证', () => {
  test('切到自定义动词后输入非法名字会提示，合法则按它发送', async () => {
    seedDoc();
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, status: 200, text: async () => 'hi', headers: new Headers() }));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    fireEvent.change(screen.getByLabelText('请求 URL'), { target: { value: 'https://api.test/x' } });
    fireEvent.click(screen.getByRole('combobox', { name: '请求方法' }));
    fireEvent.click(await screen.findByRole('option', { name: '自定义…' }));
    const custom = screen.getByLabelText('自定义方法名');
    fireEvent.change(custom, { target: { value: 'propfind' } });
    expect(custom).toHaveValue('PROPFIND');
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].method).toBe('PROPFIND');

    fireEvent.change(custom, { target: { value: '1 bad' } });
    expect(await screen.findByText(/自定义方法「1 BAD」不合法/)).toBeInTheDocument();
  });

  test('GraphQL 请求体导出成 curl 的 JSON 体', () => {
    seedDoc();
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '请求体' }));
    fireEvent.click(screen.getByRole('tab', { name: 'GraphQL' }));
    fireEvent.change(screen.getByLabelText('GraphQL Query'), { target: { value: 'query { me }' } });
    expect(screen.getByRole('button', { name: '复制为 curl' })).toBeInTheDocument();
    expect(screen.getByLabelText('GraphQL Variables')).toBeInTheDocument();
  });

  test('API Key 选查询参数时说明追加位置，选请求头时出现前缀', () => {
    seedDoc();
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '授权' }));
    fireEvent.click(screen.getByRole('tab', { name: 'API Key' }));
    expect(screen.getByLabelText('请求头名')).toBeInTheDocument();
    expect(screen.getByLabelText(/前缀/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '查询参数' }));
    expect(screen.getByLabelText('参数名')).toBeInTheDocument();
    expect(screen.queryByLabelText(/前缀/)).not.toBeInTheDocument();
  });

  test('OAuth2 授权码模式在 file:// 之外给出整页跳转的提醒', () => {
    seedDoc();
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: '授权' }));
    fireEvent.click(screen.getByRole('tab', { name: 'OAuth 2.0' }));
    fireEvent.click(screen.getByRole('tab', { name: '授权码 + PKCE' }));
    expect(screen.getByLabelText('Authorize URL')).toBeInTheDocument();
    expect(screen.getByText(/跳走前请先保存请求/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开授权页' })).toBeDisabled();
  });
});

describe('RequestPanel 二级寻址', () => {
  test('?sub=graphql 落在请求体编辑区', () => {
    seedDoc();
    renderPanel('/tools/http-simulator?mode=request&sub=graphql');
    expect(screen.getByRole('tab', { name: 'GraphQL' })).toBeInTheDocument();
  });

  test('?sub=graphql 直接把请求体切成 GraphQL，而不是只换个页签', () => {
    seedDoc();
    renderPanel('/tools/http-simulator?mode=request&sub=graphql');
    expect(screen.getByLabelText('GraphQL Query')).toBeInTheDocument();
  });

  test('?sub=auth 落在认证区', () => {
    seedDoc();
    renderPanel('/tools/http-simulator?mode=request&sub=auth');
    expect(screen.getByRole('tab', { name: 'OAuth 2.0' })).toBeInTheDocument();
  });
});

const POSTMAN_V21_WITH_SCRIPT = JSON.stringify({
  info: { name: 'Demo API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [
    { name: 'Ping', request: { method: 'GET', url: 'https://api.test/ping' } },
    {
      name: 'Pong',
      event: [{ listen: 'test', script: { exec: ['pm.test("x", () => pm.expect(1).to.be(1));'] } }],
      request: { method: 'POST', url: 'https://api.test/pong', body: { mode: 'raw', raw: 'hi' } },
    },
  ],
});

/** 他们的「Export collection」+「Export as JSON」拼成一个数组也是合法输入。 */
const HOPPSOTCH_WITH_ENV = JSON.stringify([
  {
    v: 12,
    name: 'Hop API',
    folders: [],
    requests: [{ v: '1', name: 'Q', endpoint: 'https://api.test/q', method: 'GET', params: [], headers: [], auth: { authType: 'none', authActive: true }, body: { contentType: null, body: null } }],
  },
  { v: 2, name: 'Prod', variables: [{ key: 'host', initialValue: 'https://api.test', currentValue: 'https://api.test', secret: false }] },
]);

describe('RequestPanel 集合导入', () => {  test('粘贴 Postman 集合 JSON → 导入集合，请求脚本一起带进来', async () => {
    seedDoc();
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '导入集合（Postman / Hoppscotch / HAR）' }));
    const dialog = await screen.findByRole('dialog', { name: '导入集合' });
    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: POSTMAN_V21_WITH_SCRIPT } });
    fireEvent.click(screen.getByRole('button', { name: '导入' }));

    expect(await screen.findByText(/已从 Postman 导入 1 个集合（Demo API），共 2 个请求/)).toBeInTheDocument();
    // 请求级脚本能映射到 preScript/testScript，不该再出现在「丢弃」提示里
    expect(screen.queryByText(/已丢弃或裁剪/)).not.toBeInTheDocument();
    const headers = screen.getAllByText('Demo API').filter((node) => node.tagName === 'SPAN');
    expect(headers.length).toBeGreaterThan(0);
    expect(screen.getByText('Ping')).toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Pong/ }));
    fireEvent.click(screen.getByRole('tab', { name: '后请求脚本' }));
    expect(screen.getByDisplayValue('pm.test("x", () => pm.expect(1).to.be(1));')).toBeInTheDocument();
  });

  test('非法 JSON 报错但不关闭弹窗', async () => {
    seedDoc();
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '导入集合（Postman / Hoppscotch / HAR）' }));
    const dialog = await screen.findByRole('dialog', { name: '导入集合' });
    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: 'not json' } });
    fireEvent.click(screen.getByRole('button', { name: '导入' }));

    expect(await screen.findByText(/不是合法 JSON/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '导入集合' })).toBeInTheDocument();
  });

  test('Hoppscotch 文件里的集合与环境一起落地', async () => {
    seedDoc();
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '导入集合（Postman / Hoppscotch / HAR）' }));
    const dialog = await screen.findByRole('dialog', { name: '导入集合' });
    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: HOPPSOTCH_WITH_ENV } });
    fireEvent.click(screen.getByRole('button', { name: '导入' }));

    expect(await screen.findByText(/外加 1 个环境/)).toBeInTheDocument();
    // 选项列表 portal 到 body，不能 within(dialog) 找。
    fireEvent.click(screen.getByRole('combobox', { name: '当前环境' }));
    const listbox = await screen.findByRole('listbox', { name: '当前环境' });
    expect(within(listbox).getByRole('option', { name: 'Prod' })).toBeInTheDocument();
  });
});

/** 只喂 streamWbRequest 真正会用的那几样：状态、头、可读流。 */
function sseResponse(chunks: string[]) {
  let index = 0;
  return {
    status: 200,
    ok: true,
    headers: new Headers([['Content-Type', 'text/event-stream']]),
    body: {
      getReader: () => ({
        read: async () => (index >= chunks.length
          ? { done: true, value: undefined }
          : { done: false, value: new TextEncoder().encode(chunks[index++]) }),
      }),
    },
    text: async () => chunks.join(''),
  } as unknown as Response;
}

function jsonResponse(text: string) {
  return {
    status: 200,
    ok: true,
    headers: new Headers([['Content-Type', 'application/json']]),
    text: async () => text,
  } as unknown as Response;
}

function preBlocks() {
  return Array.from(document.querySelectorAll('pre')).map((node) => node.textContent ?? '');
}

describe('RequestPanel 流式与差异', () => {
  test('跨 chunk 的帧拼成一帧展示，原文视图仍是整段字节', async () => {
    seedDoc();
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['data: o', 'ne\n\n', 'event: tick\ndata: two\nid: 7\n\n'])));
    renderPanel();
    fireEvent.change(screen.getByLabelText('请求 URL'), { target: { value: 'https://api.test/events' } });
    fireEvent.click(screen.getByLabelText(/流式接收/));
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('one')).toBeInTheDocument();
    // 流结束后实时面板让位给响应区，帧不能凭空多也不能少
    await waitFor(() => expect(screen.queryByText('实时事件流')).toBeNull());
    expect(screen.getByText('two')).toBeInTheDocument();
    expect(screen.getByText('tick')).toBeInTheDocument();
    expect(screen.getByText('id 7')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '原文' }));
    const joined = preBlocks().find((text) => text.includes('data: o'));
    expect(joined).toBe('data: one\n\nevent: tick\ndata: two\nid: 7\n\n');
  });

  test('代理通道禁用流式勾选并说明原因', () => {
    seedDoc();
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'corsproxy.io' }));
    expect(screen.getByLabelText(/流式接收/)).toBeDisabled();
    expect(screen.getByText('代理通道取完才返回，只有直连能边收边看')).toBeInTheDocument();
  });

  test('同 URL 再发一次才出现差异页签，比的是上一条而不是自己', async () => {
    seedDoc();
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(call++ === 0 ? '{"v":1}' : '{"v":2}')));
    renderPanel();
    fireEvent.change(screen.getByLabelText('请求 URL'), { target: { value: 'https://api.test/item' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(screen.getByRole('tab', { name: '原文' })).toBeInTheDocument());
    expect(screen.queryByRole('tab', { name: '与上次差异' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    fireEvent.click(await screen.findByRole('tab', { name: '与上次差异' }));
    expect(await screen.findByText('+ {"v":2}')).toBeInTheDocument();
    expect(screen.getByText('- {"v":1}')).toBeInTheDocument();
  });
});

const { fakeOauth } = vi.hoisted(() => ({
  fakeOauth: {
    pending: null as null | {
      requestId: string;
      verifier: string;
      state: string;
      redirectUri: string;
      tokenUrl: string;
      clientId: string;
    },
    result: null as null | { kind: 'token'; token: { accessToken: string; tokenType: string; expiresAt?: number }; requestId: string },
  },
}));

vi.mock('@/lib/apiworkbench/oauth', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/apiworkbench/oauth')>();
  return {
    ...real,
    loadPendingAuth: () => fakeOauth.pending,
    stripAuthParams: (href: string) => href,
    completeAuthCode: async () => fakeOauth.result ?? { kind: 'none' as const },
  };
});

/** 授权码整页往返回来后的那一步：令牌先停在确认弹窗，点「存到本机」才进请求。 */
describe('RequestPanel 授权回跳的令牌确认', () => {
  function seedOauthRequest() {
    seedDoc({
      collections: [
        {
          id: 'c1',
          name: '演示',
          root: {
            id: 'f1',
            name: 'f1',
            folders: [],
            requests: [
              {
                id: 'r1',
                name: 'R1',
                method: 'GET',
                url: 'https://api.test/item',
                headers: [],
                body: { mode: 'none', text: '' },
                auth: { type: 'oauth2', grantType: 'authorization_code', tokenUrl: 'https://idp.test/token', clientId: 'cid' },
              },
            ],
          },
          variables: [],
        },
      ],
    });
  }

  beforeEach(() => {
    fakeOauth.pending = {
      requestId: 'r1',
      verifier: 'v',
      state: 's',
      redirectUri: 'https://app.test/#/tools/http-simulator?mode=request',
      tokenUrl: 'https://idp.test/token',
      clientId: 'cid',
    };
    fakeOauth.result = {
      kind: 'token',
      requestId: 'r1',
      token: { accessToken: 'redirect-token-987654', tokenType: 'Bearer', expiresAt: Date.now() + 3_600_000 },
    };
  });

  afterEach(() => {
    fakeOauth.pending = null;
    fakeOauth.result = null;
  });

  test('回跳令牌要先过确认，点存才写进请求', async () => {
    seedOauthRequest();
    renderPanel();

    expect(await screen.findByText('要把这个访问令牌存到本机吗？')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '授权' }));
    expect(screen.queryByLabelText('清除令牌')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '存到本机' }));
    expect(await screen.findByText('访问令牌已存到本机，记得保存请求才会留在集合里')).toBeInTheDocument();
    expect(screen.getByLabelText('清除令牌')).toBeInTheDocument();
    expect(localStorage.getItem(WORKBENCH_STORAGE_KEY)).not.toContain('redirect-token-987654');
  });

  test('点丢弃就把令牌留在原地，请求里不出现令牌', async () => {
    seedOauthRequest();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: '不存，丢弃' }));
    expect(await screen.findByText('令牌没有存到本机，已复制到剪贴板')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '授权' }));
    expect(screen.queryByLabelText('清除令牌')).toBeNull();
  });

  test('原请求不在集合里时不弹确认，直接说明令牌去了哪', async () => {
    seedDoc();
    fakeOauth.result = {
      kind: 'token',
      requestId: 'gone',
      token: { accessToken: 'redirect-token-987654', tokenType: 'Bearer' },
    };
    renderPanel();

    expect(await screen.findByText(/原请求没在集合里找到/)).toBeInTheDocument();
    expect(screen.queryByText('要把这个访问令牌存到本机吗？')).toBeNull();
  });
});
