import { useCallback, useEffect, useRef } from 'react';
import { removeToolDraft, saveToolDraft } from '@/lib/drafts';
import { useToolContext } from '@/components/tool/ToolContext';

const DRAFT_SAVE_DELAY = 500;

/**
 * 草稿自动保存 + “放弃草稿”响应。
 *
 * 单输入工具走 useToolIO，双输入（JSON 对比）等场景需要自己决定写入内容，
 * 两者共用这套节流/删除/放弃规则，避免各自再抄一遍 setTimeout。
 *
 * @param serialize 返回要保存的内容；返回 null 表示内容已清空、应删除草稿。
 * @param deps 触发保存的值（与 useEffect 依赖同理，各调用点长度固定）。
 * @param onDiscard 用户放弃草稿时需要清空的本地状态。
 */
export function useDraftAutosave(
  serialize: () => string | null,
  deps: readonly unknown[],
  onDiscard: () => void,
): { markDirty: () => void } {
  const toolContext = useToolContext();
  const dirtyRef = useRef(false);
  const serializeRef = useRef(serialize);
  serializeRef.current = serialize;
  const onDiscardRef = useRef(onDiscard);
  onDiscardRef.current = onDiscard;

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  useEffect(() => {
    if (!toolContext?.draftEnabled || !dirtyRef.current) return;
    const toolId = toolContext.tool.id;
    const timer = window.setTimeout(() => {
      const snapshot = serializeRef.current();
      if (snapshot === null) {
        removeToolDraft(toolId);
      } else {
        saveToolDraft(toolId, snapshot);
      }
    }, DRAFT_SAVE_DELAY);

    return () => window.clearTimeout(timer);
  }, [toolContext, ...deps]);

  const discardToken = toolContext?.draftDiscardToken ?? 0;
  const previousDiscardToken = useRef(discardToken);

  useEffect(() => {
    if (discardToken === previousDiscardToken.current) return;
    previousDiscardToken.current = discardToken;
    dirtyRef.current = false;
    onDiscardRef.current();
  }, [discardToken]);

  return { markDirty };
}
