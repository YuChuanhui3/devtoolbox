import { useMemo } from 'react';
import { Select } from '@/components/ui/Select';
import { CopyButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { canonicalLanguage, highlightCode, highlightCodeAuto, supportedLanguages } from '@/lib/highlight';

export const AUTO_LANGUAGE = 'auto';

const LABELS: Record<string, L10n> = {
  javascript: { zh: 'JavaScript', en: 'JavaScript' },
  typescript: { zh: 'TypeScript', en: 'TypeScript' },
  python: { zh: 'Python', en: 'Python' },
  java: { zh: 'Java', en: 'Java' },
  go: { zh: 'Go', en: 'Go' },
  rust: { zh: 'Rust', en: 'Rust' },
  c: { zh: 'C', en: 'C' },
  cpp: { zh: 'C++', en: 'C++' },
  csharp: { zh: 'C#', en: 'C#' },
  php: { zh: 'PHP', en: 'PHP' },
  ruby: { zh: 'Ruby', en: 'Ruby' },
  swift: { zh: 'Swift', en: 'Swift' },
  kotlin: { zh: 'Kotlin', en: 'Kotlin' },
  sql: { zh: 'SQL', en: 'SQL' },
  bash: { zh: 'Bash', en: 'Bash' },
  shell: { zh: 'Shell 会话', en: 'Shell session' },
  json: { zh: 'JSON', en: 'JSON' },
  yaml: { zh: 'YAML', en: 'YAML' },
  xml: { zh: 'XML / HTML', en: 'XML / HTML' },
  css: { zh: 'CSS', en: 'CSS' },
  scss: { zh: 'SCSS', en: 'SCSS' },
  less: { zh: 'Less', en: 'Less' },
  markdown: { zh: 'Markdown', en: 'Markdown' },
  diff: { zh: 'Diff', en: 'Diff' },
  ini: { zh: 'INI / TOML', en: 'INI / TOML' },
  plaintext: { zh: '纯文本', en: 'Plain text' },
};

const PREFERRED_ORDER = Object.keys(LABELS);

// 下拉只列 highlight.js 分包里真正注册的语言，Markdown 里声明了别名（js、py…）也会归一到对应项。
const LANGUAGE_VALUES: string[] = (() => {
  const supported = supportedLanguages();
  const preferred = PREFERRED_ORDER.filter((value) => supported.includes(value));
  const rest = supported.filter((value) => !preferred.includes(value)).sort();
  return [AUTO_LANGUAGE, ...preferred, ...rest];
})();

interface MarkdownCodeBlockProps {
  code: string;
  /** Markdown 围栏上声明的语言，可能为空或 highlight.js 不认识。 */
  language: string;
  /** 用户在下拉框里的选择，undefined 表示跟随声明语言。 */
  value: string | undefined;
  onValueChange: (value: string) => void;
}

export function MarkdownCodeBlock({ code, language, value, onValueChange }: MarkdownCodeBlockProps) {
  const { t } = useI18n();
  const declared = canonicalLanguage(language);
  const selected = value ?? (LANGUAGE_VALUES.includes(declared) ? declared : AUTO_LANGUAGE);

  const highlighted = useMemo(
    () => (selected === AUTO_LANGUAGE ? highlightCodeAuto(code) : highlightCode(code, selected)),
    [code, selected],
  );

  return (
    <div className="md-code">
      <div className="md-code-bar">
        <Select
          wrapperClassName="w-40 max-w-[55%]"
          aria-label={t({ zh: '代码块语言', en: 'Code block language' })}
          value={selected}
          onChange={(event) => onValueChange(event.target.value)}
        >
          {LANGUAGE_VALUES.map((option) => (
            <option key={option} value={option}>
              {option === AUTO_LANGUAGE
                ? t({ zh: '自动识别', en: 'Auto detect' })
                : LABELS[option]
                  ? t(LABELS[option])
                  : option}
            </option>
          ))}
        </Select>
        <CopyButton text={code} size="sm" variant="ghost" className="ml-auto" />
      </div>
      <pre className="code-scroll">
        <code className={selected === AUTO_LANGUAGE ? 'hljs' : `hljs language-${selected}`} dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}
