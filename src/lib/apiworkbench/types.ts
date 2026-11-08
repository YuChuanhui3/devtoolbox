import type { FetchMode } from '../net';

export const WB_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;
export type WbMethod = (typeof WB_METHODS)[number];

/** 自定义动词的合法性边界：大写字母开头，A–Z 0–9 -，总长 ≤16。 */
export const CUSTOM_METHOD_PATTERN = /^[A-Z][A-Z0-9-]{0,15}$/;

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

/** Query 参数表格的一行；与 url 里的 query 双向绑定，值可含 {{var}}。 */
export interface WbParam {
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export type WbBodyMode = 'none' | 'json' | 'text' | 'form' | 'multipart' | 'graphql';

export interface WbPart {
  key: string;
  /** file 的字节只在内存里（files.ts），存储只留元数据与一个引用号。 */
  type: 'text' | 'file';
  value: string;
  fileName?: string;
  fileSize?: number;
  mime?: string;
  fileRef?: string;
}

export interface WbGraphql {
  query: string;
  variables: string;
  operationName?: string;
}

export interface WbBody {
  mode: WbBodyMode;
  /** form 模式存 raw `a=1&b=2`；json/text 模式存正文。 */
  text: string;
  multipart?: WbPart[];
  graphql?: WbGraphql;
}

export type WbAuthType = 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2';

export interface WbAuth {
  type: WbAuthType;
  username?: string;
  password?: string;
  token?: string;
  /** api-key：注入位置与键名。 */
  in?: 'header' | 'query';
  key?: string;
  value?: string;
  /** api-key 写 header 时的前缀，如 `Bearer`。 */
  headerPrefix?: string;
  /** oauth2 */
  grantType?: 'client_credentials' | 'password' | 'authorization_code';
  authUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  redirectUri?: string;
  accessToken?: string;
  tokenType?: string;
  /** 毫秒时间戳；过期后 UI 提示重新获取，不自动刷新。 */
  expiresAt?: number;
}

export interface WbRequest {
  id: string;
  name: string;
  method: WbMethod;
  /** method 白名单外的自定义动词（如 PROPFIND）；仍然只有一个生效。 */
  customMethod?: string;
  /** 可含 {{var}} 占位。 */
  url: string;
  headers: WbHeaderRow[];
  /** 空数组时不落盘，保持 v1 存档逐字节不变。 */
  params?: WbParam[];
  body: WbBody;
  auth: WbAuth;
  preScript?: string;
  testScript?: string;
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
  /** 继承另一个环境：被继承者在前、自己在后，同名变量自己覆盖。 */
  inheritId?: string;
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

/** 实时连接的协议种类；缺省（旧数据）按 websocket 处理。 */
export type WbSocketKind = 'websocket' | 'sse' | 'socketio' | 'mqtt';

/** MQTT QoS 等级与订阅表行（mqtt.ts 的内核类型在存储侧复用这里）。 */
export type MqttQos = 0 | 1 | 2;

export interface MqttSubscription {
  topic: string;
  qos: MqttQos;
}

export interface WbSocket {
  id: string;
  name: string;
  /** 可含 {{var}} 占位，ws:// 或 wss://（sse 为 http(s)，socketio 为 http(s)，mqtt 为 ws/wss 或可纠正的 mqtt(s)）。 */
  url: string;
  /** WebSocket 的 Sec-WebSocket-Protocol 候选，逗号分隔写法在存储时已归一为数组。 */
  protocols: string[];
  note?: string;
  /** 协议种类；旧数据没有该字段，读取时归一为 websocket。 */
  kind?: WbSocketKind;
  /** SSE：随连接发送的请求头（值支持 {{var}}）。 */
  sseHeaders?: Array<{ key: string; value: string; enabled?: boolean }>;
  /** SSE：断线后是否自动重连。 */
  sseReconnect?: boolean;
  /** Socket.IO：命名空间（空 = 根）。 */
  socketIoNamespace?: string;
  /** Socket.IO：随连接发送的查询串。 */
  socketIoQuery?: string;
  /** Socket.IO：连接 auth 载荷（JSON 文本，值支持 {{var}}）。 */
  socketIoAuth?: string;
  /** MQTT：用户名/密码（留空不认证）。 */
  mqttUsername?: string;
  mqttPassword?: string;
  /** MQTT：Client ID（空 = 连接时随机生成）。 */
  mqttClientId?: string;
  /** MQTT：心跳秒数。 */
  mqttKeepAlive?: number;
  /** MQTT：清洁会话。 */
  mqttCleanSession?: boolean;
  /** MQTT：Last Will，两者都非空才设置。 */
  mqttWillTopic?: string;
  mqttWillMessage?: string;
  mqttWillQos?: number;
  mqttWillRetain?: boolean;
  /** MQTT：订阅表（主题过滤器 + QoS）。 */
  mqttSubscriptions?: MqttSubscription[];
}

export interface WbHistoryEntry {
  id: string;
  at: number;
  /** 历史里的请求是可重放的裁剪副本：去掉脚本与文件字节，正文截到 MAX_HISTORY_BODY。 */
  request: WbRequest;
  /** 裁剪真实发生过，UI 标注「已裁剪」。 */
  requestTrimmed?: boolean;
  status: number;
  ms: number;
  bytes: number;
  /** 响应体前 4KB。 */
  bodyExcerpt: string;
  via: WbVia;
}

/** v1 → v2：新字段全部可选，旧存档原样补默认值；版本号由 sanitizeWorkbench 强制写回。 */
export const WORKBENCH_VERSION = 2;

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
