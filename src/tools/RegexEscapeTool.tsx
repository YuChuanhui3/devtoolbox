import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { Checkbox } from '@/components/ui/Checkbox';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import { escapeRegExp, unescapeRegExp } from '@/lib/text';

type Mode = 'escape' | 'unescape';

const SAMPLE = 'a+b*c?d.e[f]g(h)i{j}k^l$m|n\\o';
const UNESCAPE_SAMPLE = 'a\\+b\\*c\\?d\\.e\\[f\\]g\\(h\\)i\\{j\\}k\\^l\\$m\\|n\\\\o';

export default function RegexEscapeTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('escape');
  const [escapeSlash, setEscapeSlash] = useState(false);

  const isEscape = mode === 'escape';

  return (
    <TransformTool
      transform={(input) => {
        if (!isEscape) return unescapeRegExp(input);
        const escaped = escapeRegExp(input);
        return escapeSlash ? escaped.replace(/\//g, '\\/') : escaped;
      }}
      sample={isEscape ? SAMPLE : UNESCAPE_SAMPLE}
      inputLabel={isEscape ? { zh: '原始文本', en: 'Raw text' } : { zh: '已转义文本', en: 'Escaped text' }}
      outputLabel={isEscape ? { zh: '转义结果', en: 'Escaped output' } : { zh: '还原结果', en: 'Unescaped output' }}
      inputPlaceholder={
        isEscape
          ? { zh: '输入需要作为普通文本匹配的内容', en: 'Enter text to match literally' }
          : { zh: '输入包含反斜杠转义的文本', en: 'Enter text containing backslash escapes' }
      }
      outputFilename={isEscape ? 'regex-escaped.txt' : 'regex-unescaped.txt'}
      successMessage={isEscape ? { zh: '转义完成', en: 'Escaped' } : { zh: '还原完成', en: 'Unescaped' }}
      onSwap={() => setMode(isEscape ? 'unescape' : 'escape')}
      options={
        <>
          <Segmented
            value={mode}
            onChange={setMode}
            ariaLabel={t({ zh: '正则转义模式', en: 'Regex escape mode' })}
            options={[
              { value: 'escape', label: t({ zh: '转义', en: 'Escape' }) },
              { value: 'unescape', label: t({ zh: '还原', en: 'Unescape' }) },
            ]}
          />
          {isEscape ? (
            <Checkbox
              checked={escapeSlash}
              onChange={setEscapeSlash}
              label={t({ zh: '同时转义 /', en: 'Also escape /' })}
              className="text-xs"
            />
          ) : null}
        </>
      }
      helpText={t({
        zh: '转义 . * + ? ^ $ { } ( ) | [ ] \\ 等正则元字符，适合把用户输入拼接到正则中。',
        en: 'Escapes regex metacharacters such as . * + ? ^ $ { } ( ) | [ ] \\ — ideal for embedding user input into a pattern.',
      })}
    />
  );
}
