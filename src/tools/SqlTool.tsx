import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import { ToolError, errorHint } from '@/lib/errors';
import { highlightCode } from '@/lib/highlight';
import { SAMPLE_SQL } from '@/data/samples';

type KeywordCase = 'upper' | 'lower' | 'preserve';
type Dialect = 'sql' | 'mysql' | 'postgresql' | 'sqlite' | 'tsql' | 'plsql';

const DIALECTS: Array<{ value: Dialect; label: L10n }> = [
  { value: 'sql', label: { zh: '标准 SQL', en: 'Standard SQL' } },
  { value: 'mysql', label: { zh: 'MySQL', en: 'MySQL' } },
  { value: 'postgresql', label: { zh: 'PostgreSQL', en: 'PostgreSQL' } },
  { value: 'sqlite', label: { zh: 'SQLite', en: 'SQLite' } },
  { value: 'tsql', label: { zh: 'SQL Server', en: 'SQL Server' } },
  { value: 'plsql', label: { zh: 'Oracle PL/SQL', en: 'Oracle PL/SQL' } },
];

export default function SqlTool() {
  const { t } = useI18n();
  const [dialect, setDialect] = useState<Dialect>('sql');
  const [keywordCase, setKeywordCase] = useState<KeywordCase>('upper');
  const [indent, setIndent] = useState<'2' | '4'>('2');
  const [useTabs, setUseTabs] = useState(false);

  return (
    <TransformTool
      transform={async (input) => {
        if (!input.trim()) {
          throw new ToolError(
            { zh: '请输入 SQL 语句', en: 'Enter a SQL statement' },
            { zh: '输入 SQL 后点击「转换」进行格式化。', en: 'Enter SQL and click Convert to format it.' },
          );
        }
        // sql-formatter 的 exports 映射只放开了根入口，无法按方言拆子路径，
        // 改成点击「转换」时才加载（约 300 kB），打开页面不再背着它。
        const { format } = await import('sql-formatter').catch(
          () => {
            throw new ToolError(
              { zh: 'SQL 格式化模块加载失败', en: 'Failed to load the SQL formatter module' },
              { zh: '懒加载分包没下载下来，请刷新页面后重试。', en: 'The lazily loaded chunk failed to download; refresh the page and try again.' },
            );
          },
        );
        try {
          return format(input, {
            language: dialect,
            keywordCase,
            tabWidth: Number(indent),
            useTabs,
            linesBetweenQueries: 2,
          });
        } catch (error) {
          throw new ToolError(
            { zh: 'SQL 格式化失败', en: 'SQL formatting failed' },
            errorHint(error, { zh: '请检查 SQL 语法是否完整。', en: 'Check that the SQL syntax is complete.' }),
          );
        }
      }}
      sample={SAMPLE_SQL}
      inputLabel={{ zh: '原始 SQL', en: 'Raw SQL' }}
      outputLabel={{ zh: '格式化 SQL', en: 'Formatted SQL' }}
      inputPlaceholder="SELECT * FROM users WHERE status = 'active';"
      outputFilename="formatted.sql"
      outputMime="text/plain;charset=utf-8"
      outputHighlight={(value) => highlightCode(value, 'sql')}
      successMessage={{ zh: 'SQL 格式化完成', en: 'SQL formatted' }}
      showSwap={false}
      options={
        <>
          <Select
            value={dialect}
            onChange={(event) => setDialect(event.target.value as Dialect)}
            aria-label={t({ zh: 'SQL 方言', en: 'SQL dialect' })}
            className="h-8 text-xs"
            wrapperClassName="w-32"
          >
            {DIALECTS.map((item) => (
              <option key={item.value} value={item.value}>
                {t(item.label)}
              </option>
            ))}
          </Select>
          <Select
            value={keywordCase}
            onChange={(event) => setKeywordCase(event.target.value as KeywordCase)}
            aria-label={t({ zh: '关键字大小写', en: 'Keyword case' })}
            className="h-8 text-xs"
            wrapperClassName="w-28"
          >
            <option value="upper">{t({ zh: '关键字大写', en: 'Uppercase keywords' })}</option>
            <option value="lower">{t({ zh: '关键字小写', en: 'Lowercase keywords' })}</option>
            <option value="preserve">{t({ zh: '保留原样', en: 'Preserve case' })}</option>
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            {t({ zh: '缩进', en: 'Indent' })}
            <Select
              value={indent}
              onChange={(event) => setIndent(event.target.value as '2' | '4')}
              aria-label={t({ zh: '缩进宽度', en: 'Indent width' })}
              className="h-8 text-xs"
              wrapperClassName="w-20"
            >
              <option value="2">2</option>
              <option value="4">4</option>
            </Select>
          </label>
          <Checkbox checked={useTabs} onChange={setUseTabs} label={t({ zh: '使用 Tab', en: 'Use tabs' })} className="text-xs" />
        </>
      }
      helpText={t({
        zh: '支持标准 SQL、MySQL、PostgreSQL、SQLite、SQL Server 与 Oracle PL/SQL 方言。',
        en: 'Supports Standard SQL, MySQL, PostgreSQL, SQLite, SQL Server, and Oracle PL/SQL dialects.',
      })}
    />
  );
}
