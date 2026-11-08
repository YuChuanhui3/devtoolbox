/**
 * 搜索面板只会写 `?mode=<subFeatures id>`，而工作台里几处寻址不是一级页签：
 * - GraphQL / 脚本 / 代码生成 / OAuth 是「请求」页签里的二级区域，折回 `?mode=request&sub=…`
 * - WebSocket / SSE / Socket.IO / MQTT 同属「实时」页签内的协议 tab，折回
 *   `?mode=realtime&proto=…`（与上游 Hoppscotch 的 /realtime/<proto> 同构）
 * 否则搜到却落错视图。
 */
const SUB_OF_MODE: Record<string, string> = {
  graphql: 'graphql',
  scripts: 'scripts',
  codegen: 'code',
  oauth: 'auth',
};

/** 四个实时协议与它们在「实时」页签内的 tab 顺序（与上游 realtime 导航一致）。 */
export const REALTIME_PROTOCOLS = ['websocket', 'sse', 'socketio', 'mqtt'] as const;
export type RealtimeProtocol = (typeof REALTIME_PROTOCOLS)[number];

export function isRealtimeProtocol(mode: string | null): mode is RealtimeProtocol {
  return mode !== null && (REALTIME_PROTOCOLS as readonly string[]).includes(mode);
}

/**
 * 折算结果：sub 是请求页签内的二级区域；realtime 协议名放 proto 字段，
 * 消费方据此写 `?mode=realtime&proto=<协议>` 而不是占用 sub 语义。
 */
export interface FoldedMode {
  mode: string;
  sub?: string;
  proto?: RealtimeProtocol;
}

export function foldSubMode(mode: string | null): FoldedMode | null {
  if (!mode) return null;
  if (isRealtimeProtocol(mode)) return { mode: 'realtime', proto: mode };
  const sub = SUB_OF_MODE[mode];
  return sub ? { mode: 'request', sub } : null;
}
