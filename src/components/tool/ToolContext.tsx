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
  const [initialDraft, setInitialDraft] = useState(() => {
    if (!canDraft) return null;
    const current = getToolDraft(tool.id);
    if (current || tool.id !== 'json-toolkit') return current;
    const legacy = getToolDraft('json-to-code');
    return legacy ? { ...legacy, input: JSON.stringify({ input: legacy.input, right: '' }) } : null;
  });
  const [draftDiscardToken, setDraftDiscardToken] = useState(0);

  const discardDraft = useCallback(() => {
    removeToolDraft(tool.id);
    if (tool.id === 'json-toolkit') removeToolDraft('json-to-code');
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
