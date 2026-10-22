import { useState } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import { countTextStats } from '@/lib/text';
import { SAMPLE_HTML } from '@/data/samples';

interface Options {
  keepLineBreaks: boolean;
  collapseWhitespace: boolean;
  keepLinks: boolean;
}

const BLOCK_SELECTOR = 'p,div,li,h1,h2,h3,h4,h5,h6,tr,blockquote,pre,section,article,header,footer';

function htmlToText(html: string, options: Options): string {
  if (!html.trim()) return '';

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc
    .querySelectorAll('script,style,noscript,template,iframe,object,embed,svg,canvas')
    .forEach((element) => element.remove());

  if (options.keepLinks) {
    doc.querySelectorAll('a[href]').forEach((anchor) => {
      const href = anchor.getAttribute('href') ?? '';
      anchor.append(` (${href})`);
    });
  }

  doc.querySelectorAll('br').forEach((element) => element.replaceWith('\n'));
  doc.querySelectorAll(BLOCK_SELECTOR).forEach((element) => element.append('\n'));

  let text = doc.body.textContent ?? '';
  text = text.replace(/ /g, ' ');

  if (options.collapseWhitespace) {
    text = text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n');
  }

  if (options.keepLineBreaks) {
    text = text.replace(/\n{3,}/g, '\n\n').trim();
  } else {
    text = text.replace(/\s+/g, ' ').trim();
  }

  return text;
}

export default function HtmlCleanerTool() {
  const { t } = useI18n();
  const [options, setOptions] = useState<Options>({
    keepLineBreaks: true,
    collapseWhitespace: true,
    keepLinks: false,
  });

  const update = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  return (
    <TransformTool
      transform={(input) => htmlToText(input, options)}
      sample={SAMPLE_HTML}
      inputLabel={{ zh: 'HTML 输入', en: 'HTML input' }}
      outputLabel={{ zh: '纯文本结果', en: 'Plain text output' }}
      inputPlaceholder={{ zh: '粘贴 HTML 内容，脚本与样式会被移除', en: 'Paste HTML; scripts and styles are removed' }}
      outputFilename="clean-text.txt"
      live
      liveKey={`${options.keepLineBreaks}|${options.collapseWhitespace}|${options.keepLinks}`}
      showSwap={false}
      successMessage={{ zh: '清理完成', en: 'Cleaned' }}
      options={
        <>
          <Checkbox
            checked={options.keepLineBreaks}
            onChange={(value) => update('keepLineBreaks', value)}
            label={t({ zh: '保留换行', en: 'Keep line breaks' })}
            className="text-xs"
          />
          <Checkbox
            checked={options.collapseWhitespace}
            onChange={(value) => update('collapseWhitespace', value)}
            label={t({ zh: '合并多余空格', en: 'Collapse whitespace' })}
            className="text-xs"
          />
          <Checkbox
            checked={options.keepLinks}
            onChange={(value) => update('keepLinks', value)}
            label={t({ zh: '保留链接地址', en: 'Keep link URLs' })}
            className="text-xs"
          />
        </>
      }
      renderSummary={(input, output) => {
        const inputStats = countTextStats(input);
        const outputStats = countTextStats(output);
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
            <span>{t({ zh: '原始字符', en: 'Input characters' })} <span className="font-semibold text-ink-2">{inputStats.chars}</span></span>
            <span>{t({ zh: '纯文本字符', en: 'Text characters' })} <span className="font-semibold text-ink-2">{outputStats.chars}</span></span>
            <span>{t({ zh: '输出行数', en: 'Output lines' })} <span className="font-semibold text-ink-2">{outputStats.lines}</span></span>
            <span className="text-ok">{t({ zh: 'script / style / iframe 已移除', en: 'script / style / iframe removed' })}</span>
          </div>
        );
      }}
    />
  );
}
