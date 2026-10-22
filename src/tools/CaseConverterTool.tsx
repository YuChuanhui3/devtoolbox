import { useMemo, useState } from 'react';
import { CaseUpper } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { InputPanel, StatsBar } from '@/components/tool/EditorPanels';
import { ActionBar, ClearButton, CopyButton, CopyIconButton, DownloadButton, SampleButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { countTextStats } from '@/lib/text';

const SAMPLE = 'hello World, this is DevToolbox';

function splitWords(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9一-龥]+/)
    .filter(Boolean);
}

const capitalize = (word: string) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word);

function buildVariants(input: string): Array<{ label: string; value: string }> {
  const words = splitWords(input);
  const lines = input.split('\n');

  const upper = input.toLocaleUpperCase();
  const lower = input.toLocaleLowerCase();
  const title = lines
    .map((line) => splitWords(line).map((word) => capitalize(word.toLowerCase())).join(' '))
    .join('\n');
  const sentence = lines
    .map((line) => {
      const value = line.toLocaleLowerCase();
      return value.charAt(0).toUpperCase() + value.slice(1);
    })
    .join('\n');

  const camel = words
    .map((word, index) => (index === 0 ? word.toLowerCase() : capitalize(word.toLowerCase())))
    .join('');
  const pascal = words.map((word) => capitalize(word.toLowerCase())).join('');
  const snake = words.map((word) => word.toLowerCase()).join('_');
  const kebab = words.map((word) => word.toLowerCase()).join('-');
  const constant = words.map((word) => word.toUpperCase()).join('_');

  return [
    { label: 'UPPERCASE', value: upper },
    { label: 'lowercase', value: lower },
    { label: 'Title Case', value: title },
    { label: 'Sentence case', value: sentence },
    { label: 'camelCase', value: camel },
    { label: 'PascalCase', value: pascal },
    { label: 'snake_case', value: snake },
    { label: 'kebab-case', value: kebab },
    { label: 'CONSTANT_CASE', value: constant },
  ];
}

export default function CaseConverterTool() {
  const { t } = useI18n();
  const [input, setInput] = useState(SAMPLE);

  const variants = useMemo(() => buildVariants(input), [input]);
  const stats = useMemo(() => countTextStats(input), [input]);
  const allText = variants.map((variant) => `${variant.label}:\n${variant.value}`).join('\n\n');

  return (
    <div className="space-y-4">
      <ActionBar>
        <span className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-3">
          <CaseUpper className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '实时生成 9 种命名风格', en: '9 naming styles generated live' })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton onClick={() => setInput(SAMPLE)} />
          <ClearButton onClick={() => setInput('')} />
          <CopyButton text={allText} label={{ zh: '复制全部', en: 'Copy all' }} />
          <DownloadButton filename="case-variants.txt" content={allText} />
        </div>
      </ActionBar>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <InputPanel
          label={{ zh: '原始文本', en: 'Source text' }}
          value={input}
          onChange={setInput}
          placeholder={{ zh: '输入需要转换的单词或句子，例如 hello world', en: 'Enter words or sentences to convert, e.g. hello world' }}
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '字符', en: 'Characters' }), value: stats.chars },
                { label: t({ zh: '单词', en: 'Words' }), value: stats.words },
                { label: t({ zh: '行数', en: 'Lines' }), value: stats.lines },
              ]}
            />
          }
        />

        <Panel title={t({ zh: '转换结果', en: 'Converted variants' })} subtitle={t({ zh: '点击右侧图标复制对应风格', en: 'Click the icon on the right to copy a style' })} bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {variants.map((variant) => (
              <li key={variant.label} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-28 shrink-0 font-mono text-[11px] text-ink-3">{variant.label}</span>
                <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink">
                  {variant.value || <span className="text-ink-3">{t({ zh: '（空）', en: '(empty)' })}</span>}
                </code>
                <CopyIconButton text={variant.value} label={{ zh: `复制 ${variant.label}`, en: `Copy ${variant.label}` }} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: 'camelCase / snake_case 等命名风格会将空白、连字符与换行视为单词分隔符，中文按连续字符保留。',
          en: 'Styles like camelCase / snake_case treat whitespace, hyphens, and line breaks as word separators; Chinese text is kept as contiguous characters.',
        })}
      </p>
    </div>
  );
}
