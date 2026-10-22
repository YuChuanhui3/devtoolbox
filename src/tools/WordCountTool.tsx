import { useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { InputPanel } from '@/components/tool/EditorPanels';
import { ActionBar, ClearButton, CopyButton, DownloadButton, SampleButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { countTextStats } from '@/lib/text';

const SAMPLE = `DevToolbox 是一个开发者在线工具箱。

它提供 JSON 格式化、Base64 编解码、时间戳转换等 40 多个常用工具。
All tools run locally in your browser.`;

export default function WordCountTool() {
  const { t } = useI18n();
  const [input, setInput] = useState(SAMPLE);
  const stats = useMemo(() => countTextStats(input), [input]);

  const rows: Array<{ label: L10n; value: number; hint: L10n }> = [
    { label: { zh: '总字符数', en: 'Total characters' }, value: stats.chars, hint: { zh: '包含空格与换行', en: 'Includes spaces and line breaks' } },
    { label: { zh: '不含空格', en: 'Without spaces' }, value: stats.charsNoSpace, hint: { zh: '去除所有空白字符', en: 'All whitespace removed' } },
    { label: { zh: '中文字符', en: 'Chinese characters' }, value: stats.chinese, hint: { zh: '汉字数量', en: 'CJK ideograph count' } },
    { label: { zh: '英文字母', en: 'Letters' }, value: stats.letters, hint: { zh: 'A-Z / a-z', en: 'A-Z / a-z' } },
    { label: { zh: '数字数量', en: 'Digits' }, value: stats.digits, hint: { zh: '0-9', en: '0-9' } },
    { label: { zh: '单词数', en: 'Words' }, value: stats.words, hint: { zh: '英文单词 + 中文按字计', en: 'English words + Chinese per character' } },
    { label: { zh: '行数', en: 'Lines' }, value: stats.lines, hint: { zh: '按换行符统计', en: 'Counted by line breaks' } },
    { label: { zh: '段落数', en: 'Paragraphs' }, value: stats.paragraphs, hint: { zh: '以空行分隔', en: 'Separated by blank lines' } },
    { label: { zh: 'UTF-8 字节', en: 'UTF-8 bytes' }, value: stats.bytes, hint: { zh: '实际传输大小', en: 'Actual transfer size' } },
  ];

  const summary = rows.map((row) => `${t(row.label)}: ${row.value}`).join('\n');

  return (
    <div className="space-y-4">
      <ActionBar>
        <span className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-3">
          <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '输入时实时统计', en: 'Live counting as you type' })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton onClick={() => setInput(SAMPLE)} />
          <ClearButton onClick={() => setInput('')} />
          <CopyButton text={summary} label={{ zh: '复制统计', en: 'Copy stats' }} />
          <DownloadButton filename="text-stats.txt" content={summary} />
        </div>
      </ActionBar>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <InputPanel
          label={{ zh: '文本内容', en: 'Text content' }}
          value={input}
          onChange={setInput}
          placeholder={{ zh: '输入或粘贴文本，右侧实时统计', en: 'Type or paste text; stats update on the right' }}
          minHeight={320}
        />

        <Panel title={t({ zh: '统计结果', en: 'Statistics' })} subtitle={input ? t({ zh: '实时更新', en: 'Updated live' }) : t({ zh: '等待输入', en: 'Waiting for input' })} bodyClassName="p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
            {rows.map((row) => (
              <div
                key={t(row.label)}
                className="rounded-xl border border-line bg-surface-2/40 p-3 transition-colors duration-300 hover:border-accent/30"
              >
                <p className="text-[11px] text-ink-3">{t(row.label)}</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">{row.value}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-ink-3">{t(row.hint)}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] leading-5 text-ink-3">
            {t({
              zh: '单词数：英文按空格分词，中文按单字计数。',
              en: 'Word count: English splits on spaces; Chinese counts per character.',
            })}
          </p>
        </Panel>
      </div>
    </div>
  );
}
