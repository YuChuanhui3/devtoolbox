import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Select } from '@/components/ui/Select';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';
import {
  CODE_LANGUAGES,
  getCodeFilename,
  sanitizeRootName,
  type CodeGenOptions,
  type CodeLanguage,
} from '@/lib/codegen';

export const NAMING_LABELS: Record<CodeGenOptions['naming'], L10n> = {
  camel: { zh: '小驼峰', en: 'camelCase' },
  pascal: { zh: '大驼峰', en: 'PascalCase' },
  snake: { zh: '下划线', en: 'snake_case' },
  preserve: { zh: '保持原样', en: 'Keep as-is' },
};

interface CodeGenOptionsPanelProps {
  options: CodeGenOptions;
  onChange: (patch: Partial<CodeGenOptions>) => void;
}

export function CodeGenOptionsPanel({ options, onChange }: CodeGenOptionsPanelProps) {
  const { t } = useI18n();
  const rootName = sanitizeRootName(options.rootName);
  const filename = getCodeFilename(options.rootName, options.language);

  return (
    <Panel
      title={t({ zh: '生成参数', en: 'Generation settings' })}
      subtitle={t({
        zh: '全部转换在本地 Web Worker 中完成，JSON 内容不会上传',
        en: 'All generation runs in a local Web Worker; your JSON is never uploaded',
      })}
    >
      <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[220px_160px_minmax(200px,1fr)_auto]">
        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-ink-2">
          {t({ zh: '目标语言', en: 'Target language' })}
          <Select
            value={options.language}
            onChange={(event) => onChange({ language: event.target.value as CodeLanguage })}
            aria-label={t({ zh: '目标语言', en: 'Target language' })}
          >
            {CODE_LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-ink-2">
          {t({ zh: '命名风格', en: 'Naming style' })}
          <Select
            value={options.naming}
            onChange={(event) =>
              onChange({ naming: event.target.value as CodeGenOptions['naming'] })
            }
            aria-label={t({ zh: '命名风格', en: 'Naming style' })}
          >
            <option value="camel">{t(NAMING_LABELS.camel)}</option>
            <option value="pascal">{t(NAMING_LABELS.pascal)}</option>
            <option value="snake">{t(NAMING_LABELS.snake)}</option>
            <option value="preserve">{t(NAMING_LABELS.preserve)}</option>
          </Select>
        </label>

        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-ink-2">
          {t({ zh: '根节点名称', en: 'Root name' })}
          <Input
            value={options.rootName}
            onChange={(event) => onChange({ rootName: event.target.value })}
            aria-label={t({ zh: '根节点名称', en: 'Root name' })}
            placeholder="RootData"
            maxLength={64}
            mono
          />
        </label>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-2.5">
          <Checkbox
            checked={options.comments}
            onChange={(checked) => onChange({ comments: checked })}
            label={t({ zh: '生成字段注释', en: 'Generate field comments' })}
            className="text-xs"
          />
          <Checkbox
            checked={options.handleNull}
            onChange={(checked) => onChange({ handleNull: checked })}
            label={t({ zh: '处理 null / 可选字段', en: 'Handle null / optional fields' })}
            className="text-xs"
          />
        </div>
      </div>

      <p className="mt-3 border-t border-line pt-3 text-[11px] text-ink-3">
        {t({ zh: '类名将生成为 ', en: 'Class name: ' })}
        <span className="font-mono text-ink-2">{rootName}</span>
        {t({ zh: '，下载文件名为 ', en: ', download filename: ' })}
        <span className="font-mono text-ink-2">{filename}</span>
      </p>
    </Panel>
  );
}
