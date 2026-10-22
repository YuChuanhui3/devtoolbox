import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { Checkbox } from '@/components/ui/Checkbox';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';

type Mode = 'escape' | 'unescape';

const SAMPLE = 'Hello "DevToolbox"\n第二行内容';
const UNESCAPE_SAMPLE = 'Hello \\"DevToolbox\\"\\n第二行内容';

function escapeString(text: string, escapeSingle: boolean, escapeSlash: boolean): string {
  let result = text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\f/g, '\\f')
    .replace(/\v/g, '\\v')
    .replace(/[\u0000-\u001f]/g, (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`);

  if (escapeSingle) result = result.replace(/'/g, "\\'");
  if (escapeSlash) result = result.replace(/\//g, '\\/');
  return result;
}

function unescapeString(text: string): string {
  return text.replace(
    /\\(\\|"|'|\/|b|f|n|r|t|v|0|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})/g,
    (_match, code: string) => {
      switch (code) {
        case 'b':
          return '\b';
        case 'f':
          return '\f';
        case 'n':
          return '\n';
        case 'r':
          return '\r';
        case 't':
          return '\t';
        case 'v':
          return '\v';
        case '0':
          return '\0';
        default:
          break;
      }
      if (code.startsWith('x')) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 16));
      }
      if (code.startsWith('u')) {
        return String.fromCharCode(Number.parseInt(code.slice(1), 16));
      }
      return code;
    },
  );
}

export default function JsEscapeTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('escape');
  const [escapeSingle, setEscapeSingle] = useState(false);
  const [escapeSlash, setEscapeSlash] = useState(false);

  const isEscape = mode === 'escape';

  return (
    <TransformTool
      transform={(input) =>
        isEscape ? escapeString(input, escapeSingle, escapeSlash) : unescapeString(input)
      }
      sample={isEscape ? SAMPLE : UNESCAPE_SAMPLE}
      inputLabel={isEscape ? { zh: '原始字符串', en: 'Raw string' } : { zh: '转义字符串', en: 'Escaped string' }}
      outputLabel={isEscape ? { zh: '转义结果', en: 'Escaped output' } : { zh: '还原结果', en: 'Unescaped output' }}
      inputPlaceholder={
        isEscape ? { zh: '输入需要转义的字符串内容（不包含外层引号）', en: 'Enter the string to escape (without surrounding quotes)' } : { zh: '输入转义后的内容，例如 Hello\\nWorld', en: 'Enter escaped content, e.g. Hello\\nWorld' }
      }
      outputFilename={isEscape ? 'escaped.txt' : 'unescaped.txt'}
      successMessage={isEscape ? { zh: '转义完成', en: 'Escaped' } : { zh: '反转义完成', en: 'Unescaped' }}
      onSwap={() => setMode(isEscape ? 'unescape' : 'escape')}
      options={
        <>
          <Segmented
            value={mode}
            onChange={setMode}
            ariaLabel={t({ zh: 'JS 转义模式', en: 'JS escape mode' })}
            options={[
              { value: 'escape', label: t({ zh: '转义', en: 'Escape' }) },
              { value: 'unescape', label: t({ zh: '反转义', en: 'Unescape' }) },
            ]}
          />
          {isEscape ? (
            <>
              <Checkbox
                checked={escapeSingle}
                onChange={setEscapeSingle}
                label={t({ zh: '转义单引号', en: 'Escape single quotes' })}
                className="text-xs"
              />
              <Checkbox
                checked={escapeSlash}
                onChange={setEscapeSlash}
                label={t({ zh: '转义 /', en: 'Escape /' })}
                className="text-xs"
              />
            </>
          ) : null}
        </>
      }
      helpText={t({
        zh: '支持 \\n、\\t、\\xXX、\\uXXXX 等常见 JavaScript 转义序列；反转义遇到非法序列时原样保留。',
        en: 'Supports common JavaScript escape sequences such as \\n, \\t, \\xXX, and \\uXXXX; invalid sequences are kept as-is when unescaping.',
      })}
    />
  );
}
