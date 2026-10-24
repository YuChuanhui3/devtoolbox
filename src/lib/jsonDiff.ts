import { parseTree, type Node as JsoncNode, type Segment } from 'jsonc-parser';
import { toToolError } from './errors';
import { parseJson, sortKeysDeep } from './json';
import type { Localized } from '@/i18n/locale';

export type JsonDiffSide = 'left' | 'right';
export type JsonDiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';
export type JsonValueKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export interface JsonDiffOptions {
  ignoreKeyOrder?: boolean;
  /** 比较前先把两侧对象的键名排序，让同一份数据的不同键顺序呈现为逐行对齐的差异。 */
  sortKeys?: boolean;
}

export const DEFAULT_JSON_DIFF_OPTIONS: Required<JsonDiffOptions> = {
  ignoreKeyOrder: true,
  sortKeys: false,
};

export interface JsonDiffError {
  side: JsonDiffSide;
  message: Localized;
  hint?: Localized;
  line?: number;
  column?: number;
}

export interface JsonDiffSideInfo {
  kind: JsonValueKind;
  preview: string;
  line: number | null;
}

export interface JsonDiffNode {
  id: string;
  path: string;
  key: string;
  kind: 'object' | 'array' | 'value';
  status: JsonDiffStatus;
  orderChanged: boolean;
  left?: JsonDiffSideInfo;
  right?: JsonDiffSideInfo;
  children: JsonDiffNode[];
}

export interface JsonDiffStats {
  added: number;
  removed: number;
  modified: number;
}

export type JsonDiffResult =
  | { ok: true; root: JsonDiffNode; stats: JsonDiffStats; equal: boolean }
  | { ok: false; errors: JsonDiffError[] };

export interface JsonDiffRow {
  node: JsonDiffNode;
  depth: number;
}

export interface FlattenJsonDiffOptions {
  collapsed?: ReadonlySet<string>;
  onlyChanges?: boolean;
}

const MISSING = Symbol('missing');
type MaybeValue = unknown | typeof MISSING;
type ResolvedOptions = Required<JsonDiffOptions>;

function kindOf(value: unknown): JsonValueKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'null';
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function previewOf(value: unknown, kind: JsonValueKind): string {
  if (kind === 'object') {
    const count = Object.keys(value as Record<string, unknown>).length;
    return count === 0 ? '{}' : `{ ${count} 个字段 }`;
  }
  if (kind === 'array') {
    const count = (value as unknown[]).length;
    return count === 0 ? '[]' : `[ ${count} 项 ]`;
  }
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

function formatPath(segments: Segment[]): string {
  let path = '$';
  for (const segment of segments) {
    if (typeof segment === 'number') {
      path += `[${segment}]`;
    } else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
      path += `.${segment}`;
    } else {
      path += `[${JSON.stringify(segment)}]`;
    }
  }
  return path;
}

function keyOf(segments: Segment[]): string {
  if (segments.length === 0) return '$';
  const last = segments[segments.length - 1];
  return typeof last === 'number' ? `[${last}]` : last;
}

function sourceKey(segments: Segment[]): string {
  return segments
    .map((segment) => (typeof segment === 'number' ? `#${segment}` : `s${JSON.stringify(segment)}`))
    .join('/');
}

function createLineResolver(text: string): (offset: number) => number {
  const lineStarts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) lineStarts.push(index + 1);
  }

  return (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (lineStarts[middle] <= offset) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return Math.max(1, high + 1);
  };
}

function collectLineNumbers(text: string): Map<string, number> {
  const lines = new Map<string, number>();
  const tree = parseTree(text);
  if (!tree) return lines;

  const lineAt = createLineResolver(text);
  const walk = (node: JsoncNode, segments: Segment[]) => {
    lines.set(sourceKey(segments), lineAt(node.offset));

    if (node.type === 'object') {
      for (const property of node.children ?? []) {
        const keyNode = property.children?.[0];
        const valueNode = property.children?.[1];
        if (keyNode && valueNode && typeof keyNode.value === 'string') {
          walk(valueNode, [...segments, keyNode.value]);
        }
      }
    } else if (node.type === 'array') {
      (node.children ?? []).forEach((child, index) => walk(child, [...segments, index]));
    }
  };

  walk(tree, []);
  return lines;
}

function buildNode(
  segments: Segment[],
  left: MaybeValue,
  right: MaybeValue,
  options: ResolvedOptions,
  leftLines: Map<string, number>,
  rightLines: Map<string, number>,
): JsonDiffNode {
  const leftExists = left !== MISSING;
  const rightExists = right !== MISSING;
  const path = formatPath(segments);
  const leftKind = leftExists ? kindOf(left) : null;
  const rightKind = rightExists ? kindOf(right) : null;

  const leftInfo: JsonDiffSideInfo | undefined = leftExists
    ? {
        kind: leftKind as JsonValueKind,
        preview: previewOf(left, leftKind as JsonValueKind),
        line: leftLines.get(sourceKey(segments)) ?? null,
      }
    : undefined;
  const rightInfo: JsonDiffSideInfo | undefined = rightExists
    ? {
        kind: rightKind as JsonValueKind,
        preview: previewOf(right, rightKind as JsonValueKind),
        line: rightLines.get(sourceKey(segments)) ?? null,
      }
    : undefined;

  if (!leftExists || !rightExists) {
    const value = leftExists ? left : right;
    const side: JsonDiffSide = leftExists ? 'left' : 'right';
    const status: JsonDiffStatus = leftExists ? 'removed' : 'added';
    const kind = kindOf(value);
    const children: JsonDiffNode[] = [];

    if (kind === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        children.push(
          buildNode(
            [...segments, key],
            side === 'left' ? record[key] : MISSING,
            side === 'right' ? record[key] : MISSING,
            options,
            leftLines,
            rightLines,
          ),
        );
      }
    } else if (kind === 'array') {
      (value as unknown[]).forEach((item, index) => {
        children.push(
          buildNode(
            [...segments, index],
            side === 'left' ? item : MISSING,
            side === 'right' ? item : MISSING,
            options,
            leftLines,
            rightLines,
          ),
        );
      });
    }

    return {
      id: path,
      path,
      key: keyOf(segments),
      kind: kind === 'object' || kind === 'array' ? kind : 'value',
      status,
      orderChanged: false,
      left: leftInfo,
      right: rightInfo,
      children,
    };
  }

  if (leftKind !== rightKind) {
    return {
      id: path,
      path,
      key: keyOf(segments),
      kind: 'value',
      status: 'modified',
      orderChanged: false,
      left: leftInfo,
      right: rightInfo,
      children: [],
    };
  }

  if (leftKind === 'object') {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    const keys = options.sortKeys
      ? [...new Set([...leftKeys, ...rightKeys])].sort()
      : [...leftKeys, ...rightKeys.filter((key) => !hasOwn(leftRecord, key))];

    const leftCommon = leftKeys.filter((key) => hasOwn(rightRecord, key));
    const rightCommon = rightKeys.filter((key) => hasOwn(leftRecord, key));
    const orderChanged =
      !options.ignoreKeyOrder && leftCommon.some((key, index) => key !== rightCommon[index]);

    const children = keys.map((key) =>
      buildNode(
        [...segments, key],
        hasOwn(leftRecord, key) ? leftRecord[key] : MISSING,
        hasOwn(rightRecord, key) ? rightRecord[key] : MISSING,
        options,
        leftLines,
        rightLines,
      ),
    );

    return {
      id: path,
      path,
      key: keyOf(segments),
      kind: 'object',
      status: orderChanged ? 'modified' : 'unchanged',
      orderChanged,
      left: leftInfo,
      right: rightInfo,
      children,
    };
  }

  if (leftKind === 'array') {
    const leftItems = left as unknown[];
    const rightItems = right as unknown[];
    const length = Math.max(leftItems.length, rightItems.length);
    const children = Array.from({ length }, (_, index) =>
      buildNode(
        [...segments, index],
        index < leftItems.length ? leftItems[index] : MISSING,
        index < rightItems.length ? rightItems[index] : MISSING,
        options,
        leftLines,
        rightLines,
      ),
    );

    return {
      id: path,
      path,
      key: keyOf(segments),
      kind: 'array',
      status: 'unchanged',
      orderChanged: false,
      left: leftInfo,
      right: rightInfo,
      children,
    };
  }

  return {
    id: path,
    path,
    key: keyOf(segments),
    kind: 'value',
    status: left === right ? 'unchanged' : 'modified',
    orderChanged: false,
    left: leftInfo,
    right: rightInfo,
    children: [],
  };
}

function tally(node: JsonDiffNode, stats: JsonDiffStats): void {
  if (node.status === 'added' || node.status === 'removed') {
    if (node.kind === 'value' || node.children.length === 0) {
      stats[node.status] += 1;
      return;
    }
    node.children.forEach((child) => tally(child, stats));
    return;
  }

  if (node.status === 'modified') {
    if (node.kind === 'value' || node.orderChanged) stats.modified += 1;
    node.children.forEach((child) => tally(child, stats));
    return;
  }

  node.children.forEach((child) => tally(child, stats));
}

export function compareJson(
  leftText: string,
  rightText: string,
  options: JsonDiffOptions = {},
): JsonDiffResult {
  const resolved: ResolvedOptions = {
    ignoreKeyOrder: options.ignoreKeyOrder ?? DEFAULT_JSON_DIFF_OPTIONS.ignoreKeyOrder,
    sortKeys: options.sortKeys ?? DEFAULT_JSON_DIFF_OPTIONS.sortKeys,
  };
  const errors: JsonDiffError[] = [];

  const parseSide = (side: JsonDiffSide, text: string): MaybeValue => {
    try {
      return parseJson(text);
    } catch (error) {
      const toolError = toToolError(error);
      errors.push({
        side,
        message: toolError.localized,
        hint: toolError.hint,
        line: toolError.location?.line,
        column: toolError.location?.column,
      });
      return MISSING;
    }
  };

  const left = parseSide('left', leftText);
  const right = parseSide('right', rightText);
  if (left === MISSING || right === MISSING) return { ok: false, errors };

  const root = buildNode(
    [],
    resolved.sortKeys ? sortKeysDeep(left) : left,
    resolved.sortKeys ? sortKeysDeep(right) : right,
    resolved,
    collectLineNumbers(leftText),
    collectLineNumbers(rightText),
  );
  const stats: JsonDiffStats = { added: 0, removed: 0, modified: 0 };
  tally(root, stats);

  return {
    ok: true,
    root,
    stats,
    equal: stats.added + stats.removed + stats.modified === 0,
  };
}

export function flattenJsonDiff(
  root: JsonDiffNode,
  options: FlattenJsonDiffOptions = {},
): JsonDiffRow[] {
  const collapsed = options.collapsed ?? new Set<string>();
  const onlyChanges = options.onlyChanges ?? false;
  const changeMemo = new Map<string, boolean>();
  const rows: JsonDiffRow[] = [];

  const hasChange = (node: JsonDiffNode): boolean => {
    const cached = changeMemo.get(node.id);
    if (cached !== undefined) return cached;
    const result = node.status !== 'unchanged' || node.children.some(hasChange);
    changeMemo.set(node.id, result);
    return result;
  };

  const visit = (node: JsonDiffNode, depth: number) => {
    if (onlyChanges && !hasChange(node)) return;
    rows.push({ node, depth });
    if (collapsed.has(node.id)) return;
    node.children.forEach((child) => visit(child, depth + 1));
  };

  visit(root, 0);
  return rows;
}

export function collectJsonDiffContainerIds(root: JsonDiffNode): string[] {
  const ids: string[] = [];
  const walk = (node: JsonDiffNode) => {
    if (node.children.length > 0) {
      ids.push(node.id);
      node.children.forEach(walk);
    }
  };
  walk(root);
  return ids;
}

function appendSide(
  node: JsonDiffNode,
  symbol: '+' | '-',
  side: JsonDiffSide,
  lines: string[],
): void {
  if (node.kind === 'value' || node.children.length === 0) {
    const info = side === 'left' ? node.left : node.right;
    lines.push(`${symbol} ${node.path} = ${info?.preview ?? ''}`);
    return;
  }
  node.children.forEach((child) => appendSide(child, symbol, side, lines));
}

export function formatJsonDiff(root: JsonDiffNode, stats: JsonDiffStats): string {
  const total = stats.added + stats.removed + stats.modified;
  if (total === 0) return '两侧 JSON 结构一致，无差异。';

  const lines: string[] = [
    `JSON Diff（新增 ${stats.added} · 删除 ${stats.removed} · 修改 ${stats.modified}）`,
    '',
  ];

  const visit = (node: JsonDiffNode) => {
    if (node.status === 'added') {
      appendSide(node, '+', 'right', lines);
      return;
    }
    if (node.status === 'removed') {
      appendSide(node, '-', 'left', lines);
      return;
    }
    if (node.status === 'modified') {
      if (node.kind === 'value') {
        lines.push(
          `~ ${node.path}: ${node.left?.preview ?? ''} => ${node.right?.preview ?? ''}`,
        );
      } else if (node.orderChanged) {
        lines.push(`~ ${node.path}: 键顺序变化`);
      }
      node.children.forEach(visit);
      return;
    }
    node.children.forEach(visit);
  };

  visit(root);
  return lines.join('\n');
}
