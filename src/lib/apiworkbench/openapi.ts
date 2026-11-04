import { load as yamlLoad } from 'js-yaml';
import { ToolError } from '../errors';
import { newId } from './id';
import type {
  WbCollection,
  WbEnvironment,
  WbMethod,
  WbMockRoute,
  WbRequest,
} from './types';

const MAX_ENDPOINTS = 500;
const MAX_SCHEMA_DEPTH = 6;
const MAX_SCHEMA_NODES = 5000;

export interface ParsedParam {
  name: string;
  in: 'path' | 'query' | 'header' | 'body';
  required: boolean;
  schema: unknown;
}

export interface ParsedEndpoint {
  method: WbMethod;
  path: string;
  summary: string;
  tags: string[];
  params: ParsedParam[];
  requestExample: string | null;
  responseExample: string | null;
  responseStatus: number;
}

export interface ParsedSpec {
  title: string;
  baseUrl: string;
  endpoints: ParsedEndpoint[];
}

interface Recursion {
  depth: number;
  nodes: number;
}

const HTTP_METHOD_KEYS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 内部 $ref（#/...）解引用；外部引用与解析失败返回 null。 */
function followRef(ref: string, root: Record<string, unknown>): unknown {
  if (!ref.startsWith('#/')) return null;
  let node: unknown = root;
  for (const rawSegment of ref.slice(2).split('/')) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    node = asRecord(node)?.[segment] ?? (Array.isArray(node) ? node[Number(segment)] : undefined);
    if (node === undefined) return null;
  }
  return node;
}

/** 展开 $ref；带栈环检测，环上的重复引用替换为循环占位。 */
function deref(node: unknown, root: Record<string, unknown>, stack: string[]): unknown {
  const record = asRecord(node);
  const ref = record?.['$ref'];
  if (typeof ref === 'string') {
    if (stack.includes(ref)) return { type: 'object', 'x-circular': true };
    const target = followRef(ref, root);
    if (target === null) return { type: 'object', 'x-unresolved': ref };
    return deref(target, root, [...stack, ref]);
  }
  return node;
}

const FORMAT_STUBS: Record<string, string> = {
  uuid: '3fa85f64-5717-421b-b3-2f9c62f77449',
  'date-time': '2026-01-01T00:00:00Z',
  date: '2026-01-01',
  time: '12:00:00',
  email: 'user@example.com',
  uri: 'https://example.com',
  'uri-reference': '/example',
  hostname: 'example.com',
  ipv4: '192.0.2.1',
  ipv6: '2001:db8::1',
  binary: '<binary>',
  byte: 'YWJjZA==',
  password: 'secret',
};

function schemaExampleRaw(
  schema: unknown,
  root: Record<string, unknown>,
  budget: Recursion,
  stack: string[],
): unknown {
  budget.nodes += 1;
  if (budget.depth > MAX_SCHEMA_DEPTH || budget.nodes > MAX_SCHEMA_NODES) return '<max-depth>';
  // 逐层展开 $ref 并把引用路径记入 stack，让 Pet→Human→Pet 这类环触发 <recursive>。
  let node = schema;
  let refStack = stack;
  for (;;) {
    const ref = asRecord(node)?.['$ref'];
    if (typeof ref !== 'string') break;
    if (refStack.includes(ref)) return '<recursive>';
    const target = followRef(ref, root);
    if (target === undefined || target === null) return `<unresolved:${ref}>`;
    refStack = [...refStack, ref];
    node = target;
  }
  const record = asRecord(node);
  if (!record) return node;
  if (record['x-circular']) return '<recursive>';
  if (record['x-unresolved']) return `<unresolved:${record['x-unresolved']}>`;
  if ('example' in record) return record.example;
  if ('default' in record) return record.default;
  if (Array.isArray(record.enum) && record.enum.length > 0) return record.enum[0];
  if (Array.isArray(record.allOf) && record.allOf.length > 0) {
    const merged: Record<string, unknown> = { type: 'object', properties: {} };
    const props = merged.properties as Record<string, unknown>;
    for (const part of record.allOf) {
      const resolved = asRecord(deref(part, root, refStack));
      if (!resolved) continue;
      Object.assign(props, asRecord(resolved.properties) ?? {});
      merged.required = [...((merged.required as unknown[]) ?? []), ...((resolved.required as unknown[]) ?? [])];
    }
    return schemaExampleRaw(merged, root, budget, refStack);
  }
  if (Array.isArray(record.oneOf) && record.oneOf.length > 0) {
    return schemaExampleRaw(record.oneOf[0], root, budget, refStack);
  }
  if (Array.isArray(record.anyOf) && record.anyOf.length > 0) {
    return schemaExampleRaw(record.anyOf[0], root, budget, refStack);
  }
  const type = typeof record.type === 'string' ? record.type : record.properties ? 'object' : undefined;
  if (type === 'object' || record.properties) {
    const properties = asRecord(record.properties) ?? {};
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(properties)) {
      out[key] = schemaExampleRaw(child, root, { ...budget, depth: budget.depth + 1 }, refStack);
    }
    return out;
  }
  if (type === 'array') {
    const item = schemaExampleRaw(record.items, root, { ...budget, depth: budget.depth + 1 }, refStack);
    return [item];
  }
  if (type === 'string') {
    const format = typeof record.format === 'string' ? record.format : '';
    return FORMAT_STUBS[format] ?? 'string';
  }
  if (type === 'integer') return 1;
  if (type === 'number') return 1.5;
  if (type === 'boolean') return true;
  if (type === 'null') return null;
  return null;
}

/** schema → 示例值（尊重 example > default > enum > format 桩 > 类型零值）。 */
export function schemaToExample(
  schema: unknown,
  root: Record<string, unknown>,
  rand: () => number = Math.random,
): unknown {
  void rand;
  return schemaExampleRaw(schema, root, { depth: 0, nodes: 0 }, []);
}

function stringifyExample(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
}

/** Swagger 2.0 最小提升到 3.0 形态（servers/components/请求体参数）。 */
function upgradeV2(spec: Record<string, unknown>): Record<string, unknown> {
  const host = typeof spec.host === 'string' && spec.host ? spec.host : 'example.com';
  const scheme = Array.isArray(spec.schemes) && typeof spec.schemes[0] === 'string' ? spec.schemes[0] : 'https';
  const basePath = typeof spec.basePath === 'string' ? spec.basePath.replace(/\/$/, '') : '';
  const definitions = asRecord(spec.definitions);
  const rewritten = JSON.parse(
    JSON.stringify(spec).replace(/"#\/definitions\//g, '"#/components/schemas/'),
  ) as Record<string, unknown>;
  return {
    openapi: '3.0.0-upgraded',
    info: spec.info ?? {},
    servers: [{ url: `${scheme}://${host}${basePath}` }],
    paths: rewritten.paths ?? {},
    components: { schemas: definitions ?? {} },
  };
}

function pickContent(obj: unknown): Record<string, unknown> | null {
  const record = asRecord(obj);
  if (!record) return null;
  const json = asRecord(record['application/json']) ?? asRecord(record['application/x-www-form-urlencoded']);
  return json ?? (asRecord(Object.values(record).find((v) => asRecord(v))) ?? null);
}

function endpointFrom(
  root: Record<string, unknown>,
  method: WbMethod,
  path: string,
  op: Record<string, unknown>,
  pathParams: unknown[],
): ParsedEndpoint {
  const rawParams = [...pathParams, ...(Array.isArray(op.parameters) ? op.parameters : [])];
  const params: ParsedParam[] = [];
  let bodySource: unknown = null;
  for (const raw of rawParams) {
    const p = asRecord(deref(raw, root, []));
    if (!p || typeof p.name !== 'string') continue;
    const location = typeof p.in === 'string' ? p.in : 'query';
    if (location === 'body') {
      bodySource = p.schema ?? p;
      params.push({ name: p.name, in: 'body', required: !!p.required, schema: p.schema });
      continue;
    }
    params.push({ name: p.name, in: location as ParsedParam['in'], required: !!p.required, schema: p.schema });
  }
  const requestBody = asRecord(op.requestBody);
  if (requestBody) {
    const content = pickContent(requestBody.content);
    bodySource = content?.example ?? content?.schema ?? bodySource;
  }
  const requestExample = bodySource
    ? stringifyExample(typeof bodySource === 'object' && bodySource !== null && 'example' in (bodySource as object)
        ? (bodySource as Record<string, unknown>).example
        : schemaToExample(bodySource, root))
    : null;

  const responses = asRecord(op.responses);
  const codes = Object.keys(responses ?? {});
  const code = codes.find((c) => c === '200')
    ?? codes.find((c) => c === '201')
    ?? codes.find((c) => /^2\d\d$/.test(c))
    ?? codes.find((c) => c !== 'default')
    ?? 'default';
  const response = asRecord(responses?.[code]);
  const responseContent = pickContent(response?.content);
  const responseExample = response
    ? stringifyExample(
        responseContent?.example
          ?? schemaToExample(responseContent?.schema ?? responseContent, root),
      )
    : null;

  return {
    method,
    path,
    summary: typeof op.summary === 'string' && op.summary
      ? op.summary
      : typeof op.operationId === 'string' && op.operationId
        ? op.operationId
        : `${method} ${path}`,
    tags: Array.isArray(op.tags) ? op.tags.filter((x): x is string => typeof x === 'string') : [],
    params,
    requestExample,
    responseExample,
    responseStatus: Number(code) || 200,
  };
}

export function parseOpenApi(text: string): ParsedSpec {
  const trimmed = text.trim();
  if (!trimmed) throw new ToolError({ zh: '文档内容为空', en: 'The document is empty' });
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    try {
      raw = yamlLoad(trimmed);
    } catch {
      throw new ToolError(
        { zh: '不是合法的 JSON / YAML', en: 'Not valid JSON or YAML' },
        { zh: '请粘贴完整 OpenAPI 文档原文', en: 'Paste the full OpenAPI document text' },
      );
    }
  }
  const spec = asRecord(raw);
  if (!spec) throw new ToolError({ zh: '文档根节点应为对象', en: 'The document root should be an object' });
  let working = spec;
  if (typeof spec.openapi !== 'string') {
    if (spec.swagger === '2.0') working = upgradeV2(spec);
    else
      throw new ToolError(
        { zh: '未找到 openapi / swagger 版本字段', en: 'No openapi / swagger version field found' },
        { zh: '支持 OpenAPI 3.0（推荐）与 Swagger 2.0 最小提升', en: 'OpenAPI 3.0 is fully supported; Swagger 2.0 gets a minimal upgrade' },
      );
  }
  const info = asRecord(working.info);
  const title = typeof info?.title === 'string' && info.title ? info.title : 'Imported API';
  const servers = working.servers;
  const firstServer = Array.isArray(servers) ? asRecord(servers[0]) : null;
  const baseUrl =
    typeof firstServer?.url === 'string' ? firstServer.url.replace(/\/$/, '') : '{{baseUrl}}';

  const paths = asRecord(working.paths);
  if (!paths)
    throw new ToolError({ zh: '缺少 paths 字段', en: 'Missing paths field' });
  const endpoints: ParsedEndpoint[] = [];
  for (const [path, itemRaw] of Object.entries(paths)) {
    const item = asRecord(itemRaw);
    if (!item) continue;
    const sharedParams = Array.isArray(item.parameters) ? item.parameters : [];
    for (const key of HTTP_METHOD_KEYS) {
      const op = asRecord(item[key]);
      if (!op) continue;
      endpoints.push(endpointFrom(working, key.toUpperCase() as WbMethod, path, op, sharedParams));
      if (endpoints.length >= MAX_ENDPOINTS) break;
    }
    if (endpoints.length >= MAX_ENDPOINTS) break;
  }
  if (endpoints.length === 0)
    throw new ToolError(
      { zh: '文档中没有可导入的端点', en: 'The document has no importable endpoints' },
    );
  return { title, baseUrl, endpoints };
}

const PARAM_STUBS: Record<string, string> = {
  integer: '1',
  number: '1',
  boolean: 'true',
};

function paramValue(param: ParsedParam): string {
  const schema = asRecord(param.schema);
  if (schema) {
    if (typeof schema.example === 'string' || typeof schema.example === 'number') return String(schema.example);
    if (Array.isArray(schema.enum) && schema.enum.length > 0) return String(schema.enum[0]);
    const format = typeof schema.format === 'string' ? schema.format : '';
    if (FORMAT_STUBS[format]) return FORMAT_STUBS[format];
    if (typeof schema.type === 'string' && PARAM_STUBS[schema.type]) return PARAM_STUBS[schema.type];
  }
  return '1';
}

export interface ImportResult {
  collection: WbCollection;
  environment: WbEnvironment | null;
  mockRoutes: WbMockRoute[];
}

/** 端点 → 集合（含 baseUrl 环境）+ 可选 mock 路由。 */
export function endpointsToImport(
  spec: ParsedSpec,
  opts: { withMockRoutes: boolean },
): ImportResult {
  const needsEnv = spec.baseUrl.startsWith('{{') === false;
  const environment: WbEnvironment | null = needsEnv
    ? { id: newId(), name: spec.title, variables: [{ id: newId(), key: 'baseUrl', value: spec.baseUrl, enabled: true }] }
    : null;

  const folders = new Map<string, { id: string; name: string; folders: []; requests: WbRequest[] }>();
  const root: WbCollection['root'] = {
    id: newId(),
    name: spec.title,
    folders: [],
    requests: [],
  };
  const mockRoutes: WbMockRoute[] = [];

  for (const endpoint of spec.endpoints) {
    const tag = endpoint.tags[0] || endpoint.path.split('/').filter(Boolean)[0] || 'root';
    if (!folders.has(tag)) folders.set(tag, { id: newId(), name: tag, folders: [], requests: [] });
    const folder = folders.get(tag)!;

    let urlPath = endpoint.path;
    for (const param of endpoint.params) {
      if (param.in === 'path') urlPath = urlPath.replace(`{${param.name}}`, paramValue(param));
    }
    const query = endpoint.params.filter((p) => p.in === 'query');
    if (query.length > 0) {
      urlPath += `?${query.map((p) => `${p.name}=${paramValue(p)}`).join('&')}`;
    }
    const request: WbRequest = {
      id: newId(),
      name: endpoint.summary.slice(0, 80),
      method: endpoint.method,
      url: `{{baseUrl}}${urlPath}`,
      headers: endpoint.requestExample
        ? [{ key: 'Content-Type', value: 'application/json', enabled: true }]
        : [],
      body: endpoint.requestExample
        ? { mode: 'json', text: endpoint.requestExample }
        : { mode: 'none', text: '' },
      auth: { type: 'none' },
    };
    folder.requests.push(request);

    if (opts.withMockRoutes && endpoint.responseExample) {
      mockRoutes.push({
        id: newId(),
        enabled: true,
        method: endpoint.method,
        path: endpoint.path.replace(/\{[^}]+\}/g, ':param'),
        status: endpoint.responseStatus,
        headers: [['content-type', 'application/json']],
        body: endpoint.responseExample,
        delayMs: 0,
        note: `${spec.title} · ${endpoint.summary}`.slice(0, 120),
      });
    }
  }

  root.folders = [...folders.values()];
  const collection: WbCollection = {
    id: newId(),
    name: spec.title,
    root,
    variables: [],
    baseUrl: needsEnv ? undefined : spec.baseUrl,
  };
  return { collection, environment, mockRoutes };
}
