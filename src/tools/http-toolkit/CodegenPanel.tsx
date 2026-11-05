import { useMemo, useState } from 'react';
import { CopyButton } from '@/components/tool/ToolActions';
import { Select } from '@/components/ui/Select';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { CODEGEN_LANGUAGES, generateSnippet, snippetPlan, type CodegenId } from '@/lib/apiworkbench/codegen';
import type { WbRequest } from '@/lib/apiworkbench/types';

/**
 * 请求 → 多语言代码片段。
 *
 * 语言用 Select 而不是第 6 排页签：8 个 Segmented 段在本项目宽度下必然换行。
 */
export function CodegenPanel({ request }: { request: WbRequest }) {
  const { t } = useI18n();
  const [lang, setLang] = useState<CodegenId>('curl');
  const plan = useMemo(() => snippetPlan(request), [request]);
  const snippet = useMemo(() => generateSnippet(request, lang), [request, lang]);
  const files = plan.body.files;

  return (
    <div className="min-w-0 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          size="sm"
          value={lang}
          onChange={(event) => setLang(event.target.value as CodegenId)}
          aria-label={t({ zh: '目标语言', en: 'Target language' })}
          wrapperClassName="w-44 shrink-0"
        >
          {CODEGEN_LANGUAGES.map((item) => (
            <option key={item.id} value={item.id}>
              {t(item.label)}
            </option>
          ))}
        </Select>
        <p className="min-w-0 flex-1 text-[11px] leading-4 text-ink-3">
          {t({
            zh: `片段按发送时真正会带的请求头生成${plan.basic ? '，Basic 在运行时编码' : ''}。`,
            en: `Headers are the ones the request actually sends${plan.basic ? '; Basic is encoded at run time' : ''}.`,
          })}
        </p>
        <CopyButton text={snippet} label={t({ zh: '复制代码', en: 'Copy code' })} />
      </div>

      {plan.variables.length > 0 ? (
        <ToolAlert
          tone="info"
          title={t({
            zh: `变量保持原样：${plan.variables.map((name) => `{{${name}}}`).join(' ')}`,
            en: `Variables stay literal: ${plan.variables.map((name) => `{{${name}}}`).join(' ')}`,
          })}
          hint={t({ zh: '执行前把占位换成真实值——本页不猜你的密钥，也不把它写进代码。', en: 'Replace them before running; this page does not guess your secrets or bake them into code.' })}
        />
      ) : null}

      {files.length > 0 ? (
        <ToolAlert
          tone="info"
          title={t({ zh: `文件字段只引用文件名：${files.map((file) => file.name).join('、')}`, en: `File fields are referenced by name only: ${files.map((file) => file.name).join(', ')}` })}
          hint={t({ zh: '文件字节只在这一页的内存里，不进存储，所以片段里请按同样的路径准备好这些文件。', en: 'File bytes live only in this tab memory, so put the files at those paths before running.' })}
        />
      ) : null}

      <pre className="code-scroll max-h-80 min-w-0 overflow-auto rounded-card border border-line bg-surface-2/40 p-2.5 text-xs leading-5">
        <code>{snippet}</code>
      </pre>
    </div>
  );
}
