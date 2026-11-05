import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { fetchToken } from '@/lib/apiworkbench/oauth';
import type { WbAuth } from '@/lib/apiworkbench/types';
import { RequestAuthEditor } from './RequestAuthEditor';

vi.mock('@/lib/apiworkbench/oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiworkbench/oauth')>();
  return { ...actual, fetchToken: vi.fn() };
});

const mockedFetchToken = vi.mocked(fetchToken);

beforeEach(() => {
  useAppStore.setState({ locale: 'zh' });
  mockedFetchToken.mockReset();
});

function oauthAuth(overrides: Partial<WbAuth> = {}): WbAuth {
  return { type: 'oauth2', grantType: 'client_credentials', clientId: 'cid', tokenUrl: 'https://idp.test/token', ...overrides };
}

function renderEditor(auth: WbAuth, onChange = vi.fn()) {
  render(
    <I18nProvider>
      <ToastProvider>
        <RequestAuthEditor auth={auth} scope={{}} requestId="r1" onChange={onChange} />
      </ToastProvider>
    </I18nProvider>,
  );
  return { onChange };
}

describe('RequestAuthEditor 的令牌确认', () => {
  test('取到令牌先问一句，没点头之前不写进请求', async () => {
    mockedFetchToken.mockResolvedValue({ accessToken: 'tok-1234567890', tokenType: 'Bearer', expiresAt: Date.now() + 60_000 });
    const { onChange } = renderEditor(oauthAuth());
    fireEvent.click(screen.getByRole('button', { name: '获取令牌' }));
    await waitFor(() => expect(screen.getByText('要把这个访问令牌存到本机吗？')).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'tok-1234567890' }));
  });

  test('点「存到本机」才落进 auth', async () => {
    mockedFetchToken.mockResolvedValue({ accessToken: 'tok-1234567890', tokenType: 'Bearer', expiresAt: Date.now() + 60_000 });
    const { onChange } = renderEditor(oauthAuth());
    fireEvent.click(screen.getByRole('button', { name: '获取令牌' }));
    await waitFor(() => expect(screen.getByText('要把这个访问令牌存到本机吗？')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '存到本机' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'tok-1234567890', tokenType: 'Bearer' }));
  });

  test('点「不存，丢弃」就什么都不写，弹窗关掉', async () => {
    mockedFetchToken.mockResolvedValue({ accessToken: 'tok-1234567890', tokenType: 'Bearer' });
    const { onChange } = renderEditor(oauthAuth());
    fireEvent.click(screen.getByRole('button', { name: '获取令牌' }));
    await waitFor(() => expect(screen.getByText('要把这个访问令牌存到本机吗？')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '不存，丢弃' }));
    await waitFor(() => expect(screen.queryByText('要把这个访问令牌存到本机吗？')).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'tok-1234567890' }));
  });

  test('已有的令牌仍然一眼可见、可清除', () => {
    const { onChange } = renderEditor(oauthAuth({ accessToken: 'kept-token-value-1234', tokenType: 'Bearer' }));
    expect(screen.getByText('Bearer · kept-t…1234')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清除令牌' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ accessToken: undefined }));
  });

  test('授权码模式走整页跳转，不给「获取令牌」按钮', () => {
    renderEditor(oauthAuth({ grantType: 'authorization_code', authUrl: 'https://idp.test/authorize', redirectUri: 'https://app.test/callback' }));
    expect(screen.getByRole('button', { name: '打开授权页' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '获取令牌' })).not.toBeInTheDocument();
  });
});
