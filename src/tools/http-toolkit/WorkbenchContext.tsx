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
import { envInheritanceChain, loadWorkbench, saveWorkbench } from '@/lib/apiworkbench/store';
import { mergeVarLists, mergeVarScopes } from '@/lib/apiworkbench/vars';
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
}

const WorkbenchContext = createContext<WorkbenchApi | null>(null);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const toast = useToast();
  const [doc, setDoc] = useState<WorkbenchDoc>(() => loadWorkbench());
  const dirtyRef = useRef(false);
  const quotaWarnedRef = useRef(false);

  const update = useCallback((fn: (current: WorkbenchDoc) => WorkbenchDoc) => {
    dirtyRef.current = true;
    setDoc((current) => fn(current));
  }, []);

  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      dirtyRef.current = false;
      if (!saveWorkbench(doc) && !quotaWarnedRef.current) {
        quotaWarnedRef.current = true;
        toast.error(t({
          zh: '本地存储写入失败（可能配额已满），请导出或清理旧集合',
          en: 'Local storage write failed (quota likely exhausted) — export or clean old collections',
        }));
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [doc, toast, t]);

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
    };
  }, [doc, update]);

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchApi {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error('useWorkbench 必须在 WorkbenchProvider 内使用');
  return ctx;
}
