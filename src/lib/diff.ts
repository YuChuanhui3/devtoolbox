import { diffChars, diffLines, diffWordsWithSpace } from 'diff';
import { ToolError, toToolError } from './errors';
import { parseJson } from './json';

export interface DiffPart {
  value: string;
  added: boolean;
  removed: boolean;
  lines: string[];
}

export interface DiffResult {
  parts: DiffPart[];
  stats: {
    added: number;
    removed: number;
    unchanged: number;
  };
}

export interface DiffOptions {
  ignoreWhitespace: boolean;
  compareAsJson: boolean;
}

function countPartLines(value: string): number {
  if (!value) return 0;
  const normalized = value.endsWith('\n') ? value.slice(0, -1) : value;
  if (!normalized) return 0;
  return normalized.split('\n').length;
}

export function compareText(left: string, right: string, options: DiffOptions): DiffResult {
  let first = left;
  let second = right;

  if (options.compareAsJson) {
    try {
      first = JSON.stringify(parseJson(left), null, 2);
      second = JSON.stringify(parseJson(right), null, 2);
    } catch (error) {
      const inner = toToolError(error);
      throw new ToolError(
        {
          zh: 'JSON 对比失败：两侧内容都必须是合法 JSON',
          en: 'JSON comparison failed: both sides must be valid JSON',
        },
        inner.hint ?? inner.localized,
        inner.location,
      );
    }
  }

  const changes = diffLines(first, second, {
    ignoreWhitespace: options.ignoreWhitespace,
    newlineIsToken: false,
  });

  const stats = { added: 0, removed: 0, unchanged: 0 };
  const parts: DiffPart[] = changes
    .map((change) => {
      const added = change.added === true;
      const removed = change.removed === true;
      const lines = countPartLines(change.value);
      if (added) stats.added += lines;
      else if (removed) stats.removed += lines;
      else stats.unchanged += lines;

      return {
        value: change.value,
        added,
        removed,
        lines: change.value.split('\n').slice(0, change.value.endsWith('\n') ? -1 : undefined),
      };
    })
    .filter((part) => part.lines.length > 0);

  return { parts, stats };
}

export function isEmptyDiff(result: DiffResult): boolean {
  return result.stats.added === 0 && result.stats.removed === 0;
}

export type InlineGranularity = 'word' | 'char';

export interface InlineDiffPart {
  value: string;
  added: boolean;
  removed: boolean;
}

export interface InlineDiffResult {
  parts: InlineDiffPart[];
  stats: { added: number; removed: number; unchanged: number };
}

/** 词 / 字符粒度对比，返回可直接内联渲染的片段序列。 */
export function compareTextInline(
  left: string,
  right: string,
  granularity: InlineGranularity,
): InlineDiffResult {
  if (!left && !right) {
    return { parts: [], stats: { added: 0, removed: 0, unchanged: 0 } };
  }
  const changes =
    granularity === 'word' ? diffWordsWithSpace(left, right) : diffChars(left, right);

  const stats = { added: 0, removed: 0, unchanged: 0 };
  const parts: InlineDiffPart[] = changes.map((change) => {
    const added = change.added === true;
    const removed = change.removed === true;
    const tokens = granularity === 'char' ? change.value.length : change.value.split(/\s+/).filter(Boolean).length;
    if (added) stats.added += tokens;
    else if (removed) stats.removed += tokens;
    else stats.unchanged += tokens;
    return { value: change.value, added, removed };
  });

  return { parts, stats };
}
