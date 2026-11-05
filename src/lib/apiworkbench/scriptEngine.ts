import type { FetchMode } from '@/lib/net';
import { builtinValue, interpolate } from './vars';
import { WB_METHODS, type WbBodyMode, type WbHeaderRow, type WbParam, type WbVar } from './types';

/**
 * 脚本引擎：把用户写的 pre-request / tests 脚本跑在一个只暴露 `pm` 的函数作用域里。
 *
 * 这里刻意不做任何安全边界：`new Function` 与 Proxy 挡不住铁了心要逃逸的代码，
 * 它挡的是误用（拿不到的能力会明确报错）与失控（deadline 到点后每个 pm.* 都拒绝继续）。
 * 真正的抢占手段是宿主 `worker.terminate()`，见 sandbox.ts 的注释。
 */

/** 与 store.ts 的 MAX_SCRIPT_CHARS 同值；那条约束管落盘，这条管执行。 */
export const MAX_SCRIPT_CHARS = 65_536;
export const MAX_SCRIPT_TESTS = 200;
export const MAX_SCRIPT_LOGS = 200;
export const MAX_SCRIPT_LOG_CHARS = 2_000;
export const DEFAULT_SCRIPT_DEADLINE_MS = 5_000;
export const MIN_SCRIPT_DEADLINE_MS = 1_000;
export const MAX_SCRIPT_DEADLINE_MS = 30_000;
/** 传给脚本的响应体上限：worker 之间 postMessage 有大小限制，超限的正文只给前这么多字符。 */
export const MAX_SCRIPT_BODY_CHARS = 512_000;
export const MAX_SCRIPT_KEY_CHARS = 200;
/** 一次运行最多允许几个 `pm.sendRequest`：脚本链式调用不该把页面变成爬虫。 */
export const MAX_SCRIPT_SENDS = 5;
/** 子请求的 URL 与正文上限，超了就是脚本写错了，不是「装不下」。 */
export const MAX_SCRIPT_SEND_URL_CHARS = 2_000;
export const MAX_SCRIPT_SEND_BODY_CHARS = 65_536;
/** 排空回调里再发出去的子请求时，最多轮几轮，防止回调互相触发。 */
const MAX_SEND_ROUNDS = MAX_SCRIPT_SENDS + 2;
/** 单个子请求最多等多久：再长就连着几个一起把看门狗等超时了，宁可报超时也不拖死整次运行。 */
export const MAX_SCRIPT_SEND_TIMEOUT_MS = 8_000;

export type ScriptPhase = 'prerequest' | 'test';

export interface ScriptRequestInput {
  method: string;
  /** 原始模板，`{{var}}` 保持未展开：脚本改完之后才轮到插值。 */
  url: string;
  headers: WbHeaderRow[];
  params: WbParam[];
  bodyMode: WbBodyMode;
  /** json/text/form 的正文，或 graphql 的 query。 */
  bodyText: string;
}

export interface ScriptResponseInput {
  code: number;
  statusText: string;
  responseTime: number;
  headers: Array<[string, string]>;
  body: string;
  /** 正文太长被截过，脚本看到的不是完整响应。 */
  bodyTruncated?: boolean;
}

export interface ScriptPayload {
  phase: ScriptPhase;
  script: string;
  requestName?: string;
  request: ScriptRequestInput;
  response?: ScriptResponseInput | null;
  /** 集合 + 环境合并后的作用域，脚本只读。 */
  vars: Record<string, string>;
  /** 当前环境的变量初值，`pm.environment.*` 从这里起算。 */
  env: Record<string, string>;
  deadlineMs?: number;
  /** `pm.sendRequest` 的取数通道：由界面当时选的模式决定，代理模式下子请求也走代理。 */
  sendChannel?: { mode: FetchMode; timeoutMs?: number };
}

export interface ScriptTest {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  error?: string;
}

/** 脚本里 `pm.sendRequest` 的请求描述；变量插值由引擎做完，发不发由宿主决定。 */
export interface SendRequestSpec {
  url: string;
  method: string;
  headers: Array<[string, string]>;
  body?: string;
}

/** 宿主发出去的子请求返回给脚本的那一份响应。 */
export interface SendResponseInput {
  code: number;
  statusText?: string;
  headers?: Array<[string, string]>;
  body: string;
  responseTime?: number;
}

/** 子请求的落定结果：失败是一种正常返回值，不是异常，脚本要能在回调里区分。 */
export type SendOutcome = { ok: true; response: SendResponseInput } | { ok: false; error: string };

/**
 * 由宿主注入的发送器。`budgetMs` 是这次运行还剩的时间上限，
 * 宿主据此设 fetch 超时，免得一个卡住的子请求把看门狗等过去。
 */
export type SendRequester = (spec: SendRequestSpec, budgetMs: number) => Promise<SendOutcome>;

export interface EnvWrite {
  op: 'set' | 'unset';
  key: string;
  value?: string;
}

export interface RequestPatch {
  method?: string;
  url?: string;
  headers?: WbHeaderRow[];
  params?: WbParam[];
  bodyText?: string;
}

export interface ScriptResult {
  ran: boolean;
  tests: ScriptTest[];
  logs: string[];
  envWrites: EnvWrite[];
  /** `pm.variables.set`：只影响这一次发送的插值，不落盘。 */
  varWrites: Record<string, string>;
  patch: RequestPatch;
  error?: string;
  /** 脚本里抛错的行号（尽力解析 stack，拿不到就不给）。 */
  errorLine?: number;
  /** 跑到一半撞上 deadline：已收集的断言照样带回去。 */
  aborted?: boolean;
  testsCapped?: boolean;
  logsCapped?: boolean;
  /** `pm.test.skip` 的条数：既不算通过也不算失败。 */
  skips: number;
  /** `pm.sendRequest` 真正发出去的个数（被上限挡掉的不算）。 */
  sends: number;
  sendsCapped?: boolean;
  /** 每条子请求的去向：界面用它说清「发了几个、各自什么结果」。 */
  sendResults?: Array<{ ok: boolean; method: string; url: string; code?: number; error?: string }>;
  durationMs: number;
}

class AssertionError extends Error {}
/** API 用法错误：整个脚本中止，宿主把它当失败处理（预请求阶段会拦住发送）。 */
class UsageError extends Error {}
/** 超时：与用户脚本自己的报错区分开，宿主据此标注 aborted。 */
class RunawayError extends Error {}

export function clampDeadline(ms: unknown): number {
  const value = typeof ms === 'number' && Number.isFinite(ms) ? ms : DEFAULT_SCRIPT_DEADLINE_MS;
  return Math.min(MAX_SCRIPT_DEADLINE_MS, Math.max(MIN_SCRIPT_DEADLINE_MS, Math.round(value)));
}

/** 只喂脚本的那段正文：太长就截，并说明截了多少，别假装脚本看到了全部。 */
export function shrinkResponseBody(response: ScriptResponseInput): ScriptResponseInput {
  if (response.body.length <= MAX_SCRIPT_BODY_CHARS) return response;
  return {
    ...response,
    body: response.body.slice(0, MAX_SCRIPT_BODY_CHARS),
    bodyTruncated: true,
  };
}

function fmt(value: unknown): string {
  if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 160)}…` : value;
  if (typeof value === 'function') return '[function]';
  if (typeof value === 'bigint') return `${value}n`;
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return json.length > 160 ? `${json.slice(0, 160)}…` : json;
  } catch {
    /* 循环引用之类的走 String() */
  }
  return String(value);
}

function equalValues(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  return false;
}

/** 够用即可的深度比较：对象/数组递归，其余按 === 与 NaN。 */
function deepEqual(a: unknown, b: unknown, seen: number = 0): boolean {
  if (a === b) return true;
  if (seen > 64) return false;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return equalValues(a, b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key], seen + 1));
}

/** `a.b.0.c` 形式的路径；数字段既能取数组下标也能取数字键。 */
function readPath(source: unknown, path: string): { found: boolean; value: unknown } {
  let current = source;
  for (const rawSegment of path.split('.')) {
    const segment = rawSegment.trim();
    if (!segment) continue;
    if (current === null || current === undefined) return { found: false, value: undefined };
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { found: false, value: undefined };
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') return { found: false, value: undefined };
    const record = current as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, segment)) return { found: false, value: undefined };
    current = record[segment];
  }
  return { found: true, value: current };
}

const CHAIN_WORDS = new Set([
  'to', 'be', 'been', 'being', 'is', 'that', 'which', 'and', 'or', 'has', 'have', 'with', 'at', 'of', 'by', 'from', 'in', 'it', 'itself',
]);

const CHAIN_FLAGS: Record<string, { deep?: boolean; negated?: boolean }> = {
  not: { negated: true },
  deep: { deep: true },
};

interface ExpectContext {
  response: ScriptResponseInput | null;
  /** 只有 `pm.response.to.*` 这条链为真：此时 `.ok` 断言的是状态码，不是对象真值。 */
  onResponse?: boolean;
}

/** Postman 文档里 `pm.response.to.be.*` 的几种说法，全部按状态码判定。 */
const RESPONSE_QUALITY: Record<string, (code: number) => boolean> = {
  ok: (code) => code >= 200 && code < 300,
  success: (code) => code >= 200 && code < 300,
  info: (code) => code >= 100 && code < 200,
  redirect: (code) => code >= 300 && code < 400,
  redirection: (code) => code >= 300 && code < 400,
  clientError: (code) => code >= 400 && code < 500,
  serverError: (code) => code >= 500 && code < 600,
  error: (code) => code >= 400 && code < 600,
  noContent: (code) => code === 204 || code === 304,
  notFound: (code) => code === 404,
};

type GetterAssert = (actual: unknown) => boolean;
type MethodAssert = (actual: unknown, args: unknown[], ctx: ExpectContext) => boolean;

const GETTER_ASSERTS: Record<string, GetterAssert> = {
  ok: (a) => Boolean(a),
  true: (a) => a === true,
  false: (a) => a === false,
  null: (a) => a === null,
  undefined: (a) => a === undefined,
  exist: (a) => a !== undefined && a !== null,
  empty: (a) => {
    if (typeof a === 'string' || Array.isArray(a)) return a.length === 0;
    if (a instanceof Set || a instanceof Map) return a.size === 0;
    if (a && typeof a === 'object') return Object.keys(a).length === 0;
    return false;
  },
};

const METHOD_ASSERTS: Record<string, MethodAssert> = {
  equal: (a, [b]) => a === b,
  equals: (a, [b]) => a === b,
  eql: (a, [b]) => deepEqual(a, b),
  include: (a, [b]) => containsValue(a, b),
  includes: (a, [b]) => containsValue(a, b),
  contain: (a, [b]) => containsValue(a, b),
  contains: (a, [b]) => containsValue(a, b),
  oneOf: (a, [b]) => Array.isArray(b) && b.some((item) => deepEqual(item, a)),
  match: (a, [b]) => {
    const pattern = b instanceof RegExp ? b : new RegExp(String(b));
    return pattern.test(String(a));
  },
  above: (a, [b]) => Number(a) > Number(b),
  greaterThan: (a, [b]) => Number(a) > Number(b),
  below: (a, [b]) => Number(a) < Number(b),
  lessThan: (a, [b]) => Number(a) < Number(b),
  least: (a, [b]) => Number(a) >= Number(b),
  most: (a, [b]) => Number(a) <= Number(b),
  within: (a, [lo, hi]) => Number(a) >= Number(lo) && Number(a) <= Number(hi),
  lengthOf: (a, [b]) => lengthOf(a) === Number(b),
  length: (a, [b]) => lengthOf(a) === Number(b),
  property: (a, [b]) => {
    if (a === null || a === undefined) return false;
    return readPath(a, String(b)).found;
  },
  instanceOf: (a, [b]) => {
    if (typeof b !== 'function') throw new UsageError(`pm.expect(...).instanceOf 需要一个构造函数，收到 ${fmt(b)}`);
    return a instanceof (b as new () => unknown);
  },
  a: (a, [b]) => typeof a === String(b) || (String(b) === 'array' && Array.isArray(a)) || (String(b) === 'null' && a === null),
  an: (a, [b]) => typeof a === String(b) || (String(b) === 'array' && Array.isArray(a)) || (String(b) === 'null' && a === null),
  typeOf: (a, [b]) => typeof a === String(b),
};

function containsValue(actual: unknown, expected: unknown): boolean {
  if (typeof actual === 'string') return actual.includes(String(expected));
  if (Array.isArray(actual)) return actual.some((item) => deepEqual(item, expected));
  if (actual instanceof Set) return [...actual].some((item) => deepEqual(item, expected));
  if (actual && typeof actual === 'object') {
    const key = String(expected);
    return Object.prototype.hasOwnProperty.call(actual, key);
  }
  return false;
}

function lengthOf(value: unknown): number | null {
  if (typeof value === 'string' || Array.isArray(value)) return value.length;
  if (value instanceof Set || value instanceof Map) return value.size;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return null;
}

function describe(assertion: string, args: unknown[]): string {
  const [first, second] = args;
  if (assertion === 'property') return `to have property ${fmt(first)}`;
  if (assertion === 'within') return `to be within [${fmt(first)}, ${fmt(second)}]`;
  if (args.length === 0) return `to be ${assertion}`;
  return `to ${assertion} ${fmt(first)}`;
}

/**
 * 极小的 expect 链：只实现脚本里真会写的那几十种说法，不引 chai。
 * 用 Proxy 把 `to / be / deep / not` 这类连接词折叠成同一个断言上下文。
 */
function buildChain(actual: unknown, ctx: ExpectContext, flags: { deep?: boolean; negated?: boolean }): unknown {
  const target = (() => undefined) as unknown;
  return new Proxy(target as object, {
    get(_t, rawKey: string) {
      if (rawKey === 'then' || typeof rawKey === 'symbol') return undefined;
      const key = rawKey;
      if (CHAIN_WORDS.has(key)) return buildChain(actual, ctx, flags);
      const flag = CHAIN_FLAGS[key];
      if (flag) return buildChain(actual, ctx, { ...flags, ...flag });

      if (Object.prototype.hasOwnProperty.call(GETTER_ASSERTS, key)) {
        if (ctx.onResponse && ctx.response && Object.prototype.hasOwnProperty.call(RESPONSE_QUALITY, key)) {
          const code = ctx.response.code;
          report(RESPONSE_QUALITY[key](code), key, [], flags, code);
          return undefined;
        }
        const pass = GETTER_ASSERTS[key](actual);
        report(pass, key, [], flags, actual);
        return undefined;
      }

      if (ctx.onResponse && ctx.response && (key === 'header' || key === 'body')) {
        const response = ctx.response;
        return (first?: unknown, second?: unknown) => {
          if (key === 'header') {
            const name = normalizeKey(first, '响应头');
            const found = response.headers.find(([item]) => item.toLowerCase() === name.toLowerCase());
            if (!found) return report(false, 'have header', [name], flags, response.headers.map(([item]) => item).join(', '));
            if (second === undefined) return report(true, 'have header', [name], flags, found[1]);
            return report(found[1] === String(second), 'have header value', [`${name}=${String(second)}`], flags, found[1]);
          }
          // 与 newman 一致：给了字符串就是整块正文相等；想只看包含关系就写 pm.expect(pm.response.body).to.include(...)
          if (first === undefined) return report(response.body.length > 0, 'have body', [], flags, response.body);
          if (first instanceof RegExp) return report(first.test(response.body), 'have body', [String(first)], flags, response.body);
          const wanted = String(first);
          return report(response.body === wanted, 'have body', [wanted], flags, response.body);
        };
      }

      if (key === 'status') {
        return (code: unknown) => {
          if (!ctx.response) throw new UsageError('status 只能在测试阶段断言，预请求时还没有响应');
          return report(ctx.response.code === Number(code), 'status', [code], flags, ctx.response.code);
        };
      }
      if (key === 'jsonBody') {
        return (path?: unknown, expected?: unknown) => {
          if (!ctx.response) throw new UsageError('jsonBody 只能在测试阶段断言，预请求时没有响应体');
          let parsed: unknown;
          try {
            parsed = JSON.parse(ctx.response.body) as unknown;
          } catch {
            throw new AssertionError(`响应体不是合法 JSON，无法取 ${fmt(path ?? '根')}`);
          }
          const target2 = path === undefined ? parsed : readPath(parsed, String(path)).value;
          if (path !== undefined && readPath(parsed, String(path)).found === false) {
            return report(false, 'jsonBody', [path], flags, undefined);
          }
          if (expected === undefined) return report(target2 !== undefined, 'jsonBody', [path], flags, target2);
          return report(deepEqual(target2, expected) || target2 === expected, 'jsonBody', [expected], flags, target2);
        };
      }
      if (key === 'members' || key === 'keys' || key === 'throw' || key === 'throws') {
        throw new UsageError(`pm.expect 暂不支持 .${key}（这是刻意裁剪的子集，见脚本面板的说明）`);
      }
      if (Object.prototype.hasOwnProperty.call(METHOD_ASSERTS, key)) {
        return (...args: unknown[]) => {
          const deep = Boolean(flags.deep) || key === 'eql';
          const check = METHOD_ASSERTS[key];
          const [first] = args;
          let pass = false;
          if (key === 'equal' || key === 'equals') pass = deep ? deepEqual(actual, first) : check(actual, args, ctx);
          else if (key === 'match') {
            if (typeof first !== 'string' && !(first instanceof RegExp)) throw new UsageError('match 需要正则或字符串模式');
            try {
              pass = check(actual, args, ctx);
            } catch {
              throw new UsageError(`不是合法的正则：${fmt(first)}`);
            }
          } else if (key === 'property' && args.length > 1) {
            const got = readPath(actual, String(first)).value;
            pass = deepEqual(got, args[1]) || got === args[1];
          } else if (key === 'lengthOf' || key === 'length') {
            pass = lengthOf(actual) !== null && check(actual, args, ctx);
            if (!pass && lengthOf(actual) === null) throw new UsageError(`${fmt(actual)} 没有长度可言，用 lengthOf 前先确认类型`);
          } else if (key === 'within' && args.length < 2) {
            throw new UsageError('within 需要两个边界，例如 .within(1, 10)');
          } else pass = check(actual, args, ctx);
          return report(pass, key, args, flags, actual);
        };
      }
      throw new UsageError(`pm.expect 没有 .${key} 这个断言`);
    },
    apply() {
      throw new UsageError('pm.expect(...) 后面要跟断言，例如 .to.equal(200)');
    },
  });
}

function report(pass: boolean, assertion: string, args: unknown[], flags: { negated?: boolean }, actual: unknown): void {
  const want = !flags.negated;
  if (pass === want) return;
  throw new AssertionError(`expected ${fmt(actual)}${flags.negated ? ' not' : ''} ${describe(assertion, args)}`);
}

export function pmExpect(actual: unknown, response: ScriptResponseInput | null = null): unknown {
  return buildChain(actual, { response }, {});
}

/** 一次 `pm.sendRequest` 排出来的活：先记账，等宿主发完再把结果交回脚本。 */
interface PendingSend {
  spec: SendRequestSpec;
  callback: unknown;
  /** 非空就是这条压根没发出去（超上限、时间用完），回调照样要被告知原因。 */
  refused?: string;
}

interface RunState {
  tests: ScriptTest[];
  logs: string[];
  envWrites: EnvWrite[];
  varWrites: Record<string, string>;
  patch: RequestPatch;
  aborted: boolean;
  testsCapped: boolean;
  logsCapped: boolean;
  sendsCapped: boolean;
  /** 已排队的子请求计数（含超上限被拒的），上限按这个数算。 */
  sends: number;
  /** 脚本同步跑完后排在这里等宿主发送；回调里再发的会追加进来。 */
  pending: PendingSend[];
  /** 子请求的收发台账：界面要告诉人发了几个、结果如何，脚本断言失败时也好定位。 */
  sendResults: Array<{ ok: boolean; method: string; url: string; code?: number; error?: string }>;
}

/** `pm.test` 既能当函数用也带 `.skip`，类型上就是一个可调用对象。 */
type TestWithSkip = ((name: unknown, fn: unknown) => boolean) & { skip: (name: unknown, reason?: unknown) => boolean };

/** `pm.sendRequest` 的入参：字符串 URL 或 `{ url, method, header, body }`，`{{var}}` 在这里插好。 */
function normalizeSendSpec(target: unknown, scope: Record<string, string>): SendRequestSpec {
  const raw = typeof target === 'string' ? { url: target } : (target ?? {}) as Record<string, unknown>;
  const method = String(raw.method ?? 'GET').trim().toUpperCase() || 'GET';
  const url = interpolate(toText(raw.url ?? raw.uri ?? ''), scope).text.trim();
  if (!url) throw new UsageError('pm.sendRequest 需要一个 url：pm.sendRequest("https://example.com", (error, response) => { … })');
  if (!/^[a-z][a-z\d+.-]*:/i.test(url)) throw new UsageError(`pm.sendRequest 的 url 要带协议，例如 https://，收到的是「${url.slice(0, 40)}」`);
  if (url.length > MAX_SCRIPT_SEND_URL_CHARS) throw new UsageError(`pm.sendRequest 的 url 超过 ${MAX_SCRIPT_SEND_URL_CHARS} 字符`);
  const headers: Array<[string, string]> = [];
  const block = raw.header ?? raw.headers;
  if (Array.isArray(block)) {
    for (const item of block) {
      const row = item as { key?: unknown; name?: unknown; value?: unknown };
      const key = String(row.key ?? row.name ?? '').trim();
      if (key) headers.push([key, interpolate(toText(row.value), scope).text]);
    }
  } else if (block && typeof block === 'object') {
    for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
      const name = key.trim();
      if (name) headers.push([name, interpolate(toText(value), scope).text]);
    }
  }
  let body: string | undefined;
  const rawBody = raw.body ?? raw.data;
  if (rawBody !== undefined && rawBody !== null) body = interpolate(toText(rawBody), scope).text;
  if (body !== undefined && body.length > MAX_SCRIPT_SEND_BODY_CHARS) {
    throw new UsageError(`pm.sendRequest 的正文超过 ${MAX_SCRIPT_SEND_BODY_CHARS} 字符（当前 ${body.length}）`);
  }
  // 浏览器的 fetch 会直接拒绝「GET 带正文」，在这里拦下来才说得出人话。
  if (body !== undefined && (method === 'GET' || method === 'HEAD')) {
    throw new UsageError(`pm.sendRequest 的 ${method} 不能带正文：要发 body 就把 method 换成 POST/PUT/PATCH`);
  }
  return { url, method, headers, ...(body === undefined ? {} : { body }) };
}

/** 回调里脚本看到的子请求响应：Postman 的 `response.code / .text() / .json() / .headers()` 形状。 */
function sendResponseView(value: SendResponseInput) {
  const headers = value.headers ?? [];
  return {
    code: value.code,
    status: value.statusText ?? '',
    responseTime: value.responseTime ?? 0,
    body: value.body,
    headers: () => headers.map(([key, item]) => ({ key, value: item })),
    text: () => value.body,
    json: () => JSON.parse(value.body) as unknown,
  };
}

function normalizeKey(raw: unknown, what: string): string {
  const key = String(raw ?? '').trim();
  if (!key) throw new UsageError(`${what} 的名字不能为空`);
  if (key.length > MAX_SCRIPT_KEY_CHARS) throw new UsageError(`${what}「${key.slice(0, 24)}…」超过 ${MAX_SCRIPT_KEY_CHARS} 字符`);
  return key;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** 请求头 / 查询参数两种行形状相同，共用一套列表。 */
function buildRowList<T extends { key: string; value: string; enabled: boolean }>(
  initial: T[],
  writeBack: (rows: T[]) => void,
  what: string,
) {
  const rows = initial.map((row) => ({ ...row }));
  const find = (name: string) => rows.find((row) => row.key.toLowerCase() === name.toLowerCase());
  const list = {
    all: () => rows.map((row) => ({ ...row })),
    count: () => rows.length,
    get: (name: string) => find(String(name))?.value,
    has: (name: string) => find(String(name)) !== undefined,
    add: (entry: unknown) => {
      const item = entry as { key?: unknown; value?: unknown };
      const key = normalizeKey(item?.key, what);
      rows.push({ key, value: toText(item?.value), enabled: true } as T);
      writeBack(rows.map((row) => ({ ...row })));
      return true;
    },
    upsert: (entry: unknown) => {
      const item = entry as { key?: unknown; value?: unknown };
      const key = normalizeKey(item?.key, what);
      const hit = find(key);
      if (hit) {
        hit.value = toText(item?.value);
        hit.enabled = true;
      } else rows.push({ key, value: toText(item?.value), enabled: true } as T);
      writeBack(rows.map((row) => ({ ...row })));
      return hit === undefined;
    },
    set: (name: string, value: unknown) => list.upsert({ key: name, value }),
    remove: (name: string) => {
      const target = String(name);
      const before = rows.length;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index].key.toLowerCase() === target.toLowerCase()) rows.splice(index, 1);
      }
      writeBack(rows.map((row) => ({ ...row })));
      return before !== rows.length;
    },
    disable: (name: string) => {
      const hit = find(String(name));
      if (!hit) return false;
      hit.enabled = false;
      writeBack(rows.map((row) => ({ ...row })));
      return true;
    },
    toObject: () => {
      const out: Record<string, string> = {};
      for (const row of rows) if (row.enabled) out[row.key] = row.value;
      return out;
    },
  };
  return list;
}

/** 失控保护的第二层：每个宿主可见的往返点都先问一次还剩不剩时间。 */
function makeGuard(state: RunState, deadlineAt: number, now: () => number) {
  return () => {
    if (state.aborted || now() >= deadlineAt) {
      state.aborted = true;
      throw new RunawayError('脚本运行超时，沙箱已停止执行后续语句');
    }
  };
}

function buildPm(payload: ScriptPayload, state: RunState, guard: () => void): Record<string, unknown> {
  const writable = payload.phase === 'prerequest';
  const scope = { ...payload.vars, ...state.varWrites };

  const request = {
    get method() {
      guard();
      return state.patch.method ?? payload.request.method;
    },
    set method(value: unknown) {
      guard();
      if (!writable) throw new UsageError('测试阶段不能改写请求');
      state.patch.method = String(value ?? '').trim().toUpperCase() || payload.request.method;
    },
    get url() {
      guard();
      return state.patch.url ?? payload.request.url;
    },
    set url(value: unknown) {
      guard();
      if (!writable) throw new UsageError('测试阶段不能改写请求');
      state.patch.url = toText(value);
    },
    get body() {
      guard();
      return state.patch.bodyText ?? payload.request.bodyText;
    },
    set body(value: unknown) {
      guard();
      if (!writable) throw new UsageError('测试阶段不能改写请求');
      if (payload.request.bodyMode === 'multipart') throw new UsageError('脚本不能改写 multipart 请求体，文件的字节不在这里');
      state.patch.bodyText = toText(value);
    },
    headers: buildRowList<WbHeaderRow>(payload.request.headers, (rows) => {
      if (!writable) throw new UsageError('测试阶段不能改写请求');
      state.patch.headers = rows;
    }, '请求头'),
    params: buildRowList<WbParam>(payload.request.params, (rows) => {
      if (!writable) throw new UsageError('测试阶段不能改写请求');
      state.patch.params = rows;
    }, '查询参数'),
  };

  const response = payload.response;
  const responseView = response
    ? {
      code: response.code,
      statusText: response.statusText,
      responseTime: response.responseTime,
      headers: {
        all: () => response.headers.map(([key, value]) => ({ key, value })),
        get: (name: string) => response.headers.find(([key]) => key.toLowerCase() === String(name).toLowerCase())?.[1],
        has: (name: string) => response.headers.some(([key]) => key.toLowerCase() === String(name).toLowerCase()),
      },
      body: response.body,
      json: () => {
        guard();
        return JSON.parse(response.body) as unknown;
      },
    }
    : undefined;

  if (responseView && response) {
    const chain = buildChain(responseView, { response, onResponse: true }, {});
    for (const word of ['to', 'be', 'been', 'being', 'is', 'that', 'which', 'and', 'has', 'have', 'with', 'at', 'of', 'by', 'from', 'in']) {
      Object.defineProperty(responseView, word, { get: () => chain, enumerable: false });
    }
  }

  const environment = {
    get: (name: string) => {
      guard();
      const key = String(name);
      const local = state.envWrites.filter((write) => write.key === key);
      const last = local[local.length - 1];
      if (last) return last.op === 'set' ? last.value : undefined;
      return payload.env[key];
    },
    set: (name: unknown, value: unknown) => {
      guard();
      const key = normalizeKey(name, '环境变量');
      state.envWrites.push({ op: 'set', key, value: toText(value) });
    },
    unset: (name: unknown) => {
      guard();
      const key = normalizeKey(name, '环境变量');
      state.envWrites.push({ op: 'unset', key });
    },
    has: (name: string) => {
      guard();
      return environment.get(name) !== undefined;
    },
  };

  const variables = {
    get: (name: string) => {
      guard();
      const key = String(name);
      if (Object.prototype.hasOwnProperty.call(scope, key)) return scope[key];
      const builtin = builtinValue(key.startsWith('$') ? key : `$${key}`, Math.random, Date.now());
      if (builtin !== null && key.startsWith('$')) return builtin;
      return undefined;
    },
    set: (name: unknown, value: unknown) => {
      guard();
      if (!writable) throw new UsageError('pm.variables.set 只在预请求阶段影响本次插值，测试阶段请求已经发出去了');
      state.varWrites[normalizeKey(name, '变量')] = toText(value);
    },
    replace: (text: unknown) => {
      guard();
      return interpolate(String(text ?? ''), scope).text;
    },
  };

  const pm: Record<string, unknown> = {
    info: { eventName: payload.phase, requestName: payload.requestName ?? '' },
    variables,
    environment,
    request,
    expect: (actual: unknown) => {
      guard();
      return buildChain(actual, { response: response ?? null }, {});
    },
    test: (name: unknown, fn: unknown) => {
      guard();
      const label = normalizeKey(name, '测试名');
      if (typeof fn !== 'function') throw new UsageError(`pm.test('${label}', () => { ... }) 需要回调函数`);
      if (state.tests.length >= MAX_SCRIPT_TESTS) {
        state.testsCapped = true;
        return false;
      }
      try {
        (fn as () => void)();
        state.tests.push({ name: label, status: 'pass' });
      } catch (caught) {
        if (caught instanceof RunawayError) {
          state.aborted = true;
          state.tests.push({ name: label, status: 'fail', error: caught.message });
          throw caught;
        }
        state.tests.push({
          name: label,
          status: 'fail',
          error: caught instanceof Error ? caught.message : String(caught),
        });
      }
      return true;
    },
    sendRequest: (target: unknown, callback?: unknown) => {
      guard();
      const spec = normalizeSendSpec(target, { ...payload.vars, ...state.varWrites });
      if (state.sends >= MAX_SCRIPT_SENDS) {
        state.sendsCapped = true;
        state.pending.push({
          spec,
          callback,
          refused: `一次运行最多允许 ${MAX_SCRIPT_SENDS} 个 pm.sendRequest，这条没有发出去`,
        });
        return undefined;
      }
      state.sends += 1;
      state.pending.push({ spec, callback });
      return undefined;
    },
  };

  // `pm.test.skip('名字')`：记账但根本不跑，用于「这条现在还没法验」的诚实占位。
  (pm.test as TestWithSkip).skip = (name: unknown, reason?: unknown) => {
    guard();
    const label = normalizeKey(name, '测试名');
    if (state.tests.length >= MAX_SCRIPT_TESTS) {
      state.testsCapped = true;
      return false;
    }
    const note = reason === undefined || reason === null ? undefined : toText(reason);
    state.tests.push({ name: label, status: 'skip', ...(note ? { error: note } : {}) });
    return true;
  };

  if (responseView) pm.response = responseView;
  else {
    // 预请求时给一个「碰一下就报清楚」的占位，别让脚本收到 undefined.x 那种天书。
    pm.response = new Proxy({} as object, {
      get() {
        throw new UsageError('预请求阶段还没有 pm.response：响应是请求发出之后才有的东西');
      },
    });
  }
  return pm;
}

function consoleOf(state: RunState, guard: () => void): Record<string, (...args: unknown[]) => void> {
  const push = (...args: unknown[]) => {
    guard();
    const line = args.map((arg) => (typeof arg === 'string' ? arg : fmt(arg))).join(' ');
    const text = line.length > MAX_SCRIPT_LOG_CHARS ? `${line.slice(0, MAX_SCRIPT_LOG_CHARS)}…` : line;
    if (state.logs.length >= MAX_SCRIPT_LOGS) {
      // 环形留尾：调试一个跑在循环里的脚本，要看的是最后几条，不是最早那几条。
      state.logsCapped = true;
      state.logs.shift();
    }
    state.logs.push(text);
  };
  return { log: push, info: push, warn: push, error: push, debug: push };
}

/** 脚本里出现这些名字一律拿到 undefined：能力不给，用了就报错，别静默换行为。 */
const BLOCKED_NAMES = [
  'fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB',
  'importScripts', 'Worker', 'SharedWorker', 'BroadcastChannel', 'navigator', 'location', 'history',
  'document', 'window', 'self', 'globalThis', 'require', 'module',
] as const;

/**
 * `new Function` 按规范给函数体垫两行（`function anonymous(…)` 与 `) {`），
 * 我们再把 `"use strict"` 单独放在第一行，所以栈里的行号比编辑器里的多 3。
 */
const SCRIPT_LINE_OFFSET = 3;

/** `at eval (eval at compile, <anonymous>:7:15)` → 4。取最里层那一处，拿不到就不给。 */
export function errorLine(stack: unknown): number | undefined {
  if (typeof stack !== 'string') return undefined;
  const match = stack.match(/<anonymous>:(\d+):(\d+)/);
  if (!match) return undefined;
  const value = Number(match[1]) - SCRIPT_LINE_OFFSET;
  return value > 0 ? value : undefined;
}

interface PreparedRun {
  state: RunState;
  startedAt: number;
  deadlineAt: number;
  /** 脚本主体跑一次；排出来的子请求留在 state.pending 里等宿主。 */
  invoke: () => ScriptResult;
  /** 把一条子请求的结果交给脚本回调；回调里再发的请求会追加进 pending。 */
  deliver: (job: PendingSend, outcome: SendOutcome) => void;
  /** 回调里抛出的错：脚本主体早已结束，这笔账要另记到最终结果上。 */
  failure?: { error: string; errorLine?: number };
}

/** 跑一次脚本主体，并把「子请求怎么交回脚本」一并准备好；这里只同步执行，不发送任何东西。 */
function prepareRun(payload: ScriptPayload, now: () => number): PreparedRun {
  const startedAt = now();
  const state: RunState = {
    tests: [],
    logs: [],
    envWrites: [],
    varWrites: {},
    patch: {},
    aborted: false,
    testsCapped: false,
    logsCapped: false,
    sendsCapped: false,
    sends: 0,
    pending: [],
    sendResults: [],
  };
  const base: ScriptResult = {
    ran: false,
    tests: state.tests,
    logs: state.logs,
    envWrites: state.envWrites,
    varWrites: state.varWrites,
    patch: state.patch,
    skips: 0,
    sends: 0,
    durationMs: 0,
  };
  const script = payload.script ?? '';
  if (!script.trim()) {
    return { state, startedAt, deadlineAt: startedAt, invoke: () => ({ ...base }), deliver: () => {} };
  }
  if (script.length > MAX_SCRIPT_CHARS) {
    const tooLong = `脚本超过 ${MAX_SCRIPT_CHARS} 字符（当前 ${script.length}），请精简后再运行`;
    return { state, startedAt, deadlineAt: startedAt, invoke: () => ({ ...base, error: tooLong, durationMs: Math.max(0, now() - startedAt) }), deliver: () => {} };
  }

  const deadlineAt = startedAt + clampDeadline(payload.deadlineMs);
  const guard = makeGuard(state, deadlineAt, now);
  const pm = buildPm(payload, state, guard);
  const console2 = consoleOf(state, guard);
  const run: PreparedRun = { state, startedAt, deadlineAt, invoke: () => base, deliver: () => {} };

  /** 回调里抛出来的错不是脚本主体的错：单独记一笔，末尾并进结果，别让整次运行变成一句「未知错误」。 */
  run.deliver = (job, outcome) => {
    state.sendResults.push({
      ok: outcome.ok,
      method: job.spec.method,
      url: job.spec.url,
      ...(outcome.ok ? { code: outcome.response.code } : { error: outcome.error }),
    });
    if (typeof job.callback !== 'function') return;
    try {
      guard();
      (job.callback as (error: unknown, response: unknown) => void)(
        outcome.ok ? null : new Error(outcome.error),
        outcome.ok ? sendResponseView(outcome.response) : null,
      );
    } catch (caught) {
      if (caught instanceof RunawayError) state.aborted = true;
      else if (caught instanceof AssertionError) state.tests.push({ name: '子请求回调里的裸断言', status: 'fail', error: caught.message });
      else if (!run.failure) {
        run.failure = {
          error: `pm.sendRequest 的回调里出了错：${caught instanceof Error ? caught.message : String(caught)}`,
          ...(errorLine((caught as { stack?: unknown })?.stack) !== undefined ? { errorLine: errorLine((caught as { stack?: unknown })?.stack) } : {}),
        };
      }
    }
  };

  let fn: (...args: unknown[]) => unknown;
  try {
    fn = new Function('pm', 'console', ...BLOCKED_NAMES, `"use strict";\n${script}`) as (...args: unknown[]) => unknown;
  } catch (caught) {
    run.invoke = () => ({
      ...base,
      error: `脚本没能解析：${caught instanceof Error ? caught.message : String(caught)}`,
      errorLine: errorLine((caught as { stack?: unknown })?.stack),
      durationMs: Math.max(0, now() - startedAt),
    });
    return run;
  }

  run.invoke = () => {
    try {
      fn(pm, console2, ...BLOCKED_NAMES.map(() => undefined));
    } catch (caught) {
      if (caught instanceof RunawayError) {
        state.aborted = true;
      } else if (caught instanceof AssertionError) {
        // 裸 expect（没包在 pm.test 里）失败：算一条测试，不遮蔽真正的原因
        state.tests.push({ name: '脚本里的裸断言', status: 'fail', error: caught.message });
      } else {
        return {
          ...base,
          error: `${caught instanceof Error ? caught.message : String(caught)}`,
          errorLine: errorLine((caught as { stack?: unknown })?.stack),
          durationMs: Math.max(0, now() - startedAt),
        };
      }
    }
    return { ...base, ran: true };
  };
  return run;
}

/** 每次跑完都要按当下的 state 重算这几个数：断言、跳过、子请求都在运行中变。 */
function finalize(run: PreparedRun, result: ScriptResult, now: () => number): ScriptResult {
  const { state } = run;
  const next: ScriptResult = {
    ...result,
    skips: state.tests.filter((test) => test.status === 'skip').length,
    sends: state.sends,
    durationMs: Math.max(0, now() - run.startedAt),
    ...(state.aborted ? { aborted: true } : {}),
    ...(state.testsCapped ? { testsCapped: true } : {}),
    ...(state.logsCapped ? { logsCapped: true } : {}),
    ...(state.sendsCapped ? { sendsCapped: true } : {}),
    ...(state.sendResults.length > 0 ? { sendResults: state.sendResults } : {}),
  };
  if (run.failure && !next.error) return { ...next, ...run.failure };
  return next;
}

/**
 * 同步跑一遍脚本：子请求不会被发出去，排在那里的回调只会收到「这次没有发送通道」。
 * 需要 `pm.sendRequest` 真的工作就用 runScriptSession，它才是 worker 走的那条路。
 */
export function runScript(payload: ScriptPayload, now: () => number = Date.now): ScriptResult {
  const run = prepareRun(payload, now);
  const result = run.invoke();
  for (const job of run.state.pending.splice(0, run.state.pending.length)) {
    run.deliver(job, { ok: false, error: job.refused ?? '这次运行没有启用子请求发送通道' });
  }
  return finalize(run, result, now);
}

/**
 * 跑一遍脚本并把 `pm.sendRequest` 排出来的子请求真发出去，结果交回回调后再收尾。
 * 分轮排空：回调里还能再发，但总条数与总轮数都有上限，时间也仍然受 deadline 管。
 */
export async function runScriptSession(
  payload: ScriptPayload,
  send: SendRequester,
  now: () => number = Date.now,
): Promise<ScriptResult> {
  const run = prepareRun(payload, now);
  const result = run.invoke();
  const channelCapMs = payload.sendChannel?.timeoutMs ?? MAX_SCRIPT_SEND_TIMEOUT_MS;
  let rounds = 0;
  while (run.state.pending.length > 0 && !run.failure && !run.state.aborted && rounds < MAX_SEND_ROUNDS) {
    rounds += 1;
    const batch = run.state.pending.splice(0, run.state.pending.length);
    const settled = await Promise.all(batch.map(async (job): Promise<{ job: PendingSend; outcome: SendOutcome }> => {
      if (job.refused) return { job, outcome: { ok: false, error: job.refused } };
      // 能等的时间 = 单次上限、界面取数超时、这次运行剩下的时间，三者里最小的那个。
      const budgetMs = Math.min(MAX_SCRIPT_SEND_TIMEOUT_MS, channelCapMs, run.deadlineAt - now());
      if (!(budgetMs > 0)) return { job, outcome: { ok: false, error: '这次运行已经没有时间等这条子请求了' } };
      try {
        return { job, outcome: await send(job.spec, budgetMs) };
      } catch (caught) {
        return { job, outcome: { ok: false, error: caught instanceof Error ? caught.message : String(caught) } };
      }
    }));
    for (const item of settled) run.deliver(item.job, item.outcome);
  }
  for (const job of run.state.pending.splice(0, run.state.pending.length)) {
    const why = run.failure ? '回调里先出了错' : run.state.aborted ? '脚本的时间用完了' : '子请求排队超过了轮次上限';
    run.deliver(job, { ok: false, error: `${why}，这条子请求没有发出` });
  }
  return finalize(run, result, now);
}

/** 把脚本改出来的请求字段并回原请求；没改就原样返回，避免无谓的对象复制。 */
export function applyRequestPatch<T extends {
  method: string;
  customMethod?: string;
  url: string;
  headers: WbHeaderRow[];
  params?: WbParam[];
  body: { mode: WbBodyMode; text: string; graphql?: { query: string; variables: string; operationName?: string } };
}>(request: T, patch: RequestPatch): T {
  if (!patch.method && !patch.url && !patch.headers && !patch.params && patch.bodyText === undefined) return request;
  const next = { ...request };
  if (patch.method) {
    next.method = patch.method;
    // 自定义动词字段一旦存在就赢过白名单字段，改写回默认动词时得让位
    if ((WB_METHODS as readonly string[]).includes(patch.method)) next.customMethod = undefined;
  }
  if (patch.url !== undefined) next.url = patch.url;
  if (patch.headers) next.headers = patch.headers;
  if (patch.params) next.params = patch.params;
  if (patch.bodyText !== undefined) {
    next.body = next.body.mode === 'graphql'
      ? { ...next.body, graphql: { ...(next.body.graphql ?? { variables: '' }), query: patch.bodyText } }
      : { ...next.body, text: patch.bodyText };
  }
  return next;
}

/** 按顺序落 `pm.environment.*`：后写的覆盖先写的，unset 删掉同名项。 */
export function applyEnvWrites(vars: WbVar[], writes: EnvWrite[]): WbVar[] {
  if (writes.length === 0) return vars;
  let next = vars.map((item) => ({ ...item }));
  for (const write of writes) {
    const index = next.findIndex((item) => item.key === write.key);
    if (write.op === 'unset') {
      if (index >= 0) next.splice(index, 1);
      continue;
    }
    const value = write.value ?? '';
    if (index >= 0) next[index] = { ...next[index], value, enabled: true };
    else next = [...next, { id: `script-${write.key}`, key: write.key, value, enabled: true }];
  }
  return next;
}
