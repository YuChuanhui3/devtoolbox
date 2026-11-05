/**
 * 搜索面板只会写 `?mode=<subFeatures id>`，而工作台的 GraphQL / 脚本 / 代码生成不是页签，
 * 是「请求」页签里的二级区域。这里把它们折回 `?mode=request&sub=…`，否则搜到却落错视图。
 */
const SUB_OF_MODE: Record<string, string> = {
  graphql: 'graphql',
  scripts: 'scripts',
  codegen: 'code',
  oauth: 'auth',
};

export function foldSubMode(mode: string | null): { mode: string; sub: string } | null {
  if (!mode) return null;
  const sub = SUB_OF_MODE[mode];
  return sub ? { mode: 'request', sub } : null;
}
