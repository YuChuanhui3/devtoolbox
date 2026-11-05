import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * 读工具页签内的二级寻址 `?sub=`（与 `?mode=` 配对，例：`?mode=request&sub=graphql`）。
 *
 * 只提供读取，不提供写回：面板里点个页签就改地址栏，会把后退键变成噪声。
 * 需要「旧链接直达子功能」时，由 LEGACY_TOOL_SUBS 那条路生成 sub。
 */
export function useToolkitSub<T extends string>(allowed: readonly T[]): T | null {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('sub');
  return useMemo(() => allowed.find((item) => item === requested) ?? null, [allowed, requested]);
}
