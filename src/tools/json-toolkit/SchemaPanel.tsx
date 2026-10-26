import { useMemo, useState } from 'react';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { Textarea } from '@/components/ui/Textarea';
import { ActionBar, CopyButton, SampleButton, ClearButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { parseJson } from '@/lib/json';
import { toToolError } from '@/lib/errors';
import { inferJsonSchema, validateAgainstSchema, type SchemaIssue } from '@/lib/jsonSchema';
import type { ToolkitPanelProps } from './types';

type Mode = 'validate' | 'generate';

const SAMPLE_SCHEMA = JSON.stringify(
  {
    type: 'object',
    required: ['device', 'readings'],
    properties: {
      device: { type: 'string', minLength: 1 },
      ts: { type: 'integer', minimum: 0 },
      readings: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['key', 'value'],
          properties: {
            key: { type: 'string', pattern: '^[a-z_]+$' },
            value: { type: ['number', 'null'] },
            unit: { enum: ['C', 'F', '%'] },
          },
        },
      },
    },
  },
  null,
  2,
);

const SAMPLE_DATA = JSON.stringify(
  {
    device: 'kitchen-sensor',
    ts: 1_730_000_000,
    readings: [
      { key: 'temp', value: 26.5, unit: 'C' },
      { key: 'humidity', value: null },
    ],
  },
  null,
  2,
);

export function SchemaPanel({ input, setInput }: ToolkitPanelProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('validate');
  const [schemaText, setSchemaText] = useState(SAMPLE_SCHEMA);

  const debouncedSchema = useDebouncedValue(schemaText, 250);
  const debouncedData = useDebouncedValue(input, 250);

  const validation = useMemo((): { result: { valid: boolean; issues: SchemaIssue[] } | null; error: Localized | null; parseHint: Localized | null } => {
    if (mode !== 'validate') return { result: null, error: null, parseHint: null };
    if (!debouncedSchema.trim() || !debouncedData.trim()) {
      return { result: null, error: null, parseHint: { zh: '请同时填写 Schema 与待校验 JSON（共享输入区）', en: 'Fill in the schema and the JSON to validate (shared input)' } };
    }
    try {
      const schema = parseJson(debouncedSchema);
      const data = parseJson(debouncedData);
      return { result: validateAgainstSchema(data, schema), error: null, parseHint: null };
    } catch (caught) {
      const error = toToolError(caught);
      return { result: null, error: error.localized, parseHint: null };
    }
  }, [mode, debouncedSchema, debouncedData]);

  const generation = useMemo((): { output: string; error: Localized | null } => {
    if (mode !== 'generate') return { output: '', error: null };
    if (!debouncedData.trim()) return { output: '', error: null };
    try {
      return { output: JSON.stringify(inferJsonSchema(parseJson(debouncedData)), null, 2), error: null };
    } catch (caught) {
      return { output: '', error: toToolError(caught).localized };
    }
  }, [mode, debouncedData]);

  const applySample = () => {
    if (mode === 'validate') {
      setSchemaText(SAMPLE_SCHEMA);
      setInput(SAMPLE_DATA);
    } else {
      setInput(SAMPLE_DATA);
    }
  };

  const clearAll = () => {
    if (mode === 'validate') {
      setSchemaText('');
    }
    setInput('');
  };

  return (
    <div className="space-y-4">
      <ActionBar>
        <Segmented
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '工作模式', en: 'Working mode' })}
          options={[
            { value: 'validate', label: t({ zh: 'Schema 校验', en: 'Validate' }) },
            { value: 'generate', label: t({ zh: 'JSON 生成 Schema', en: 'Generate' }) },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton onClick={applySample} />
          <ClearButton onClick={clearAll} />
          {mode === 'generate' ? (
            <CopyButton text={generation.output} label={{ zh: '复制 Schema', en: 'Copy schema' }} />
          ) : null}
        </div>
      </ActionBar>

      {mode === 'validate' ? (
        <>
          {validation.error ? <ToolAlert tone="error" title={validation.error} hint={{ zh: '支持 draft-07 / 2020-12 常用关键字子集', en: 'Supports the common draft-07 / 2020-12 keyword subset' }} /> : null}
          {!validation.error && validation.parseHint ? <ToolAlert tone="info" title={validation.parseHint} /> : null}
          {validation.result?.valid ? (
            <ToolAlert tone="success" title={t({ zh: '校验通过：JSON 符合 Schema 定义', en: 'Valid: the JSON matches the schema' })} />
          ) : null}
          {validation.result && !validation.result.valid ? (
            <ToolAlert
              tone="error"
              title={t({
                zh: `校验未通过，共 ${validation.result.issues.length} 处问题`,
                en: `Invalid: ${validation.result.issues.length} issue${validation.result.issues.length === 1 ? '' : 's'} found`,
              })}
            >
              <ul className="mt-1 max-h-64 space-y-1 overflow-auto text-[12px] leading-5">
                {validation.result.issues.map((issueItem, index) => (
                  <li key={index} className="flex flex-wrap gap-x-2">
                    <code className="shrink-0 rounded-lg bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{issueItem.path}</code>
                    <span>{t(issueItem.message)}</span>
                  </li>
                ))}
              </ul>
            </ToolAlert>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t({ zh: '待校验 JSON（共享输入）', en: 'JSON to validate (shared input)' })} bodyClassName="p-0">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                mono
                rows={16}
                spellCheck={false}
                className="h-full min-h-[300px] resize-none rounded-none border-0 text-[12px]"
                placeholder={t({ zh: '粘贴要校验的 JSON…', en: 'Paste the JSON to validate…' })}
                aria-label={t({ zh: '待校验 JSON 输入', en: 'JSON input to validate' })}
              />
            </Panel>
            <Panel title={t({ zh: 'JSON Schema', en: 'JSON Schema' })} bodyClassName="p-0">
              <Textarea
                value={schemaText}
                onChange={(event) => setSchemaText(event.target.value)}
                mono
                rows={16}
                spellCheck={false}
                className="h-full min-h-[300px] resize-none rounded-none border-0 text-[12px]"
                placeholder={t({ zh: '{ "type": "object", ... }', en: '{ "type": "object", ... }' })}
                aria-label={t({ zh: 'JSON Schema 输入', en: 'JSON Schema input' })}
              />
            </Panel>
          </div>

          <p className="text-center text-[11px] leading-5 text-ink-3">
            {t({
              zh: '支持关键字：type / enum / const / required / properties / patternProperties / additionalProperties / items（含元组）/ additionalItems / uniqueItems / min·max 系列 / pattern / multipleOf / allOf / anyOf / oneOf / not / 本地 $ref（#/…）。format 与远程 $ref 不参与校验。',
              en: 'Supported keywords: type / enum / const / required / properties / patternProperties / additionalProperties / items (incl. tuples) / additionalItems / uniqueItems / min-max family / pattern / multipleOf / allOf / anyOf / oneOf / not / local $ref (#/…). "format" and remote $ref are not enforced.',
            })}
          </p>
        </>
      ) : (
        <>
          {generation.error ? <ToolAlert tone="error" title={generation.error} hint={{ zh: '请检查 JSON 是否完整（括号与引号配对）', en: 'Check that the JSON is complete (balanced braces and quotes)' }} /> : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t({ zh: '示例 JSON（共享输入）', en: 'Sample JSON (shared input)' })} bodyClassName="p-0">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                mono
                rows={16}
                spellCheck={false}
                className="h-full min-h-[300px] resize-none rounded-none border-0 text-[12px]"
                placeholder={t({ zh: '粘贴一段 JSON，反向推导 Schema…', en: 'Paste JSON to infer its schema…' })}
                aria-label={t({ zh: '示例 JSON 输入', en: 'Sample JSON input' })}
              />
            </Panel>
            <Panel
              title={t({ zh: '生成的 Schema（draft-07）', en: 'Generated schema (draft-07)' })}
              subtitle={t({ zh: '数组元素类型自动归并；对象字段默认全部必填', en: 'Array item types are merged; object keys are all required by default' })}
              bodyClassName="p-0"
            >
              {generation.output ? (
                <pre className="h-full min-h-[300px] overflow-auto rounded-none bg-code-bg p-4 font-mono text-[12px] leading-6 text-ink">
                  {generation.output}
                </pre>
              ) : (
                <div className="flex min-h-[300px] items-center justify-center text-xs text-ink-3">
                  {t({ zh: '输入 JSON 后自动生成', en: 'Enter JSON to generate the schema' })}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
