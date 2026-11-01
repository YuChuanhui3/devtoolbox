export interface RawRegexMatch {
  value: string;
  index: number;
  groups: string[];
  namedGroups?: Record<string, string>;
}

export interface RegexMatchRequest {
  pattern: string;
  flags: string;
  text: string;
}

export interface RegexMatchOutcome {
  matches: RawRegexMatch[];
  effectiveFlags: string;
  truncated: boolean;
  timedOut: boolean;
  /** 原始 SyntaxError 文案；由主线程翻译成友好提示。 */
  error?: string;
}

export const MAX_REGEX_MATCHES = 2000;
export const REGEX_MATCH_DEADLINE_MS = 1000;

export function matchRegex(
  { pattern, flags, text }: RegexMatchRequest,
  options: { maxMatches?: number; deadlineMs?: number } = {},
): RegexMatchOutcome {
  const maxMatches = options.maxMatches ?? MAX_REGEX_MATCHES;
  const deadlineMs = options.deadlineMs ?? REGEX_MATCH_DEADLINE_MS;
  const effectiveFlags = flags.includes('g') ? flags : `${flags}g`;
  const base = { effectiveFlags, truncated: false, timedOut: false };

  if (!pattern || !text) return { ...base, matches: [] };

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, effectiveFlags);
  } catch (error) {
    return { ...base, matches: [], error: error instanceof Error ? error.message : String(error) };
  }

  const matches: RawRegexMatch[] = [];
  const deadline = Date.now() + deadlineMs;
  let timedOut = false;

  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const value = match[0];
    matches.push({
      value,
      index: match.index,
      groups: match.slice(1).map((group) => group ?? ''),
      namedGroups: match.groups ? { ...match.groups } : undefined,
    });
    // 零宽匹配不会自动前进，手动挪一格，否则 exec 循环永不退出。
    if (value === '') regex.lastIndex += 1;
    if (matches.length >= maxMatches) break;
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }
  }

  return { matches, effectiveFlags, truncated: matches.length >= maxMatches, timedOut };
}
