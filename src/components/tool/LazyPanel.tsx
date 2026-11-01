import { useEffect, useState, type ReactNode } from 'react';

/**
 * 首次激活才挂载，之后保持挂载（隐藏但保留输入与结果状态）。
 * 工具箱面板里重组件（编辑器、二维码、图片预览）不再在首屏全量初始化。
 */
export function LazyPanel({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);

  useEffect(() => {
    if (active) setVisited(true);
  }, [active]);

  if (!visited) return null;

  return <div className={active ? 'contents' : 'hidden'}>{children}</div>;
}
