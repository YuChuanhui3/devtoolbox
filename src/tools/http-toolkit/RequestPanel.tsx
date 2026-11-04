import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { FETCH_MODES, proxyFetch, type FetchMode } from '@/lib/net';
import { newId } from '@/lib/apiworkbench/id';
import { blankRequest, newCollection, putRequest } from '@/lib/apiworkbench/tree';
import { collectMissing, interpolate } from '@/lib/apiworkbench/vars';
import type { WbHistoryEntry, WbRequest } from '@/lib/apiworkbench/types';
import { useWorkbench } from './WorkbenchContext';
import { CollectionTree } from './CollectionTree';
import { EnvironmentModal } from './EnvironmentModal';
import { HistoryList } from './HistoryList';
import { RequestEditor } from './RequestEditor';
import { ResponseViewer, type ResponseView } from './ResponseViewer';

const MODE_LABEL: Partial<Record<FetchMode, Localized>> = {
  direct: { zh: '直连', en: 'Direct' },
};
const MODE_NOTE: Record<FetchMode, Localized> = {
  direct: { zh: '受目标站点 CORS 限制，仅部分站点可用；支持全部方法与请求体', en: 'Limited by the target\'s CORS policy; supports all methods and bodies' },
  corsproxy: { zh: '公共 CORS 代理：请求 URL 会暴露给代理方，仅调试用、可能限速、不透传请求体', en: 'Public CORS proxy: the request URL is exposed to the proxy operator; debugging only, may be rate-limited, bodies not carried' },
  allorigins: { zh: '公共抓取代理：URL 会暴露给代理方，可返回状态与内容', en: 'Public fetch proxy: the URL is exposed to the proxy operator; returns status and content' },
};

interface Editing {
  request: WbRequest;
  /** null = 尚未归属任何集合（新请求未保存）。 */
  collectionId: string | null;
  folderId: string | null;
}

export function RequestPanel({ active: _active }: { active: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const { doc, update, scopeFor, activeEnv } = useWorkbench();
  const [mode, setMode] = useState<FetchMode>('direct');
  const [editing, setEditing] = useState<Editing>(() => ({ request: blankRequest(), collectionId: null, folderId: null }));
  const [result, setResult] = useState<ResponseView | null>(null);
  const [error, setError] = useState<Localized | null>(null);
  const [hint, setHint] = useState<Localized | undefined>();
  const [saving, setSaving] = useState(false);
  const [envModalOpen, setEnvModalOpen] = useState(false);

  const collection = doc.collections.find((c) => c.id === editing.collectionId) ?? null;
  const scope = scopeFor(collection);
  const req = editing.request;
  const missing = collectMissing(
    [
      req.url,
      ...req.headers.filter((h) => h.enabled).flatMap((h) => [h.key, h.value]),
      req.auth.token ?? '',
      req.auth.username ?? '',
      req.auth.password ?? '',
      req.body.mode === 'none' ? '' : req.body.text,
    ],
    scope,
  );

  const send = async () => {
    if (!req.url.trim() || missing.length > 0) return;
    setSaving(true);
    setError(null);
    setHint(undefined);
    setResult(null);
    try {
      const headers: Record<string, string> = {};
      for (const row of req.headers) {
        if (row.enabled && row.key.trim()) headers[interpolate(row.key, scope).text] = interpolate(row.value, scope).text;
      }
      if (req.auth.type === 'basic') {
        const token = typeof btoa === 'function'
          ? btoa(`${interpolate(req.auth.username ?? '', scope).text}:${interpolate(req.auth.password ?? '', scope).text}`)
          : Buffer.from(`${req.auth.username ?? ''}:${req.auth.password ?? ''}`).toString('base64');
        headers.Authorization = `Basic ${token}`;
      } else if (req.auth.type === 'bearer' && req.auth.token) {
        headers.Authorization = `Bearer ${interpolate(req.auth.token, scope).text}`;
      }
      const withBody = req.body.mode !== 'none' && req.body.text && req.method !== 'GET' && req.method !== 'HEAD';
      if (withBody && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = req.body.mode === 'json' ? 'application/json' : req.body.mode === 'form' ? 'application/x-www-form-urlencoded' : 'text/plain';
      }
      const response = await proxyFetch(interpolate(req.url, scope).text, {
        mode,
        method: req.method,
        headers: Object.keys(headers).length ? headers : undefined,
        body: withBody ? interpolate(req.body.text, scope).text : undefined,
      });
      setResult({ ...response, via: mode });
      const entry: WbHistoryEntry = {
        id: newId(),
        at: Date.now(),
        request: req,
        status: response.status,
        ms: response.ms,
        bytes: response.bytes,
        bodyExcerpt: response.text.slice(0, 4000),
        via: mode,
      };
      update((d) => ({ ...d, history: [entry, ...d.history].slice(0, 100) }));
    } catch (caught) {
      const err = toToolError(caught);
      setError(err.localized);
      setHint(err.hint);
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    let targetId = editing.collectionId;
    let folderId = editing.folderId;
    if (!targetId) {
      const created = newCollection(t({ zh: '我的集合', en: 'My collection' }));
      update((d) => ({ ...d, collections: [...d.collections, created] }));
      targetId = created.id;
      folderId = created.root.id;
    }
    update((d) => ({
      ...d,
      collections: d.collections.map((c) => (c.id === targetId ? putRequest(c, editing.request, folderId ?? c.root.id) : c)),
    }));
    setEditing((e) => ({ ...e, collectionId: targetId, folderId: folderId ?? e.folderId }));
    toast.success(t({ zh: '已保存到集合', en: 'Saved to collection' }));
  };

  return (
    <div className="space-y-4">
      <div>
        <Segmented
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '请求通道', en: 'Request channel' })}
          options={FETCH_MODES.map((item) => ({ value: item.id, label: t(MODE_LABEL[item.id] ?? item.label) }))}
        />
        <p className="px-1 pt-1 text-[11px] text-ink-3">{t(MODE_NOTE[mode])}</p>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="max-h-[560px] overflow-auto rounded-card border border-line bg-surface/60 p-2">
            <CollectionTree
              doc={doc}
              update={update}
              selectedRequestId={editing.collectionId ? editing.request.id : null}
              onSelectRequest={(collectionId, request) => {
                setEditing({ request, collectionId, folderId: null });
                setError(null);
              }}
              onNewRequest={(collectionId, folderId) => setEditing({ request: blankRequest(), collectionId, folderId })}
            />
          </div>
          <HistoryList
            history={doc.history}
            onSelect={(entry) => setEditing({ request: entry.request, collectionId: editing.collectionId, folderId: null })}
            onClear={() => update((d) => ({ ...d, history: [] }))}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <Panel
            title={t({ zh: '请求', en: 'Request' })}
            actions={
              <span className="flex items-center gap-1.5">
                <Select
                  value={doc.activeEnvId ?? ''}
                  onChange={(e) => update((d) => ({ ...d, activeEnvId: e.target.value || null }))}
                  aria-label={t({ zh: '当前环境', en: 'Active environment' })}
                  className="h-8 w-36 text-xs"
                  wrapperClassName="w-36"
                >
                  <option value="">{t({ zh: '无环境', en: 'No environment' })}</option>
                  {doc.environments.map((env) => (
                    <option key={env.id} value={env.id}>{env.name}</option>
                  ))}
                </Select>
                <Button variant="ghost" size="sm" onClick={() => setEnvModalOpen(true)} aria-label={t({ zh: '管理环境', en: 'Manage environments' })}>
                  <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </span>
            }
            subtitle={activeEnv
              ? t({ zh: `变量来自「${activeEnv.name}」${collection ? ` + 「${collection.name}」集合变量` : ''}`, en: `Variables from "${activeEnv.name}"${collection ? ` + "${collection.name}" collection variables` : ''}` })
              : t({ zh: '未选择环境；仅使用集合变量（如有）', en: 'No environment selected; only collection variables apply (if any)' })}
            bodyClassName="space-y-3"
          >
            <RequestEditor
              request={editing.request}
              onChange={(request) => setEditing((e) => ({ ...e, request }))}
              onSend={() => void send()}
              onSave={save}
              saving={saving}
              missing={missing}
              onImported={(imported) =>
                setEditing((e) => ({ ...e, request: { ...imported, id: e.request.id, name: imported.name } }))
              }
            />
          </Panel>

          <ResponseViewer result={result} error={error} hint={hint} />
        </div>
      </div>

      <EnvironmentModal open={envModalOpen} onClose={() => setEnvModalOpen(false)} />

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '集合、环境与历史保存在本机浏览器 localStorage，不上传；请求可引用 {{"{{变量}}"}}，缺失变量会高亮提醒。',
          en: 'Collections, environments, and history live in this browser\'s localStorage and are never uploaded; requests can reference {{"{{variables}}"}} and missing ones are flagged.',
        })}
      </p>
    </div>
  );
}
