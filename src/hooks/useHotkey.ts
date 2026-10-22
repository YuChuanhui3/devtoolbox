import { useEffect, useRef } from 'react';

export interface HotkeyOptions {
  key: string;
  metaOrCtrl?: boolean;
  shift?: boolean;
  enabled?: boolean;
}

export function useHotkey(
  options: HotkeyOptions,
  handler: (event: KeyboardEvent) => void,
): void {
  const { key, metaOrCtrl = false, shift = false, enabled = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      if (metaOrCtrl && !(event.metaKey || event.ctrlKey)) return;
      if (!metaOrCtrl && (event.metaKey || event.ctrlKey)) return;
      if (shift && !event.shiftKey) return;
      handlerRef.current(event);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, metaOrCtrl, shift, enabled]);
}
