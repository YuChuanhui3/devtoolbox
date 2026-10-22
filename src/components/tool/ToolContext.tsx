import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ToolMeta } from '@/types/tool';
import { getToolDraft, removeToolDraft } from '@/lib/drafts';
import { useAppStore } from '@/store/appStore';

export interface ToolContextValue {
  tool: ToolMeta;
  draftEnabled: boolean;
  initialInput: string;
  draftUpdatedAt: number | null;
  draftDiscardToken: number;
  discardDraft: () => void;
}

const ToolContext = createContext<ToolContextValue | null>(null);

export function ToolProvider({ tool, children }: { tool: ToolMeta; children: ReactNode }) {
  const draftsEnabled = useAppStore((state) => state.draftEnabled);
  const canDraft = draftsEnabled && !tool.sensitive && !tool.customDraft;
  const [initialDraft, setInitialDraft] = useState(() => (canDraft ? getToolDraft(tool.id) : null));
  const [draftDiscardToken, setDraftDiscardToken] = useState(0);

  const discardDraft = useCallback(() => {
    removeToolDraft(tool.id);
    setInitialDraft(null);
    setDraftDiscardToken((token) => token + 1);
  }, [tool.id]);

  const value = useMemo<ToolContextValue>(
    () => ({
      tool,
      draftEnabled: canDraft,
      initialInput: initialDraft?.input ?? '',
      draftUpdatedAt: initialDraft?.updatedAt ?? null,
      draftDiscardToken,
      discardDraft,
    }),
    [tool, canDraft, initialDraft, draftDiscardToken, discardDraft],
  );

  return <ToolContext.Provider value={value}>{children}</ToolContext.Provider>;
}

export function useToolContext(): ToolContextValue | null {
  return useContext(ToolContext);
}
