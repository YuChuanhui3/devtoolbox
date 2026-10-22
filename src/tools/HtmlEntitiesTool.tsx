import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { Checkbox } from '@/components/ui/Checkbox';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';

type Mode = 'escape' | 'unescape';

const ESCAPE_SAMPLE = '<div class="title">Hello & "世界"</div>';
const UNESCAPE_SAMPLE = '&lt;div class=&quot;title&quot;&gt;Hello &amp; &quot;世界&quot;&lt;/div&gt;';

const ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtmlEntities(input: string, escapeNonAscii: boolean): string {
  let result = input.replace(/[&<>"']/g, (char) => ENTITY_MAP[char] ?? char);
  if (escapeNonAscii) {
    result = result.replace(/[^\x00-\x7f]/g, (char) => `&#${char.codePointAt(0)};`);
  }
  return result;
}

function unescapeHtmlEntities(input: string): string {
  if (!input) return '';
  const doc = new DOMParser().parseFromString(input, 'text/html');
  return doc.documentElement.textContent ?? '';
}

export default function HtmlEntitiesTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('escape');
  const [escapeNonAscii, setEscapeNonAscii] = useState(false);

  const isEscape = mode === 'escape';

  return (
    <TransformTool
      transform={(input) =>
        isEscape ? escapeHtmlEntities(input, escapeNonAscii) : unescapeHtmlEntities(input)
      }
      sample={isEscape ? ESCAPE_SAMPLE : UNESCAPE_SAMPLE}
      inputLabel={isEscape ? { zh: '原始文本 / HTML', en: 'Source text / HTML' } : { zh: 'HTML 实体文本', en: 'HTML entity text' }}
      outputLabel={isEscape ? { zh: '转义结果', en: 'Escaped output' } : { zh: '还原结果', en: 'Unescaped output' }}
      inputPlaceholder={
        isEscape ? { zh: '输入包含 & < > " \' 的文本或 HTML', en: 'Enter text or HTML containing & < > " \'' } : { zh: '输入包含 &amp;、&#39; 等实体的文本', en: 'Enter text containing entities like &amp; and &#39;' }
      }
      outputFilename={isEscape ? 'html-escaped.txt' : 'html-unescaped.txt'}
      live
      liveKey={`${mode}|${escapeNonAscii}`}
      successMessage={isEscape ? { zh: '转义完成', en: 'Escaped' } : { zh: '还原完成', en: 'Unescaped' }}
      onSwap={() => setMode(isEscape ? 'unescape' : 'escape')}
      options={
        <>
          <Segmented
            value={mode}
            onChange={setMode}
            ariaLabel={t({ zh: 'HTML 实体模式', en: 'HTML entity mode' })}
            options={[
              { value: 'escape', label: t({ zh: '转义', en: 'Escape' }) },
              { value: 'unescape', label: t({ zh: '反转义', en: 'Unescape' }) },
            ]}
          />
          {isEscape ? (
            <Checkbox
              checked={escapeNonAscii}
              onChange={setEscapeNonAscii}
              label={t({ zh: '中文转数字实体', en: 'Encode non-ASCII as numeric entities' })}
              className="text-xs"
            />
          ) : null}
        </>
      }
      helpText={t({
        zh: '转义 & < > \' 五个必要字符；反转义支持命名实体与数字实体，解析过程不会执行任何脚本。',
        en: 'Escapes the five required characters & < > " \'; unescaping supports named and numeric entities without executing any script.',
      })}
    />
  );
}
