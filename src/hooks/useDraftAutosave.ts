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
  const contextRef = useRef(toolContext);
  contextRef.current = toolContext;

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const writeNow = useCallback(() => {
    const context = contextRef.current;
    if (!context?.draftEnabled || !dirtyRef.current) return;
    const snapshot = serializeRef.current();
    if (snapshot === null) {
      removeToolDraft(context.tool.id);
    } else {
      saveToolDraft(context.tool.id, snapshot);
    }
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

  // 节流窗口内离开页面/切换工具会丢最后一次编辑：卸载和 pagehide 时立即补写。
  useEffect(() => {
    const onHide = () => writeNow();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      writeNow();
    };
  }, [writeNow]);

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
