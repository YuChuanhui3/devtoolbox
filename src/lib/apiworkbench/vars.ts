import { newId, randomHex, type RandomFn } from './id';
import type { WbVar } from './types';

const TOKEN_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** 提取文本里出现的全部 {{token}}（去重，含内置 $ 变量）。 */
export function extractVars(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(TOKEN_PATTERN)) found.add(match[1]);
  return [...found];
}

/** 后面的层覆盖前面的层：调用方按 集合 → 环境 的顺序传入。 */
export function mergeVarScopes(...levels: WbVar[][]): Record<string, string> {
  const scope: Record<string, string> = {};
  for (const vars of levels) {
    for (const v of vars) {
      if (v.enabled && v.key.trim()) scope[v.key.trim()] = v.value;
    }
  }
  return scope;
}

/**
 * 同样按「后层覆盖前层」并成一张变量表，但保留行本身（启用位、secret 位、顺序）。
 * 环境继承链要用这张表：脚本读的是行，不只是值。
 */
export function mergeVarLists(...levels: WbVar[][]): WbVar[] {
  const index = new Map<string, number>();
  const out: WbVar[] = [];
  for (const vars of levels) {
    for (const v of vars) {
      const key = v.key.trim();
      if (!key) continue;
      const at = index.get(key);
      if (at === undefined) {
        index.set(key, out.length);
        out.push({ ...v });
      } else out[at] = { ...v };
    }
  }
  return out;
}

export interface InterpolateResult {
  text: string;
  missing: string[];
}

/** 内置变量：{{$uuid}} / {{$timestamp}} / {{$randomInt(min,max)}}；其余查 scope。 */
export function builtinValue(token: string, rand: RandomFn, now: number): string | null {
  if (!token.startsWith('$')) return null;
  if (token === '$uuid') return newId(rand);
  if (token === '$timestamp') return String(now);
  const randomInt = token.match(/^\$randomInt\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/);
  if (randomInt) {
    const lo = BigInt(randomInt[1]);
    const hi = BigInt(randomInt[2]);
    const [min, max] = lo <= hi ? [lo, hi] : [hi, lo];
    const span = max - min + 1n;
    // 16 进制位拼出足够宽的随机数再取模，避免小数精度问题。
    const raw = BigInt(`0x${randomHex(rand, 12)}`);
    return String(min + (raw % (span > 0n ? span : 1n)));
  }
  return '';
}

export function interpolate(
  text: string,
  scope: Record<string, string>,
  rand: RandomFn = Math.random,
  now: number = Date.now(),
): InterpolateResult {
  const missing: string[] = [];
  const out = text.replace(TOKEN_PATTERN, (whole, rawToken: string) => {
    const token = rawToken.trim();
    const builtin = builtinValue(token, rand, now);
    if (builtin !== null) return builtin;
    if (Object.prototype.hasOwnProperty.call(scope, token)) return scope[token];
    if (!missing.includes(token)) missing.push(token);
    return whole;
  });
  return { text: out, missing };
}

/** 对整个请求可插值字段做检测，返回缺失变量清单（发送前警告用）。 */
export function collectMissing(fields: string[], scope: Record<string, string>): string[] {
  const missing = new Set<string>();
  for (const text of fields) {
    for (const token of extractVars(text)) {
      if (!token.startsWith('$') && !Object.prototype.hasOwnProperty.call(scope, token)) missing.add(token);
    }
  }
  return [...missing];
}
