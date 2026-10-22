import { useState } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import { countLines, splitLines } from '@/lib/text';
import { SAMPLE_MULTILINE } from '@/data/samples';

interface Options {
  ignoreEmpty: boolean;
  trim: boolean;
  ignoreCase: boolean;
  keepLast: boolean;
}

const DEFAULT: Options = { ignoreEmpty: true, trim: true, ignoreCase: false, keepLast: false };

function dedupe(input: string, options: Options): string {
  const lines = splitLines(input);
  const normalized = options.trim ? lines.map((line) => line.trim()) : lines;
  const candidates = options.ignoreEmpty
    ? normalized.filter((line) => line.trim() !== '')
    : normalized;

  const seen = new Set<string>();
  const result: string[] = [];

  if (options.keepLast) {
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const line = candidates[index];
      const key = options.ignoreCase ? line.toLowerCase() : line;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(line);
    }
    result.reverse();
    return result.join('\n');
  }

  for (const line of candidates) {
    const key = options.ignoreCase ? line.toLowerCase() : line;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }
  return result.join('\n');
}

export default function TextDedupeTool() {
  const { t } = useI18n();
  const [options, setOptions] = useState<Options>(DEFAULT);
  const update = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  return (
    <TransformTool
      transform={(input) => dedupe(input, options)}
      sample={SAMPLE_MULTILINE}
      inputLabel={{ zh: '原始文本', en: 'Source text' }}
      outputLabel={{ zh: '去重结果', en: 'Deduped output' }}
      inputPlaceholder={{ zh: '每行一条内容，重复行会被移除', en: 'One item per line; duplicate lines are removed' }}
      outputFilename="deduped.txt"
      live
      liveKey={`${options.ignoreEmpty}|${options.trim}|${options.ignoreCase}|${options.keepLast}`}
      showSwap={false}
      successMessage={{ zh: '去重完成', en: 'Deduped' }}
      options={
        <>
          <Checkbox checked={options.ignoreEmpty} onChange={(value) => update('ignoreEmpty', value)} label={t({ zh: '忽略空行', en: 'Ignore empty lines' })} className="text-xs" />
          <Checkbox checked={options.trim} onChange={(value) => update('trim', value)} label={t({ zh: '忽略前后空格', en: 'Trim whitespace' })} className="text-xs" />
          <Checkbox checked={options.ignoreCase} onChange={(value) => update('ignoreCase', value)} label={t({ zh: '忽略大小写', en: 'Ignore case' })} className="text-xs" />
          <Checkbox checked={options.keepLast} onChange={(value) => update('keepLast', value)} label={t({ zh: '保留最后一次出现', en: 'Keep last occurrence' })} className="text-xs" />
        </>
      }
      renderSummary={(input, output) => {
        const original = countLines(input);
        const unique = countLines(output);
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
            <span>{t({ zh: '原始行数', en: 'Original lines' })} <span className="font-semibold text-ink-2">{original}</span></span>
            <span>{t({ zh: '去重后', en: 'After dedupe' })} <span className="font-semibold text-ink-2">{unique}</span></span>
            <span>{t({ zh: '移除', en: 'Removed' })} <span className="font-semibold text-danger">{Math.max(0, original - unique)}</span></span>
          </div>
        );
      }}
    />
  );
}
