import { useEffect, useRef } from 'react';

export interface WorkbenchShortcuts {
  onSend: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onFocusSearch: () => void;
  onOpenImport: () => void;
  onToggleHelp: () => void;
}

/** 输入控件里按 `?` 是在打问号，不是要打开快捷键说明。 */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/** 弹窗自带 Esc 关闭与焦点陷阱，快捷键此时不该穿透到背后的请求面板。 */
function dialogOpen(): boolean {
  return document.querySelector('[role="dialog"]') !== null;
}

/**
 * 页签内快捷键。`enabled` 必须是当前可见的那个页签：LazyPanel 挂载后不卸载，
 * 不分页签的 window 监听会让一次 Cmd+Enter 同时发出五个面板的请求。
 */
export function useWorkbenchShortcuts(enabled: boolean, shortcuts: WorkbenchShortcuts) {
  // 动作放进 ref，监听器就能只按 enabled 重挂；否则每敲一个字符都要解绑重绑。
  const latest = useRef(shortcuts);
  useEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const handlers = latest.current;
      if (dialogOpen()) return;
      if (!meta) {
        if (isTyping(event.target)) return;
        if (event.key === '?') {
          event.preventDefault();
          handlers.onToggleHelp();
        } else if (event.key === '/') {
          // ⌘K 归全局搜索面板，集合搜索用 / 聚焦：同一个按键不该抢两次。
          event.preventDefault();
          handlers.onFocusSearch();
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (event.key === 'Enter') {
        event.preventDefault();
        handlers.onSend();
      } else if (key === 's' && event.shiftKey) {
        event.preventDefault();
        handlers.onSaveAs();
      } else if (key === 's') {
        event.preventDefault();
        handlers.onSave();
      } else if (key === 'o') {
        event.preventDefault();
        handlers.onOpenImport();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
