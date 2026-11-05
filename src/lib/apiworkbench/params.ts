import type { WbParam } from './types';

/**
 * 参数表格与 URL 查询串的双向绑定。
 *
 * 不变量：`req.url` 的查询串永远等于表格里**启用**行的序列化结果；表格另外保留被禁用的行。
 * 因此发送时只用 url，不再二次拼接参数。
 *
 * 不使用 `URL`/`URLSearchParams`：它们会把 `+` 解成空格、把 `%2B` 解成 `+`，
 * 回填时就双重编码了；而 `{{变量}}` 这类占位也必须在原样往返时保持不变。
 */

export const blankParam = (): WbParam => ({ key: '', value: '', enabled: true });

export const normalizeParam = (row: WbParam): WbParam => ({
  ...row,
  key: row.key.trim(),
  value: row.value.trim(),
});

export interface QuerySplit {
  /** 不含查询串与片段的部分。 */
  base: string;
  /** 原始查询串，不含 `?`，也不含 `#` 之后的部分。 */
  query: string;
  /** 片段，含前导 `#`；没有则为空。 */
  hash: string;
}

/** 在第一个 `?`（且它先于 `#`）处切开；`#frag?x=1` 整体算片段。 */
export function splitQuery(url: string): QuerySplit {
  const hashAt = url.indexOf('#');
  const question = url.indexOf('?');
  if (question < 0 || (hashAt >= 0 && question > hashAt)) {
    return { base: hashAt < 0 ? url : url.slice(0, hashAt), query: '', hash: hashAt < 0 ? '' : url.slice(hashAt) };
  }
  const cut = hashAt < 0 ? url.length : hashAt;
  return { base: url.slice(0, question), query: url.slice(question + 1, cut), hash: hashAt < 0 ? '' : url.slice(hashAt) };
}

export function joinQuery({ base, query, hash }: QuerySplit): string {
  return `${base}${query ? `?${query}` : ''}${hash}`;
}

/**
 * 只转义会破坏分帧的字符：`&` 会被当成下一个参数，`#` 会把后半段变成片段。
 * 其余一律原样写出——`{{变量}}` 的花括号必须保持字面，否则发送前的插值匹配不上；
 * `%` 也不碰，避免把已经编码好的值二次编码。
 */
export function escapeFrameChars(raw: string): string {
  return raw.replace(/[&#]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** 按第一个 `=` 分键值；`a=b=c` 的值是 `b=c`。 */
export function paramsFromQuery(query: string): WbParam[] {
  const rows: WbParam[] = [];
  for (const segment of query.split('&')) {
    if (!segment) continue;
    const eq = segment.indexOf('=');
    if (eq < 0) rows.push({ key: segment, value: '', enabled: true });
    else rows.push({ key: segment.slice(0, eq), value: segment.slice(eq + 1), enabled: true });
  }
  return rows;
}

export function queryFromParams(params: WbParam[]): string {
  return params
    .map(normalizeParam)
    .filter((p) => p.enabled && p.key)
    .map((p) => `${escapeFrameChars(p.key)}=${escapeFrameChars(p.value)}`)
    .join('&');
}

/** 表格里已禁用的行，若在新一轮解析里又出现了同名键，就以解析结果为准。 */
export function mergeParsedParams(parsed: WbParam[], previous: WbParam[]): WbParam[] {
  const disabled = previous.filter((p) => !p.enabled && p.key.trim());
  const kept = disabled.filter((d) => !parsed.some((p) => p.key === d.key.trim()));
  return [...parsed, ...kept];
}

/**
 * URL 编辑后重算配对。
 * 表格与 URL 是同一个查询串的两种视图，所以调用方传进编辑前的表格：
 * 若当前表格序列化结果已经等于新 URL 的查询串，就保留表格（禁用的行只存在于表格里，不能被刷新掉）；
 * 否则说明用户直接在 URL 上改了查询串，以 URL 为准重新解析，并把仍同名的禁用行接回去。
 */
export function paramsFromUrlEdit(url: string, previous: WbParam[]): WbParam[] {
  const query = splitQuery(url).query;
  if (queryFromParams(previous) === query) return previous;
  return mergeParsedParams(paramsFromQuery(query), previous);
}

/** 表格编辑后回写 URL。 */
export function applyParamsToUrl(url: string, params: WbParam[]): string {
  const parts = splitQuery(url);
  return joinQuery({ ...parts, query: queryFromParams(params) });
}

/** 发送前用表格兜底一次：即便 UI 与 URL 曾经不同步，也只注入启用行。 */
export function finalUrl(url: string, params: WbParam[] | undefined): string {
  if (!params?.length) return url;
  return applyParamsToUrl(url, params);
}

const PAIR_PATTERN = /^([^=]+)=(.*)$/;

/** 批量编辑文本：每行 `key=value`，空行与行首 `#` 视为注释。 */
export function paramsFromBulkText(text: string): WbParam[] {
  const rows: WbParam[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = PAIR_PATTERN.exec(trimmed);
    if (match) rows.push({ key: match[1].trim(), value: match[2].trim(), enabled: true });
    else rows.push({ key: trimmed, value: '', enabled: true });
  }
  return rows;
}

/** 批量视图只列启用行；禁用行是表格独有的，应用时由 mergeParsedParams 接回去。 */
export function bulkTextFromParams(params: WbParam[]): string {
  return params
    .map(normalizeParam)
    .filter((p) => p.key && p.enabled)
    .map((p) => (p.value ? `${p.key}=${p.value}` : p.key))
    .join('\n');
}
