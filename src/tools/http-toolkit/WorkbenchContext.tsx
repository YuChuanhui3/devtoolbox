import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useToast } from '@/components/ui/Toast';
import { envInheritanceChain, loadWorkbench } from '@/lib/apiworkbench/store';
import { persistWorkbench, restoreWorkbench } from '@/lib/apiworkbench/persistence';
import { mergeVarLists, mergeVarScopes } from '@/lib/apiworkbench/vars';
import type { SendChannel } from '@/lib/net';
import type { WbCollection, WbEnvironment, WbVar, WorkbenchDoc } from '@/lib/apiworkbench/types';

interface WorkbenchApi {
  doc: WorkbenchDoc;
  update: (fn: (doc: WorkbenchDoc) => WorkbenchDoc) => void;
  /** 环境变量覆盖集合变量后的插值 scope；不传 collection 时只用环境。 */
  scopeFor: (collection?: WbCollection | null) => Record<string, string>;
  activeEnv: WbEnvironment | null;
  /** 当前环境连同它继承来的每一层（近→远）；界面用它说明变量到底来自哪里。 */
  envChain: WbEnvironment[];
  /** 继承链并成的一张变量表，脚本的 `pm.environment.*` 看的就是这个。 */
  envVars: WbVar[];
  /** 取数通道（代理源：浏览器/扩展/网络/程序）。会话内共享，状态栏弹层与请求面板共用。 */
  sendChannel: SendChannel;
  setSendChannel: (channel: SendChannel) => void;
  /** 右侧集合侧栏是否打开。状态栏按钮与请求面板内的切换共用这一份状态。 */
  collectionSidebarOpen: boolean;
  toggleCollectionSidebar: () => void;
}

const WorkbenchContext = createContext<WorkbenchApi | null>(null);

export function WorkbenchProvider({ children, initialChannel }: { children: ReactNode; initialChannel?: SendChannel }) {
  const { t } = useI18n();
  const toast = useToast();
  const [doc, setDoc] = useState<WorkbenchDoc>(() => loadWorkbench());
  const [sendChannel, setSendChannel] = useState<SendChannel>(initialChannel ?? { source: 'browser', mode: 'direct' });
  const [collectionSidebarOpen, setCollectionSidebarOpen] = useState(true);
  const toggleCollectionSidebar = useCallback(() => setCollectionSidebarOpen((open) => !open), []);
  const dirtyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);
  const pendingUpdates = useRef<Array<(doc: WorkbenchDoc) => WorkbenchDoc>>([]);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    restoreWorkbench().then((saved) => {
      if (active) {
        const restored = pendingUpdates.current.reduce((current, fn) => fn(current), saved);
        setDoc((current) => JSON.stringify(current) === JSON.stringify(restored) ? current : restored);
        pendingUpdates.current = [];
        hydrated.current = true;
        setReady(true);
      }
    }).catch(() => {
      if (!active) return;
      toast.error(t({ zh: '本地数据库读取或迁移失败，原数据已保留', en: 'Local database migration failed; existing data retained' }));
    });
    return () => { active = false; };
  }, []);
  const quotaWarnedRef = useRef(false);

  const update = useCallback((fn: (current: WorkbenchDoc) => WorkbenchDoc) => {
    if (!hydrated.current) pendingUpdates.current.push(fn);
    dirtyRef.current = true;
    setDoc((current) => fn(current));
  }, []);

  useEffect(() => {
    if (!ready || !dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      dirtyRef.current = false;
      writes.current = writes.current.then(() => persistWorkbench(doc)).then(() => { quotaWarnedRef.current = false; }).catch(() => {
      if (!quotaWarnedRef.current) {
        quotaWarnedRef.current = true;
        toast.error(t({
          zh: '本地存储写入失败（可能配额已满），请导出或清理旧集合',
          en: 'Local storage write failed (quota likely exhausted) — export or clean old collections',
        }));
      }
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [doc, ready, toast, t]);

  const value = useMemo<WorkbenchApi>(() => {
    const activeEnv = doc.environments.find((e) => e.id === doc.activeEnvId) ?? null;
    // 链是 [自己, 继承的父, 祖…]，而并表规则是后入者赢，所以从最远的一层铺回来。
    const envChain = activeEnv ? envInheritanceChain(doc.environments, activeEnv.id) : [];
    const envVars = mergeVarLists(...envChain.slice().reverse().map((item) => item.variables));
    return {
      doc,
      update,
      scopeFor: (collection) => mergeVarScopes(collection?.variables ?? [], envVars),
      activeEnv,
      envChain,
      envVars,
      sendChannel,
      setSendChannel,
      collectionSidebarOpen,
      toggleCollectionSidebar,
    };
  }, [doc, update, sendChannel, collectionSidebarOpen, toggleCollectionSidebar]);

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchApi {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error('useWorkbench 必须在 WorkbenchProvider 内使用');
  return ctx;
}
