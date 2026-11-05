import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import HttpToolkitTool from './HttpToolkitTool';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

/** 搜索面板只会写 `?mode=<subFeatures id>`，二级区域要在工具根上折成 `?sub=`。 */
function renderTool(entry: string) {
  localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      collections: [],
      environments: [],
      activeEnvId: null,
      mockEnabled: false,
      mockRoutes: [],
      history: [],
    }),
  );
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/tools/http-simulator"
          element={
            <>
              <LocationProbe />
              <I18nProvider>
                <ToastProvider>
                  <HttpToolkitTool />
                </ToastProvider>
              </I18nProvider>
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HttpToolkitTool 二级寻址', () => {
  test('?mode=graphql 折回请求页签并带上 sub', () => {
    renderTool('/tools/http-simulator?mode=graphql');
    expect(screen.getByTestId('location')).toHaveTextContent('?sub=graphql');
    expect(screen.getByRole('tab', { name: /WebSocket/ })).toBeInTheDocument();
  });

  test('真页签的 mode 不被改写', () => {
    renderTool('/tools/http-simulator?mode=mock');
    expect(screen.getByTestId('location')).toHaveTextContent('?mode=mock');
  });
});
