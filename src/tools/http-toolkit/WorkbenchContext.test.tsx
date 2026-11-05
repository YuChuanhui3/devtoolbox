import { beforeEach, describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { WORKBENCH_STORAGE_KEY } from '@/lib/apiworkbench/store';
import type { WbCollection } from '@/lib/apiworkbench/types';
import { WorkbenchProvider, useWorkbench } from './WorkbenchContext';

const v = (key: string, value: string, enabled = true) => ({ id: `${key}-${value}`, key, value, enabled });

const collection: WbCollection = {
  id: 'c1',
  name: 'Demo',
  root: { id: 'f1', name: 'Demo', folders: [], requests: [] },
  variables: [v('token', 'collection'), v('only_here', 'yes')],
};

function seed(doc: Record<string, unknown>) {
  localStorage.setItem(
    WORKBENCH_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      collections: [collection],
      environments: [],
      activeEnvId: null,
      mockEnabled: false,
      mockRoutes: [],
      history: [],
      ...doc,
    }),
  );
}

function Probe() {
  const { scopeFor, envChain, envVars } = useWorkbench();
  const scope = scopeFor(collection);
  return (
    <div>
      <p>{`chain=${envChain.map((env) => env.name).join('←') || '-'}`}</p>
      <p>{`envVars=${envVars.map((row) => `${row.key}:${row.value}`).join(',') || '-'}`}</p>
      <p>{`scope=${Object.keys(scope).sort().map((key) => `${key}=${scope[key]}`).join(',')}`}</p>
    </div>
  );
}

function renderProbe() {
  render(
    <I18nProvider>
      <ToastProvider>
        <WorkbenchProvider>
          <Probe />
        </WorkbenchProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  useAppStore.setState({ locale: 'zh' });
});

describe('WorkbenchContext 变量作用域', () => {
  test('继承链近→远，父层只补本层没有的变量', () => {
    seed({
      environments: [
        { id: 'base', name: '基础层', variables: [v('token', 'parent'), v('host', 'api.test')] },
        { id: 'mid', name: '中间层', variables: [v('host', 'mid.test')], inheritId: 'base' },
        { id: 'prod', name: 'Prod', variables: [v('token', 'child')], inheritId: 'mid' },
      ],
      activeEnvId: 'prod',
    });
    renderProbe();

    expect(screen.getByText('chain=Prod←中间层←基础层')).toBeInTheDocument();
    expect(screen.getByText(/envVars=token:child,host:mid\.test/)).toBeInTheDocument();
    expect(screen.getByText(/host=mid\.test/)).toBeInTheDocument();
  });

  test('同名以环境为准，环境没定义的仍走集合', () => {
    seed({
      environments: [{ id: 'base', name: '基础层', variables: [v('token', 'parent')] }],
      activeEnvId: 'base',
    });
    renderProbe();

    expect(screen.getByText('scope=only_here=yes,token=parent')).toBeInTheDocument();
  });

  test('子层禁用同名变量就是不回填父层的值', () => {
    seed({
      environments: [
        { id: 'base', name: '基础层', variables: [v('token', 'parent')] },
        { id: 'prod', name: 'Prod', variables: [v('token', '', false)], inheritId: 'base' },
      ],
      activeEnvId: 'prod',
    });
    renderProbe();

    expect(screen.getByText('envVars=token:')).toBeInTheDocument();
    expect(screen.getByText('scope=only_here=yes,token=collection')).toBeInTheDocument();
  });

  test('没有启用环境时链为空，只剩集合', () => {
    seed({ environments: [{ id: 'base', name: '基础层', variables: [v('token', 'parent')] }] });
    renderProbe();

    expect(screen.getByText('chain=-')).toBeInTheDocument();
    expect(screen.getByText('scope=only_here=yes,token=collection')).toBeInTheDocument();
  });
});
