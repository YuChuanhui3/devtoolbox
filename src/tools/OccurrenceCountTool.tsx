import { useMemo, useState } from 'react';
import { ListOrdered } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { InputPanel } from '@/components/tool/EditorPanels';
import { ActionBar, ClearButton, CopyButton, DownloadButton, SampleButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { splitLines } from '@/lib/text';
import { SAMPLE_REGEX_TEXT } from '@/data/samples';

type Mode = 'lines' | 'words';

// 比较器会被调用 O(n log n) 次，每次 localeCompare 都要解析一次 locale；复用 Collator 实例。
const zhCollator = new Intl.Collator('zh-CN');

function countOccurrences(text: string, mode: Mode, ignoreCase: boolean, ignoreEmpty: boolean) {
  const tokens =
    mode === 'lines'
      ? splitLines(text)
      : (text.match(/[A-Za-z0-9_'-]+|[一-龥]/g) ?? []);

  const normalized = tokens
    .map((token) => (ignoreCase ? token.toLowerCase() : token))
    .filter((token) => (ignoreEmpty ? token.trim() !== '' : true));

  const counter = new Map<string, number>();
  for (const token of normalized) {
    counter.set(token, (counter.get(token) ?? 0) + 1);
  }

  return {
    total: normalized.length,
    entries: Array.from(counter.entries())
      .map(([key, count]) => ({ key, count, ratio: normalized.length > 0 ? count / normalized.length : 0 }))
      .sort((a, b) => b.count - a.count || zhCollator.compare(a.key, b.key)),
  };
}

export default function OccurrenceCountTool() {
  const { t } = useI18n();
  const [input, setInput] = useState(SAMPLE_REGEX_TEXT);
  const [mode, setMode] = useState<Mode>('words');
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [ignoreEmpty, setIgnoreEmpty] = useState(true);
  const [top, setTop] = useState('50');

  const result = useMemo(
    () => countOccurrences(input, mode, ignoreCase, ignoreEmpty),
    [input, mode, ignoreCase, ignoreEmpty],
  );

  const visible = top === 'all' ? result.entries : result.entries.slice(0, Number(top));
  const maxCount = result.entries[0]?.count ?? 1;
  const outputText = visible.map((entry) => `${entry.count}\t${entry.key}`).join('\n');

  return (
    <div className="space-y-4">
      <ActionBar>
        <span className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-3">
          <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '按出现次数降序统计', en: 'Ranked by occurrence count' })}
        </span>
        <Select
          value={mode}
          onChange={(event) => setMode(event.target.value as Mode)}
          aria-label={t({ zh: '统计模式', en: 'Counting mode' })}
          className="h-8 text-xs"
          wrapperClassName="w-28"
        >
          <option value="words">{t({ zh: '按单词', en: 'By word' })}</option>
          <option value="lines">{t({ zh: '按行', en: 'By line' })}</option>
        </Select>
        <Checkbox checked={ignoreCase} onChange={setIgnoreCase} label={t({ zh: '忽略大小写', en: 'Ignore case' })} className="text-xs" />
        <Checkbox checked={ignoreEmpty} onChange={setIgnoreEmpty} label={t({ zh: '忽略空值', en: 'Ignore empty' })} className="text-xs" />
        <Select
          value={top}
          onChange={(event) => setTop(event.target.value)}
          aria-label={t({ zh: '展示数量', en: 'Display count' })}
          className="h-8 text-xs"
          wrapperClassName="w-24"
        >
          <option value="10">{t({ zh: '前 10', en: 'Top 10' })}</option>
          <option value="20">{t({ zh: '前 20', en: 'Top 20' })}</option>
          <option value="50">{t({ zh: '前 50', en: 'Top 50' })}</option>
          <option value="all">{t({ zh: '全部', en: 'All' })}</option>
        </Select>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton onClick={() => setInput(SAMPLE_REGEX_TEXT)} />
          <ClearButton onClick={() => setInput('')} />
          <CopyButton text={outputText} label={{ zh: '复制统计', en: 'Copy stats' }} />
          <DownloadButton filename="occurrences.txt" content={outputText} />
        </div>
      </ActionBar>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <InputPanel
          label={{ zh: '文本内容', en: 'Text content' }}
          value={input}
          onChange={setInput}
          placeholder={{ zh: '输入需要统计的文本…', en: 'Enter the text to count…' }}
          minHeight={320}
        />

        <Panel
          title={t({ zh: '出现次数', en: 'Occurrences' })}
          subtitle={t({
            zh: `共 ${result.total} 个${mode === 'words' ? '单词' : '行'}，${result.entries.length} 种`,
            en: `${result.total} ${mode === 'words' ? 'words' : 'lines'} total, ${result.entries.length} unique`,
          })}
          bodyClassName="p-0"
        >
          {visible.length === 0 ? (
            <div className="flex min-h-[320px] items-center justify-center px-4 text-xs text-ink-3">
              {t({ zh: '输入文本后展示统计结果', en: 'Stats will appear after you enter text' })}
            </div>
          ) : (
            <ul className="code-scroll max-h-[520px] divide-y divide-line overflow-auto">
              {visible.map((entry, index) => (
                <li key={entry.key} className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-6 shrink-0 text-right font-mono text-[11px] text-ink-3">
                      {index + 1}
                    </span>
                    <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink">
                      {entry.key || t({ zh: '(空)', en: '(empty)' })}
                    </code>
                    <span className="shrink-0 font-mono text-xs font-semibold text-accent-strong">
                      {entry.count}
                    </span>
                    <span className="w-12 shrink-0 text-right font-mono text-[10px] text-ink-3">
                      {(entry.ratio * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="ml-9 mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-accent/70 transition-all duration-500 ease-in-out"
                      style={{ width: `${(entry.count / maxCount) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
