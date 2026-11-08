import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Settings2, PanelLeft, FolderTree, History, Layers, Code2, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { ActionBar } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { copyText } from '@/lib/clipboard';
import { FETCH_MODES, type FetchMode } from '@/lib/net';
import { newId } from '@/lib/apiworkbench/id';
import { blankRequest, findRequest, newCollection, putRequest, walkRequests } from '@/lib/apiworkbench/tree';
import { collectMissing } from '@/lib/apiworkbench/vars';
import {
  DEFAULT_SCRIPT_DEADLINE_MS,
  applyEnvWrites,
  applyRequestPatch,
  type EnvWrite,
  type ScriptPhase,
} from '@/lib/apiworkbench/scriptEngine';
import { runScriptInSandbox, type ScriptOutcome } from '@/lib/apiworkbench/sandbox';
import { buildScriptPayload } from '@/lib/apiworkbench/scripts';
import { requestMethod, requestInterpolatedFields, sendWbRequest, streamWbRequest, type StreamedEvent, type WbResponse } from '@/lib/apiworkbench/send';
import { finalUrl } from '@/lib/apiworkbench/params';
import { completeAuthCode, loadPendingAuth, stripAuthParams, type OAuthToken } from '@/lib/apiworkbench/oauth';
import type { WbHistoryEntry, WbRequest } from '@/lib/apiworkbench/types';
import { useWorkbench } from './WorkbenchContext';
import { CollectionTree } from './CollectionTree';
import { EnvironmentModal } from './EnvironmentModal';
import { HistoryList } from './HistoryList';
import { CollectionImportModal } from './CollectionImportModal';
import { ShortcutHelp } from './ShortcutHelp';
import { TokenConsentModal } from './TokenConsentModal';
import { useWorkbenchShortcuts } from './useWorkbenchShortcuts';
import { IMPORT_FORMATS, type ImportedBundle } from '@/lib/apiworkbench/importers';
import { CodegenPanel } from './CodegenPanel';
import { RequestEditor } from './RequestEditor';
import { EventList } from './ResponseViews';
import { TestsPanel, type ScriptRun } from './TestsPanel';
import { ResponseViewer, type ResponseView } from './ResponseViewer';

/** 事件日志的上限：推流可以一直发，DOM 不能跟着一直长。 */
const MAX_STREAM_EVENTS = 200;

interface PreviousResponse {
  text: string;
  status: number;
  ms: number;
}

/** 差异视图的左半边，连同它属于哪个请求一起记着，改了 URL 就不会拿错对象比。 */
interface DiffBase extends PreviousResponse {
  key: string;
}

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

export function RequestPanel({ active, documentId, onDocumentChange }: { active: boolean; onNewTab?: () => void; documentId?: number; onDocumentChange?: (id: number, name: string, method: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { doc, update, scopeFor, activeEnv, envVars } = useWorkbench();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarView, setSidebarView] = useState<'collections' | 'history' | 'code'>('collections');
  const [mode, setMode] = useState<FetchMode>('direct');
  const [editing, setEditing] = useState<Editing>(() => ({ request: blankRequest(), collectionId: null, folderId: null }));
  const [result, setResult] = useState<ResponseView | null>(null);
  const [error, setError] = useState<Localized | null>(null);
  const [hint, setHint] = useState<Localized | undefined>();
  const [saving, setSaving] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [events, setEvents] = useState<StreamedEvent[]>([]);
  const [droppedEvents, setDroppedEvents] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  /** 同一 URL+方法在本次会话里发过的响应，供差异视图取上一条。 */
  const previousRef = useRef<Map<string, PreviousResponse>>(new Map());
  const [diffBase, setDiffBase] = useState<DiffBase | null>(null);
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  /** 沙箱看门狗时长：会话内可调，不进存档（存档里只有脚本正文）。 */
  const [scriptDeadline, setScriptDeadline] = useState(DEFAULT_SCRIPT_DEADLINE_MS);
  const [scriptRuns, setScriptRuns] = useState<ScriptRun[]>([]);
  const [scriptSkipped, setScriptSkipped] = useState<Localized | null>(null);
  /** 授权码回跳转来的令牌：先停在确认弹窗里，点头之后才写进请求。 */
  const [pendingToken, setPendingToken] = useState<{ token: OAuthToken; request: WbRequest; collectionId: string | null } | null>(null);

  useEffect(() => {
    if (documentId !== undefined) onDocumentChange?.(documentId, editing.request.name, requestMethod(editing.request));
  }, [documentId, onDocumentChange, editing.request.name, editing.request.method, editing.request.customMethod]);

  useEffect(() => {
    if (!active) return;
    const focus = () => {
      setSidebarOpen(true);
      setSidebarView('collections');
      requestAnimationFrame(() => searchRef.current?.focus());
    };
    const help = () => setHelpOpen((open) => !open);
    window.addEventListener('wb:search', focus);
    window.addEventListener('wb:help', help);
    return () => { window.removeEventListener('wb:search', focus); window.removeEventListener('wb:help', help); };
  }, [active]);

  const collection = doc.collections.find((c) => c.id === editing.collectionId) ?? null;
  const scope = scopeFor(collection);
  const req = editing.request;
  const missing = collectMissing(requestInterpolatedFields(req), scope);
  const proxying = mode !== 'direct';
  const historyKey = `${requestMethod(req)} ${finalUrl(req.url, req.params)}`;
  const previous = diffBase && diffBase.key === historyKey ? diffBase : null;

  // 代理通道拿不到增量字节，开着流式开关只会让下一次发送必然报错，所以切过去就关掉。
  useEffect(() => {
    if (mode !== 'direct') setStreaming(false);
  }, [mode]);

  // 换一个请求，上一个的脚本结果就不属于这里了，别留着让人以为这次也跑过。
  useEffect(() => {
    setScriptRuns([]);
    setScriptSkipped(null);
  }, [editing.request.id]);

  /** 把回跳换来的令牌先停在确认弹窗里：认得原请求才谈存不存，认不得只能复制令牌并说清楚。 */
  const deliverToken = useCallback(async (token: OAuthToken, requestId: string) => {
    const target = requestId ? findRequest(doc, requestId) : null;
    if (!target) {
      const copied = await copyText(token.accessToken);
      if (copied) {
        toast.info(t({
          zh: '原请求没在集合里找到，访问令牌已复制到剪贴板，可粘到 Bearer 里用',
          en: 'The originating request is not in a collection, so the token went to your clipboard — paste it into Bearer',
        }));
      } else {
        toast.error(t({
          zh: '原请求没在集合里找到，而浏览器也拒绝了剪贴板，下次请先保存请求再授权',
          en: 'The originating request is not in a collection and the clipboard was denied — save the request before authorizing next time',
        }));
      }
      return false;
    }
    const owner = doc.collections.find((c) => walkRequests(c.root).some((r) => r.id === requestId)) ?? null;
    setPendingToken({ token, request: target, collectionId: owner?.id ?? null });
    return true;
  }, [doc, t, toast]);

  /** 点头之后才把令牌写进编辑中的请求：这一步之前它只活在内存里。 */
  const keepPendingToken = useCallback(() => {
    const pending = pendingToken;
    setPendingToken(null);
    if (!pending) return;
    setEditing((e) => ({
      request: {
        ...pending.request,
        auth: {
          ...pending.request.auth,
          accessToken: pending.token.accessToken,
          tokenType: pending.token.tokenType,
          ...(typeof pending.token.expiresAt === 'number' ? { expiresAt: pending.token.expiresAt } : {}),
        },
      },
      collectionId: pending.collectionId ?? e.collectionId,
      folderId: null,
    }));
    toast.success(t({ zh: '访问令牌已存到本机，记得保存请求才会留在集合里', en: 'Token kept on this machine — save the request to keep it in the collection' }));
  }, [pendingToken, t, toast]);

  const discardPendingToken = useCallback(async () => {
    const pending = pendingToken;
    setPendingToken(null);
    if (!pending) return;
    const copied = await copyText(pending.token.accessToken);
    toast.info(t(copied
      ? { zh: '令牌没有存到本机，已复制到剪贴板', en: 'The token was not stored; it is on your clipboard' }
      : { zh: '令牌没有存到本机，浏览器也拒绝了剪贴板，这次就丢弃了', en: 'The token was not stored and the clipboard was denied, so it is gone' }));
  }, [pendingToken, t, toast]);

  /**
   * 授权码模式是整页往返：回来时地址栏带着 code/state，中间态在 sessionStorage 里。
   * 只在当前页签可见时处理——LazyPanel 挂载后不卸载，隐藏页签抢着换取令牌会撞上别人。
   */
  const redirectHandled = useRef(false);
  useEffect(() => {
    if (!active || redirectHandled.current) return;
    if (!loadPendingAuth()) return;
    redirectHandled.current = true;
    const run = async () => {
      const query = window.location.search;
      const hash = window.location.hash;
      window.history.replaceState(null, '', stripAuthParams(window.location.href));
      try {
        const result = await completeAuthCode(query, hash, { scope });
        if (result.kind === 'none') return;
        if (result.kind === 'error') {
          toast.error(t(result.message));
          return;
        }
        if (!await deliverToken(result.token, result.requestId)) return;
        // 令牌停在确认弹窗里，存与不存由上面的按钮决定。
      } catch (caught) {
        toast.error(t(toToolError(caught).localized));
      }
    };
    void run();
  }, [active, scope, t, toast, deliverToken]);

  /** `pm.environment.*` 落到当前环境；没有启用环境时什么都不写，面板会说清这些写入没落地。 */
  const persistEnvWrites = useCallback((writes: EnvWrite[]) => {
    if (writes.length === 0) return;
    update((d) => ({
      ...d,
      environments: d.environments.map((env) => (env.id === d.activeEnvId ? { ...env, variables: applyEnvWrites(env.variables, writes) } : env)),
    }));
  }, [update]);

  /**
   * 跑一个阶段的脚本，顺手把结果记进面板。
   * 每次运行都是一个新沙箱线程，跑完即回收；这里不 reject，跑不成也是一种返回值。
   */
  const runScriptPhase = useCallback(async (
    phase: ScriptPhase,
    script: string,
    request: WbRequest,
    scopeNow: Record<string, string>,
    response?: WbResponse | null,
  ): Promise<ScriptOutcome> => {
    const outcome = await runScriptInSandbox(buildScriptPayload({
      phase,
      script,
      request,
      scope: scopeNow,
      envVars,
      response,
      deadlineMs: scriptDeadline,
      // 子请求跟着界面当前的取数通道走：代理模式下它同样出不了代理。
      sendChannel: { mode },
    }));
    setScriptRuns((prev) => [...prev.filter((item) => item.phase !== phase), { phase, outcome }]);
    return outcome;
  }, [envVars, mode, scriptDeadline]);

  const send = async () => {
    const preScript = (req.preScript ?? '').trim();
    if (!req.url.trim()) return;
    // 缺变量本来就拦住发送；有预请求脚本时先让脚本跑，脚本可能正是来补这些变量的。
    if (missing.length > 0 && !preScript) return;
    setSaving(true);
    setError(null);
    setHint(undefined);
    setResult(null);
    setEvents([]);
    setDroppedEvents(0);
    setScriptRuns([]);
    setScriptSkipped(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const collected: StreamedEvent[] = [];
    let working = req;
    let runScope = scope;
    try {
      if (preScript) {
        const outcome = await runScriptPhase('prerequest', preScript, working, runScope);
        const pre = outcome.kind === 'ok' ? outcome.result : null;
        if (pre) {
          working = applyRequestPatch(working, pre.patch);
          runScope = { ...runScope, ...pre.varWrites };
          persistEnvWrites(pre.envWrites);
        }
        if (!pre || pre.error) {
          setError({ zh: '预请求脚本没跑通，请求没有发出', en: 'The pre-request script did not finish, so the request was not sent' });
          setHint({
            zh: '原因和行号见下方「脚本结果」。脚本没跑通就不发请求，免得拿一份改错了的请求去打线上。',
            en: 'The reason and line number are in Script results below. A failed pre-request script blocks the send, so a half-edited request never leaves.',
          });
          return;
        }
        const stillMissing = collectMissing(requestInterpolatedFields(working), runScope);
        if (stillMissing.length > 0) {
          setError({
            zh: `预请求脚本跑完了，变量仍然缺：${stillMissing.map((name) => `{{${name}}}`).join(' ')}`,
            en: `The pre-request script ran but these variables are still undefined: ${stillMissing.map((name) => `{{${name}}}`).join(' ')}`,
          });
          setHint({
            zh: '脚本里用 pm.variables.set 只影响这一次发送；要长期生效就 pm.environment.set 写进当前环境。',
            en: 'pm.variables.set only covers this send; use pm.environment.set to keep values in the active environment.',
          });
          return;
        }
      }
      const base = { scope: runScope, mockEnabled: doc.mockEnabled, mockRoutes: doc.mockRoutes, mode };
      const response = streaming
        ? await streamWbRequest(working, {
            ...base,
            signal: controller.signal,
            onEvent: (event) => {
              collected.push(event);
              if (collected.length > MAX_STREAM_EVENTS) {
                // 只留最近这些：界面跟得上，也不假装历史帧还在。
                setDroppedEvents(collected.length - MAX_STREAM_EVENTS);
                setEvents(collected.slice(-MAX_STREAM_EVENTS));
              } else {
                setEvents([...collected]);
              }
            },
          })
        : await sendWbRequest(working, base);
      // 脚本可能改过 URL，比较基准要按真正发出去的那条算，不然差异视图会拿错对象。
      const sentKey = `${requestMethod(working)} ${finalUrl(working.url, working.params)}`;
      // 差异视图要比的是「这一条之前的那一条」，所以先取旧值再覆盖；没有旧值就不给差异页签。
      const prior = response.status > 0 ? previousRef.current.get(sentKey) : undefined;
      setDiffBase(prior && sentKey === historyKey ? { key: historyKey, ...prior } : null);
      if (response.status > 0) previousRef.current.set(sentKey, { text: response.text, status: response.status, ms: response.ms });
      setResult({
        ...response,
        ...(streaming ? { events: collected.slice(-MAX_STREAM_EVENTS) } : {}),
      });
      if (response.status > 0) {
        const entry: WbHistoryEntry = {
          id: newId(),
          at: Date.now(),
          request: working,
          status: response.status,
          ms: response.ms,
          bytes: response.bytes,
          bodyExcerpt: response.text.slice(0, 4000),
          via: response.via,
        };
        update((d) => ({ ...d, history: [entry, ...d.history].slice(0, 100) }));
      }
      const testScript = (working.testScript ?? '').trim();
      if (testScript && response.status > 0) {
        const outcome = await runScriptPhase('test', testScript, working, runScope, response);
        const post = outcome.kind === 'ok' ? outcome.result : null;
        if (post) persistEnvWrites(post.envWrites);
      } else if (testScript) {
        setScriptSkipped({
          zh: '测试脚本未执行：这次没有拿到可读的响应',
          en: 'The test script did not run: there was no readable response to test',
        });
      }
    } catch (caught) {
      const err = toToolError(caught);
      setError(err.localized);
      setHint(err.hint);
      if ((req.testScript ?? '').trim()) {
        setScriptSkipped({
          zh: '测试脚本未执行：请求没能发出，没有响应可测',
          en: 'The test script did not run: the request never got a response to test',
        });
      }
    } finally {
      abortRef.current = null;
      setSaving(false);
    }
  };

  const stop = () => abortRef.current?.abort();

  /** 还没有归属集合时先建一个「我的集合」，保存与另存都走这一条路。 */
  const ensureTarget = () => {
    if (editing.collectionId) return { targetId: editing.collectionId, folderId: editing.folderId };
    const created = newCollection(t({ zh: '我的集合', en: 'My collection' }));
    update((d) => ({ ...d, collections: [...d.collections, created] }));
    return { targetId: created.id, folderId: created.root.id as string | null };
  };

  const save = () => {
    const { targetId, folderId } = ensureTarget();
    update((d) => ({
      ...d,
      collections: d.collections.map((c) => (c.id === targetId ? putRequest(c, editing.request, folderId ?? c.root.id) : c)),
    }));
    setEditing((e) => ({ ...e, collectionId: targetId, folderId: folderId ?? e.folderId }));
    toast.success(t({ zh: '已保存到集合', en: 'Saved to collection' }));
  };

  /** 另存副本：同文件夹里放一份换了 id 的，省得手抄 URL 和请求头。 */
  const saveAs = () => {
    const copy = { ...req, id: newId(), name: `${req.name}${t({ zh: ' 副本', en: ' copy' })}` };
    const { targetId, folderId } = ensureTarget();
    update((d) => ({
      ...d,
      collections: d.collections.map((c) => (c.id === targetId ? putRequest(c, copy, folderId ?? c.root.id) : c)),
    }));
    setEditing({ request: copy, collectionId: targetId, folderId: folderId ?? null });
    toast.success(t({ zh: `已另存为「${copy.name}」`, en: `Saved a copy as "${copy.name}"` }));
  };

  useWorkbenchShortcuts(active, {
    onSend: () => void send(),
    onSave: save,
    onSaveAs: saveAs,
    onFocusSearch: () => searchRef.current?.focus(),
    onOpenImport: () => setImportOpen(true),
    onToggleHelp: () => setHelpOpen((open) => !open),
  });

  const importCollection = (bundle: ImportedBundle) => {
    // 三种格式名在中英文里同字面，所以一次 t() 就够，不用拼两种语言。
    const source = t(IMPORT_FORMATS.find((item) => item.id === bundle.format)?.label ?? { zh: '外来文件', en: 'an imported file' });
    const names = bundle.collections.map((c) => c.name);
    update((d) => ({
      ...d,
      collections: [...d.collections, ...bundle.collections],
      // 同名环境不合并：Hoppscotch 允许几层同名环境，悄悄丢一个比留着更难解释。
      environments: [...d.environments, ...bundle.environments],
    }));
    setImportOpen(false);
    toast.success(t({
      zh: `已从 ${source} 导入 ${bundle.collections.length} 个集合（${names.join('、')}），共 ${bundle.requestCount} 个请求${bundle.environments.length ? `，外加 ${bundle.environments.length} 个环境` : ''}`,
      en: `Imported ${bundle.collections.length} collection(s) (${names.join(', ')}) from ${source} with ${bundle.requestCount} requests${bundle.environments.length ? `, plus ${bundle.environments.length} environment(s)` : ''}`,
    }));
    if (bundle.ignored.length > 0) {
      toast.info(t({
        zh: `已丢弃或裁剪：${bundle.ignored.map((note) => t(note)).join('、')}`,
        en: `Dropped or trimmed: ${bundle.ignored.map((note) => t(note)).join(', ')}`,
      }));
    }
  };

  return (
    <div className="wb-request-panel">
        <span className="wb-tab-environment">
          <Select
            size="sm"
            value={doc.activeEnvId ?? ''}
            onChange={(e) => update((d) => ({ ...d, activeEnvId: e.target.value || null }))}
            aria-label={t({ zh: '当前环境', en: 'Active environment' })}
            wrapperClassName="w-40"
          >
            <option value="">{t({ zh: '无环境', en: 'No environment' })}</option>
            {doc.environments.map((env) => (
              <option key={env.id} value={env.id}>{env.name}</option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setEnvModalOpen(true)} aria-label={t({ zh: '连接设置内管理环境', en: 'Manage connection environments' })}>
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)} aria-label={t({ zh: '快捷键说明', en: 'Keyboard shortcuts' })}>
            <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </span>


      <div className={`wb-request-layout${sidebarOpen ? '' : ' wb-sidebar-hidden'}`}>
        <aside className="wb-sidebar" hidden={!sidebarOpen}>
          <div className="wb-sidebar-breadcrumb">{t({ zh: '个人工作区', en: 'Personal Workspace' })}<ChevronRight size={12} />{t({ zh: '集合', en: 'Collections' })}</div>
          <div className="wb-sidebar-tabs">
            <button type="button" title={t({ zh: '集合', en: 'Collections' })} aria-label={t({ zh: '集合面板', en: 'Collections panel' })} aria-pressed={sidebarView === 'collections'} onClick={() => setSidebarView('collections')}><FolderTree size={16} /></button>
            <button type="button" title={t({ zh: '环境', en: 'Environments' })} aria-label={t({ zh: '管理环境', en: 'Manage environments' })} onClick={() => setEnvModalOpen(true)}><Layers size={16} /></button>
            <button type="button" title={t({ zh: '历史', en: 'History' })} aria-label={t({ zh: '历史面板', en: 'History panel' })} aria-pressed={sidebarView === 'history'} onClick={() => setSidebarView('history')}><History size={16} /></button>
            <button type="button" title={t({ zh: '代码生成', en: 'Code generation' })} aria-label={t({ zh: '代码生成面板', en: 'Code generation panel' })} aria-pressed={sidebarView === 'code'} onClick={() => setSidebarView('code')}><Code2 size={16} /></button>
          </div>
          <div hidden={sidebarView !== 'collections'}>
          <CollectionTree
            doc={doc}
            update={update}
            selectedRequestId={editing.collectionId ? editing.request.id : null}
            onSelectRequest={(collectionId, request) => {
              setEditing({ request, collectionId, folderId: null });
              setError(null);
            }}
            onNewRequest={(collectionId, folderId) => setEditing({ request: blankRequest(), collectionId, folderId })}
            onImport={() => setImportOpen(true)}
            searchRef={searchRef}
          />
          </div>
          <div hidden={sidebarView !== 'history'}>
          <HistoryList
            history={doc.history}
            onSelect={(entry) => setEditing({ request: entry.request, collectionId: editing.collectionId, folderId: null })}
            onClear={() => update((d) => ({ ...d, history: [] }))}
          />
          </div>
          <div hidden={sidebarView !== 'code'} className="wb-sidebar-code"><CodegenPanel request={req} /></div>
        </aside>

        <div className="wb-editor-column">
          <Panel className="wb-request-card" noPadding>
            <RequestEditor
              request={editing.request}
              scope={scope}
              proxying={proxying}
              deadlineMs={scriptDeadline}
              onDeadlineChange={setScriptDeadline}
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

          {saving && streaming && events.length > 0 ? (
            <Panel
              title={t({ zh: '实时事件流', en: 'Live events' })}
              actions={<Badge tone="accent">{events.length}</Badge>}
            >
              <EventList events={events} aborted={false} discarded={false} />
              {droppedEvents > 0 ? (
                <p className="mt-2 text-[11px] text-ink-3">
                  {t({
                    zh: `为了跟得上推流，只保留最近 ${MAX_STREAM_EVENTS} 帧，已丢掉最早 ${droppedEvents} 帧`,
                    en: `Keeping up means only the last ${MAX_STREAM_EVENTS} frames; the earliest ${droppedEvents} were dropped`,
                  })}
                </p>
              ) : null}
            </Panel>
          ) : null}

          <ResponseViewer result={result} error={error} hint={hint} previous={previous} requestUrl={req.url} />

          {scriptRuns.length || scriptSkipped ? (
            <TestsPanel runs={scriptRuns} envName={activeEnv?.name ?? null} skipped={scriptSkipped} />
          ) : null}
        </div>
      </div>

      <details className="wb-connection"><summary>{t({ zh: '拦截器与连接设置', en: 'Interceptor & connection settings' })}<span>{t(MODE_LABEL[mode] ?? { zh: mode, en: mode })}</span></summary>
      <ActionBar>
        <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={t({ zh: '切换集合侧栏', en: 'Toggle collection sidebar' })} aria-expanded={sidebarOpen}><PanelLeft size={15} /></Button>
        <Segmented
          size="sm"
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '请求通道', en: 'Request channel' })}
          options={FETCH_MODES.map((item) => ({ value: item.id, label: t(MODE_LABEL[item.id] ?? item.label) }))}
        />
        <Checkbox
          checked={streaming}
          onChange={setStreaming}
          disabled={proxying}
          label={<span className="text-xs">{t({ zh: '流式接收', en: 'Stream' })}</span>}
          description={
            proxying
              ? t({ zh: '代理通道取完才返回，只有直连能边收边看', en: 'Proxies return everything at once; only direct can stream' })
              : t({ zh: '边收边解析事件帧，可随时停止', en: 'Parse frames as they arrive; stop any time' })
          }
        />
        {saving && streaming ? (
          <Button size="sm" variant="secondary" onClick={stop}>
            {t({ zh: '停止', en: 'Stop' })}
          </Button>
        ) : null}

        <p className="basis-full text-[11px] leading-4 text-ink-3">
          {t(MODE_NOTE[mode])}
          {doc.mockEnabled
            ? t({
                zh: `。Mock 拦截已开启：命中 ${doc.mockRoutes.filter((r) => r.enabled).length} 条启用路由中的任一条即本地作答`,
                en: `. Mock interception is on: a hit on any of ${doc.mockRoutes.filter((r) => r.enabled).length} enabled routes is answered locally`,
              })
            : ''}
        </p>
      </ActionBar>
      </details>
      <EnvironmentModal open={envModalOpen} onClose={() => setEnvModalOpen(false)} />
      <CollectionImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={importCollection} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <TokenConsentModal token={pendingToken?.token ?? null} onKeep={keepPendingToken} onDiscard={() => void discardPendingToken()} />
    </div>
  );
}
