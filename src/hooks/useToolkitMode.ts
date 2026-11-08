import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * 工具箱页签与 URL `?mode=` 双步同步：刷新与浏览器后退/前进都能恢复页签。
 * 非法或缺失的 mode 一律回退到默认页签，等于默认值时从 URL 中删除参数保持链接干净。
 * 注意：非法 mode 的 URL 清理由调用方在 effect 里完成（本 hook 只读不写）。
 */
export function useToolkitMode<T extends string>(
  allowed: readonly T[],
  fallback: T,
): [T, (mode: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('mode');
  const mode = (allowed.find((item) => item === requested) ?? fallback) as T;

  const setMode = useCallback(
    (next: T) => {
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        if (next === fallback) params.delete('mode');
        else params.set('mode', next);
        return params;
      });
    },
    [fallback, setSearchParams],
  );

  return [mode, setMode];
}
