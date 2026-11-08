import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { useAppStore } from '@/store/appStore';
import HoppscotchTool from './HoppscotchTool';

vi.mock('./HttpToolkitTool', () => ({ default: () => <div>Local extensions</div> }));
const fetchStatus = vi.fn();
beforeEach(() => {
  useAppStore.setState({ locale: 'zh' });
  vi.stubGlobal('fetch', fetchStatus);
  fetchStatus.mockReset();
});
function mount(query = '') {
  return render(<MemoryRouter initialEntries={[`/tools/http-simulator${query}`]}><I18nProvider><HoppscotchTool /></I18nProvider></MemoryRouter>);
}
describe('complete Hoppscotch integration', () => {
  test('mounts the actual application only when the static client is ready', async () => {
    fetchStatus.mockResolvedValue({ ok: true, json: async () => ({ ready: true, url: 'http://127.0.0.1:3173' }) });
    mount();
    const frame = await screen.findByTitle('Hoppscotch API workspace');
    expect(frame).toHaveAttribute('src', 'http://127.0.0.1:3173/');
    expect(frame).toHaveAttribute('allow', expect.stringContaining('clipboard-write'));
  });
  test('reports a stopped static client instead of presenting it as working', async () => {
    fetchStatus.mockResolvedValue({ ok: true, json: async () => ({ ready: false, url: 'http://127.0.0.1:3173' }) });
    mount();
    expect(await screen.findByRole('button', { name: '重新连接' })).toBeInTheDocument();
    expect(screen.getByText('npm run api:start')).toBeInTheDocument();
    expect(screen.queryByTitle('Hoppscotch API workspace')).toBeNull();
  });
  test('does not embed an executable URL from a malformed status response', async () => {
    fetchStatus.mockResolvedValue({ ok: true, json: async () => ({ ready: true, url: 'javascript:alert(1)' }) });
    mount();
    await screen.findByRole('button', { name: '重新连接' });
    expect(screen.queryByTitle('Hoppscotch API workspace')).toBeNull();
  });
  test('routes MQTT search links into the upstream realtime client', async () => {
    fetchStatus.mockResolvedValue({ ok: true, json: async () => ({ ready: true, url: 'http://127.0.0.1:3173' }) });
    mount('?mode=mqtt');
    expect(await screen.findByTitle('Hoppscotch API workspace')).toHaveAttribute('src', 'http://127.0.0.1:3173/realtime/mqtt');
  });
  test('retains access to the old local Mock extension', async () => {
    mount('?mode=mock');
    expect(await screen.findByText('Local extensions')).toBeInTheDocument();
    expect(fetchStatus).not.toHaveBeenCalled();
  });
  test('exposes migration without administration from the integration menu', async () => {
    fetchStatus.mockResolvedValue({ ok: true, json: async () => ({ ready: true, url: 'http://127.0.0.1:3173' }) });
    mount();
    await screen.findByTitle('Hoppscotch API workspace');
    fireEvent.click(screen.getByRole('button', { name: '工具箱集成菜单' }));
    expect(screen.queryByRole('link', { name: '实例管理' })).toBeNull();
    expect(screen.queryByRole('link', { name: '本地登录邮件' })).toBeNull();
    expect(screen.getByRole('button', { name: '导出旧版集合供导入' })).toBeInTheDocument();
  });
});
