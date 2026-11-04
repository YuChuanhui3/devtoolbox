import { useMemo, useState } from 'react';
import { FlaskConical, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
import { CopyButton, DownloadButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { newId } from '@/lib/apiworkbench/id';
import { matchMockRoute, renderMockBody, buildMockSnapshot } from '@/lib/apiworkbench/mock';
import { WB_METHODS, type WbMockMethod, type WbMockRoute } from '@/lib/apiworkbench/types';
import { useWorkbench } from './WorkbenchContext';

const METHOD_OPTIONS: WbMockMethod[] = ['*', ...WB_METHODS];

function blankRoute(): WbMockRoute {
  return {
    id: newId(),
    enabled: true,
    method: 'GET',
    path: '/users/:id',
    status: 200,
    headers: [],
    body: '{\n  "id": "{{params.id}}",\n  "trace": "{{$uuid}}"\n}',
    delayMs: 0,
  };
}

export function MockPanel({ active: _active }: { active: boolean }) {
  const { t } = useI18n();
  const { doc, update } = useWorkbench();
  const [probeMethod, setProbeMethod] = useState<WbMockMethod>('GET');
  const [probePath, setProbePath] = useState('/users/42');

  const probe = useMemo(() => {
    const hit = matchMockRoute(doc.mockRoutes, probeMethod, probePath);
    if (!hit) return null;
    return { route: hit.route, text: renderMockBody(hit.route, { params: hit.params }).text };
  }, [doc.mockRoutes, doc.mockRoutes.length, probeMethod, probePath]);

  const patchRoute = (id: string, patch: Partial<WbMockRoute>) =>
    update((d) => ({ ...d, mockRoutes: d.mockRoutes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  const removeRoute = (id: string) => update((d) => ({ ...d, mockRoutes: d.mockRoutes.filter((r) => r.id !== id) }));

  const snapshot = useMemo(() => JSON.stringify(buildMockSnapshot(doc, 'api-workbench'), null, 2), [doc.mockRoutes]);

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: '本地拦截 Mock', en: 'Local intercepting mock' })}
        subtitle={t({
          zh: '开启后，请求页签发送前先匹配下面的路由；命中就本地生成响应，完全不发网络请求。',
          en: 'While on, the request tab matches these routes before sending; a hit is answered locally with zero network traffic.',
        })}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Switch
            checked={doc.mockEnabled}
            onChange={(mockEnabled) => update((d) => ({ ...d, mockEnabled }))}
            label={t({ zh: '拦截开关', en: 'Interception switch' })}
          />
          <Badge tone={doc.mockEnabled ? 'success' : 'neutral'}>
            {doc.mockEnabled
              ? t({ zh: `${doc.mockRoutes.filter((r) => r.enabled).length} 条路由生效中`, en: `${doc.mockRoutes.filter((r) => r.enabled).length} routes armed` })
              : t({ zh: '已关闭，请求照常发送', en: 'Off; requests go out as usual' })}
          </Badge>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => update((d) => ({ ...d, mockRoutes: [...d.mockRoutes, blankRoute()] }))}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '新增路由', en: 'Add route' })}
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 p-2">
          <Select
            value={probeMethod}
            onChange={(e) => setProbeMethod(e.target.value as WbMockMethod)}
            aria-label={t({ zh: '测试方法', en: 'Probe method' })}
            className="h-8 w-24 text-xs"
            wrapperClassName="w-24"
          >
            {METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
          <Input
            value={probePath}
            onChange={(e) => setProbePath(e.target.value)}
            placeholder={t({ zh: '输入路径，如 /users/42', en: 'Path to probe, e.g. /users/42' })}
            className="h-8 flex-1 text-xs"
          />
          <span className="flex items-center gap-1 text-xs text-ink-3">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          {probe ? (
            <Badge tone="success">
              {t({ zh: `命中 ${probe.route.method} ${probe.route.path} → ${probe.route.status}`, en: `Hits ${probe.route.method} ${probe.route.path} → ${probe.route.status}` })}
            </Badge>
          ) : (
            <Badge tone="neutral">{t({ zh: '无路由命中', en: 'No route matches' })}</Badge>
          )}
        </div>
        {probe ? (
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-surface-2 p-2 font-mono text-[11px] leading-4 text-ink-2">{probe.text}</pre>
        ) : null}
      </Panel>

      <Panel
        title={t({ zh: `路由（${doc.mockRoutes.length}）`, en: `Routes (${doc.mockRoutes.length})` })}
        subtitle={t({
          zh: '路径匹配打分：静态段 > :参数 > * 通配；同分取先声明者。body 支持 {{params.x}} 与 {{$uuid}} 等模板。',
          en: 'Segment scoring: static > :param > * wildcard; ties go to the earlier route. Bodies support {{params.x}} and {{$uuid}} templates.',
        })}
        bodyClassName="space-y-2"
      >
        {doc.mockRoutes.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-3">
            {t({
              zh: '还没有路由。可手动新增，或到 OpenAPI 页签从 spec 一键生成。',
              en: 'No routes yet. Add one manually, or generate them from a spec in the OpenAPI tab.',
            })}
          </p>
        ) : null}
        {doc.mockRoutes.map((route) => (
          <div key={route.id} className={`rounded-card border border-line p-2.5 ${route.enabled ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <Switch
                checked={route.enabled}
                onChange={(enabled) => patchRoute(route.id, { enabled })}
                label={t({ zh: '启用', en: 'Enabled' })}
                className="mr-1"
              />
              <Select
                value={route.method}
                onChange={(e) => patchRoute(route.id, { method: e.target.value as WbMockMethod })}
                aria-label={t({ zh: '方法', en: 'Method' })}
                className="h-8 w-24 text-xs"
                wrapperClassName="w-24"
              >
                {METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
              <Input
                value={route.path}
                onChange={(e) => patchRoute(route.id, { path: e.target.value })}
                placeholder="/users/:id"
                aria-label={t({ zh: '路径', en: 'Path' })}
                className="h-8 min-w-40 flex-1 font-mono text-xs"
              />
              <Input
                type="number"
                value={route.status}
                onChange={(e) => patchRoute(route.id, { status: Math.min(599, Math.max(100, Math.round(Number(e.target.value) || 200))) })}
                aria-label={t({ zh: '状态码', en: 'Status' })}
                className="h-8 w-20 text-xs"
              />
              <Input
                type="number"
                value={route.delayMs}
                onChange={(e) => patchRoute(route.id, { delayMs: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                aria-label={t({ zh: '延迟毫秒', en: 'Delay ms' })}
                className="h-8 w-24 text-xs"
              />
              <ConfirmButton
                onConfirm={() => removeRoute(route.id)}
                confirmLabel={t({ zh: '删除该路由？', en: 'Delete this route?' })}
                variant="ghost"
                size="sm"
                aria-label={t({ zh: '删除路由', en: 'Delete route' })}
              >
                {t({ zh: '删除', en: 'Delete' })}
              </ConfirmButton>
            </div>
            <Textarea
              value={route.body}
              onChange={(e) => patchRoute(route.id, { body: e.target.value })}
              rows={3}
              spellCheck={false}
              aria-label={t({ zh: '响应体模板', en: 'Response body template' })}
              className="mt-2 font-mono text-[11px] leading-4"
            />
          </div>
        ))}
      </Panel>

      <Panel
        title={t({ zh: '导出快照 / 部署 Worker', en: 'Snapshot export / Worker deploy' })}
        subtitle={t({
          zh: '把启用的路由导出为 JSON，粘贴进 workers/api-mock 后即可部署成你自己的假后端，供本机以外的程序访问；本仓库跑 dev server 时也可用 /__mock/<路径> 预览同一逻辑。',
          en: 'Export the enabled routes as JSON, paste it into workers/api-mock, and deploy your own fake backend reachable from outside this page; with this repo\'s dev server you can also preview the same logic under /__mock/<path>.',
        })}
        bodyClassName="space-y-2"
      >
        <Textarea readOnly rows={6} value={snapshot} spellCheck={false} className="font-mono text-[11px] leading-4" aria-label={t({ zh: 'mock 快照 JSON', en: 'Mock snapshot JSON' })} />
        <div className="flex items-center gap-2">
          <CopyButton text={snapshot} label={t({ zh: '复制快照', en: 'Copy snapshot' })} />
          <DownloadButton
            filename="api-mock-snapshot.json"
            content={snapshot}
            mime="application/json;charset=utf-8"
            label={t({ zh: '下载 JSON', en: 'Download JSON' })}
          />
          <span className="text-[11px] text-ink-3">
            {t({ zh: `共 ${doc.mockRoutes.filter((r) => r.enabled).length} 条启用路由`, en: `${doc.mockRoutes.filter((r) => r.enabled).length} enabled routes included` })}
          </span>
        </div>
      </Panel>

      <p className="flex items-start gap-2 rounded-card border border-line bg-surface/60 p-3 text-[11px] leading-5 text-ink-3">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t({
          zh: '拦截只影响本工作台的发送；部署的 Worker 是可选的第二步，供 Postman 之外的前端同事或本机脚本使用。敏感数据不要写进快照。',
          en: 'Interception only affects this workbench. Deploying the Worker is an optional second step for teammates and local scripts. Keep secrets out of the snapshot.',
        })}
      </p>
    </div>
  );
}
