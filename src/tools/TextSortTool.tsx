import { useState } from 'react';
import { Shuffle } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import { countLines, splitLines } from '@/lib/text';
import { SAMPLE_MULTILINE } from '@/data/samples';

type Order = 'asc' | 'desc' | 'random';
type Mode = 'text' | 'numeric' | 'length';

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

function sortLines(
  input: string,
  options: { order: Order; mode: Mode; ignoreCase: boolean; removeEmpty: boolean },
): string {
  let lines = splitLines(input);
  if (options.removeEmpty) lines = lines.filter((line) => line.trim() !== '');

  if (options.order === 'random') {
    return shuffle(lines).join('\n');
  }

  const compare = (a: string, b: string): number => {
    if (options.mode === 'length') return a.length - b.length || collator.compare(a, b);
    if (options.mode === 'numeric') {
      const first = Number(a);
      const second = Number(b);
      if (Number.isFinite(first) && Number.isFinite(second)) return first - second;
    }
    if (options.ignoreCase) {
      return a.localeCompare(b, 'zh-CN', { sensitivity: 'base', numeric: true });
    }
    return collator.compare(a, b);
  };

  const sorted = [...lines].sort(compare);
  if (options.order === 'desc') sorted.reverse();
  return sorted.join('\n');
}

export default function TextSortTool() {
  const { t } = useI18n();
  const [order, setOrder] = useState<Order>('asc');
  const [mode, setMode] = useState<Mode>('text');
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [removeEmpty, setRemoveEmpty] = useState(true);
  const [shuffleSeed, setShuffleSeed] = useState(0);

  return (
    <TransformTool
      transform={(input) => sortLines(input, { order, mode, ignoreCase, removeEmpty })}
      sample={SAMPLE_MULTILINE}
      inputLabel={{ zh: '原始文本', en: 'Source text' }}
      outputLabel={{ zh: '排序结果', en: 'Sorted output' }}
      inputPlaceholder={{ zh: '每行一条内容，按行排序', en: 'One item per line; sorted by line' }}
      outputFilename="sorted.txt"
      live
      liveKey={`${order}|${mode}|${ignoreCase}|${removeEmpty}|${shuffleSeed}`}
      showSwap={false}
      successMessage={{ zh: '排序完成', en: 'Sorted' }}
      extraActions={
        order === 'random' ? (
          <Button variant="secondary" size="sm" onClick={() => setShuffleSeed((value) => value + 1)}>
            <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '重新随机', en: 'Reshuffle' })}
          </Button>
        ) : null
      }
      options={
        <>
          <Select
            value={order}
            onChange={(event) => setOrder(event.target.value as Order)}
            aria-label={t({ zh: '排序方向', en: 'Sort direction' })}
            className="h-8 text-xs"
            wrapperClassName="w-24"
          >
            <option value="asc">{t({ zh: '正序', en: 'Ascending' })}</option>
            <option value="desc">{t({ zh: '倒序', en: 'Descending' })}</option>
            <option value="random">{t({ zh: '随机', en: 'Random' })}</option>
          </Select>
          <Select
            value={mode}
            onChange={(event) => setMode(event.target.value as Mode)}
            aria-label={t({ zh: '排序方式', en: 'Sort mode' })}
            className="h-8 text-xs"
            wrapperClassName="w-28"
          >
            <option value="text">{t({ zh: '按文本', en: 'By text' })}</option>
            <option value="numeric">{t({ zh: '按数字', en: 'By number' })}</option>
            <option value="length">{t({ zh: '按长度', en: 'By length' })}</option>
          </Select>
          <Checkbox checked={ignoreCase} onChange={setIgnoreCase} label={t({ zh: '忽略大小写', en: 'Ignore case' })} className="text-xs" />
          <Checkbox checked={removeEmpty} onChange={setRemoveEmpty} label={t({ zh: '移除空行', en: 'Remove empty lines' })} className="text-xs" />
        </>
      }
      renderSummary={(input, output) => (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
          <span>{t({ zh: '原始行数', en: 'Original lines' })} <span className="font-semibold text-ink-2">{countLines(input)}</span></span>
          <span>{t({ zh: '排序后', en: 'After sorting' })} <span className="font-semibold text-ink-2">{countLines(output)}</span></span>
          <span>{t({ zh: '排序方式', en: 'Sort mode' })} <span className="font-semibold text-ink-2">{order === 'asc' ? t({ zh: '正序', en: 'Ascending' }) : order === 'desc' ? t({ zh: '倒序', en: 'Descending' }) : t({ zh: '随机', en: 'Random' })}</span></span>
        </div>
      )}
    />
  );
}
