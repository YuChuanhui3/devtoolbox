import { useMemo, useState } from 'react';
import { Regex, SearchCode } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ActionBar, ClearButton, CopyButton, CopyIconButton, DownloadButton, SampleButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { InputPanel } from '@/components/tool/EditorPanels';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { REGEX_FLAGS, REGEX_TEMPLATES } from '@/data/regexTemplates';
import { SAMPLE_REGEX_PATTERN, SAMPLE_REGEX_TEXT } from '@/data/samples';
import { escapeHtml } from '@/lib/text';
import { errorHint } from '@/lib/errors';
import { cn } from '@/lib/cn';

interface RegexMatch {
  value: string;
  index: number;
  groups: string[];
  namedGroups?: Record<string, string>;
}

interface RegexAnalysis {
  matches: RegexMatch[];
  error: Localized | null;
  hint?: Localized;
  highlightHtml: string;
  effectiveFlags: string;
}

function friendlyRegexError(error: unknown): { message: L10n; hint?: Localized } {
  const raw = error instanceof Error ? error.message : '';
  const lower = raw.toLowerCase();

  if (lower.includes('unterminated group') || lower.includes('unterminated parenthetical')) {
    return { message: { zh: '正则表达式语法错误：括号未闭合', en: 'Regex syntax error: unclosed group' }, hint: { zh: '请检查 ( 与 ) 是否成对出现。', en: 'Check that ( and ) appear in pairs.' } };
  }
  if (lower.includes('unterminated character class')) {
    return { message: { zh: '正则表达式语法错误：字符类未闭合', en: 'Regex syntax error: unclosed character class' }, hint: { zh: '请检查 [ 与 ] 是否成对出现。', en: 'Check that [ and ] appear in pairs.' } };
  }
  if (lower.includes('nothing to repeat')) {
    return { message: { zh: '正则表达式语法错误：量词没有作用对象', en: 'Regex syntax error: quantifier has nothing before it' }, hint: { zh: '请检查 *、+、? 前是否有可重复的字符或分组。', en: 'Check that a repeatable character or group precedes *, +, ?.' } };
  }
  if (lower.includes('invalid escape')) {
    return { message: { zh: '正则表达式语法错误：非法转义', en: 'Regex syntax error: invalid escape' }, hint: { zh: '请检查反斜杠后的字符是否合法。', en: 'Check the character after the backslash.' } };
  }
  if (lower.includes('invalid group')) {
    return { message: { zh: '正则表达式语法错误：分组语法不正确', en: 'Regex syntax error: invalid group syntax' }, hint: { zh: '请检查 (?:)、(?<name>) 等分组写法。', en: 'Check group forms such as (?:) and (?<name>).' } };
  }
  if (lower.includes('invalid flags')) {
    return { message: { zh: '正则表达式错误：标志位不合法', en: 'Regex error: invalid flags' }, hint: { zh: '请检查 g、i、m、s、u 的组合。', en: 'Check the combination of g, i, m, s, u.' } };
  }
  return { message: { zh: '正则表达式语法错误', en: 'Regex syntax error' }, hint: errorHint(error, raw) };
}

function analyze(pattern: string, flags: string, text: string): RegexAnalysis {
  const effectiveFlags = flags.includes('g') ? flags : `${flags}g`;

  if (!pattern) {
    return { matches: [], error: null, highlightHtml: escapeHtml(text), effectiveFlags };
  }

  try {
    const regex = new RegExp(pattern, effectiveFlags);
    const matches = Array.from(text.matchAll(regex)).map((match) => ({
      value: match[0],
      index: match.index ?? 0,
      groups: match.slice(1).map((group) => group ?? ''),
      namedGroups: match.groups ? { ...match.groups } as Record<string, string> : undefined,
    }));

    let cursor = 0;
    let html = '';
    for (const match of matches) {
      html += escapeHtml(text.slice(cursor, match.index));
      if (match.value) {
        html += `<mark class="rounded-lg bg-accent-soft px-0.5 text-accent-strong">${escapeHtml(match.value)}</mark>`;
      }
      cursor = match.index + match.value.length;
    }
    html += escapeHtml(text.slice(cursor));

    return { matches, error: null, highlightHtml: html, effectiveFlags };
  } catch (error) {
    const friendly = friendlyRegexError(error);
    return {
      matches: [],
      error: friendly.message,
      hint: friendly.hint,
      highlightHtml: escapeHtml(text),
      effectiveFlags,
    };
  }
}

export default function RegexTool() {
  const { t } = useI18n();
  const [pattern, setPattern] = useState(SAMPLE_REGEX_PATTERN);
  const [flags, setFlags] = useState('g');
  const [text, setText] = useState(SAMPLE_REGEX_TEXT);

  const analysis = useMemo(() => analyze(pattern, flags, text), [pattern, flags, text]);

  const toggleFlag = (flag: string) => {
    setFlags((current) =>
      current.includes(flag) ? current.replace(flag, '') : `${current}${flag}`,
    );
  };

  const matchText = useMemo(() => analysis.matches.map((match) => match.value).join('\n'), [analysis]);
  const matchJson = useMemo(() => JSON.stringify(analysis.matches, null, 2), [analysis]);

  return (
    <div className="space-y-4">
      <ActionBar>
        <span className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-3">
          <Regex className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '实时匹配', en: 'Live matching' })}
        </span>
        <Badge tone={analysis.matches.length > 0 ? 'accent' : 'neutral'}>
          {t({ zh: `${analysis.matches.length} 处匹配`, en: `${analysis.matches.length} matches` })}
        </Badge>
        <span className="hidden text-[11px] text-ink-3 sm:inline">
          /{pattern || '…'}/{analysis.effectiveFlags}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton
            onClick={() => {
              setPattern(SAMPLE_REGEX_PATTERN);
              setFlags('g');
              setText(SAMPLE_REGEX_TEXT);
            }}
          />
          <ClearButton
            onClick={() => {
              setPattern('');
              setFlags('g');
              setText('');
            }}
          />
          <CopyButton text={matchText} label={{ zh: '复制匹配值', en: 'Copy matches' }} />
          <DownloadButton filename="regex-matches.json" content={matchJson} mime="application/json;charset=utf-8" />
        </div>
      </ActionBar>

      <Panel title={t({ zh: '正则表达式', en: 'Regex' })} bodyClassName="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <span className="select-none font-mono text-lg text-ink-3">/</span>
          <Input
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder={t({ zh: '例如 \\d{3}-?\\d{4}-?\\d{4}', en: 'e.g. \\d{3}-?\\d{4}-?\\d{4}' })}
            aria-label={t({ zh: '正则表达式', en: 'Regex' })}
            mono
            className="min-w-0 flex-1"
          />
          <span className="select-none font-mono text-sm text-ink-2">/{analysis.effectiveFlags}</span>
          <CopyIconButton text={`/${pattern}/${analysis.effectiveFlags}`} label={{ zh: '复制正则表达式', en: 'Copy regex' }} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-ink-3">{t({ zh: '标志位', en: 'Flags' })}</span>
          {REGEX_FLAGS.map((flag) => {
            const checked = flags.includes(flag.value);
            return (
              <label
                key={flag.value}
                title={t(flag.description)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-300',
                  checked
                    ? 'border-accent/30 bg-accent-soft text-accent-strong'
                    : 'border-line bg-surface text-ink-3 hover:text-ink',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleFlag(flag.value)}
                  className="sr-only"
                />
                <span className="font-mono">{flag.label}</span>
                <span className="hidden text-[10px] sm:inline">{t(flag.description)}</span>
              </label>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-ink-3">{t({ zh: '常用模板', en: 'Common templates' })}</span>
          {REGEX_TEMPLATES.map((template) => (
            <button
              key={t(template.label)}
              type="button"
              title={t(template.description)}
              onClick={() => {
                setPattern(template.pattern);
                setFlags(template.flags);
              }}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] transition-all duration-300',
                pattern === template.pattern
                  ? 'border-accent/40 bg-accent-soft text-accent-strong'
                  : 'border-line bg-surface text-ink-2 hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent-strong',
              )}
            >
              {t(template.label)}
            </button>
          ))}
        </div>
      </Panel>

      {analysis.error ? <ToolAlert tone="error" title={analysis.error} hint={analysis.hint} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          label={{ zh: '测试文本', en: 'Test text' }}
          value={text}
          onChange={setText}
          placeholder={{ zh: '输入需要匹配的文本，结果实时更新', en: 'Enter text to match; results update live' }}
          minHeight={200}
        />

        <Panel
          title={t({ zh: '匹配结果', en: 'Matches' })}
          subtitle={
            analysis.matches.length > 0
              ? t({ zh: `${analysis.matches.length} 处`, en: `${analysis.matches.length} hits` })
              : t({ zh: '暂无匹配', en: 'No matches yet' })
          }
          bodyClassName="p-0"
        >
          {analysis.matches.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center px-4 text-xs text-ink-3">
              {analysis.error ? t({ zh: '请先修正正则表达式', en: 'Fix the regex first' }) : t({ zh: '当前没有匹配结果', en: 'No matches right now' })}
            </div>
          ) : (
            <ul className="code-scroll max-h-[360px] divide-y divide-line overflow-auto">
              {analysis.matches.map((match, index) => (
                <li key={`${match.index}-${index}`} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-3">{t({ zh: `匹配 ${index + 1}`, en: `Match ${index + 1}` })}</span>
                    <code className="min-w-0 flex-1 break-all rounded-lg bg-accent-soft px-1.5 py-0.5 font-mono text-[12px] text-accent-strong">
                      {match.value || t({ zh: '(空匹配)', en: '(empty match)' })}
                    </code>
                    <span className="shrink-0 text-[10px] text-ink-3">{t({ zh: `索引 ${match.index}`, en: `Index ${match.index}` })}</span>
                    <CopyIconButton text={match.value} label={t({ zh: `复制匹配 ${index + 1}`, en: `Copy match ${index + 1}` })} />
                  </div>
                  {match.groups.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 pl-1">
                      {match.groups.map((group, groupIndex) => (
                        <span
                          key={`${groupIndex}-${group}`}
                          className="rounded-lg border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
                        >
                          ${groupIndex + 1}: {group || t({ zh: '(空)', en: '(empty)' })}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {match.namedGroups ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 pl-1">
                      {Object.entries(match.namedGroups).map(([name, group]) => (
                        <span
                          key={name}
                          className="rounded-lg border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
                        >
                          {name}: {group || t({ zh: '(空)', en: '(empty)' })}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title={t({ zh: '高亮预览', en: 'Highlight preview' })}
        subtitle={t({ zh: '匹配内容会以强调色标记', en: 'Matches are marked with the accent color' })}
        bodyClassName="p-0"
        actions={<SearchCode className="h-4 w-4 text-ink-3" aria-hidden="true" />}
      >
        {text ? (
          <pre
            className="code-scroll max-h-[260px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-6 text-ink"
            dangerouslySetInnerHTML={{ __html: analysis.highlightHtml }}
          />
        ) : (
          <div className="flex min-h-[120px] items-center justify-center text-xs text-ink-3">
            {t({ zh: '输入测试文本后显示高亮预览', en: 'Enter test text to see the highlighted preview' })}
          </div>
        )}
      </Panel>
    </div>
  );
}
