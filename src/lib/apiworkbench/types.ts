import type { FetchMode } from '../net';

export const WB_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;
export type WbMethod = (typeof WB_METHODS)[number];

export interface WbVar {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  /** UI 打码显示；导出 Worker 快照时可排除。 */
  secret?: boolean;
}

export interface WbHeaderRow {
  key: string;
  value: string;
  enabled: boolean;
}

export type WbBodyMode = 'none' | 'json' | 'text' | 'form';

export interface WbBody {
  mode: WbBodyMode;
  /** form 模式存 raw `a=1&b=2`。 */
  text: string;
}

export interface WbAuth {
  type: 'none' | 'basic' | 'bearer';
  username?: string;
  password?: string;
  token?: string;
}

export interface WbRequest {
  id: string;
  name: string;
  method: WbMethod;
  /** 可含 {{var}} 占位。 */
  url: string;
  headers: WbHeaderRow[];
  body: WbBody;
  auth: WbAuth;
}

export interface WbFolder {
  id: string;
  name: string;
  folders: WbFolder[];
  requests: WbRequest[];
}

export interface WbCollection {
  id: string;
  name: string;
  root: WbFolder;
  variables: WbVar[];
  /** OpenAPI servers 落位用。 */
  baseUrl?: string;
}

export interface WbEnvironment {
  id: string;
  name: string;
  variables: WbVar[];
}

export type WbMockMethod = WbMethod | '*';

export interface WbMockRoute {
  id: string;
  enabled: boolean;
  method: WbMockMethod;
  /** 不含 host，如 `/users/:id`，段可含 `:param` 或 `*` 通配。 */
  path: string;
  status: number;
  headers: [string, string][];
  /** 支持 {{$uuid}}/{{params.id}} 模板。 */
  body: string;
  delayMs: number;
  note?: string;
}

export type WbVia = FetchMode | 'mock';

export interface WbSocket {
  id: string;
  name: string;
  /** 可含 {{var}} 占位，ws:// 或 wss://。 */
  url: string;
  /** Sec-WebSocket-Protocol 候选，逗号分隔写法在存储时已归一为数组。 */
  protocols: string[];
  note?: string;
}

export interface WbHistoryEntry {
  id: string;
  at: number;
  request: WbRequest;
  status: number;
  ms: number;
  bytes: number;
  /** 响应体前 4KB。 */
  bodyExcerpt: string;
  via: WbVia;
}

export const WORKBENCH_VERSION = 1;

export interface WorkbenchDoc {
  version: number;
  collections: WbCollection[];
  environments: WbEnvironment[];
  activeEnvId: string | null;
  mockRoutes: WbMockRoute[];
  mockEnabled: boolean;
  sockets: WbSocket[];
  history: WbHistoryEntry[];
}
