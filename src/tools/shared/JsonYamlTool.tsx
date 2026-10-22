import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Segmented } from '@/components/ui/Segmented';
import { TransformTool } from '@/components/tool/TransformTool';
import { jsonToYaml, yamlToJson } from '@/lib/converters';
import { highlightJson } from '@/lib/json';
import { SAMPLE_JSON, SAMPLE_YAML } from '@/data/samples';
import { useI18n } from '@/i18n/I18nProvider';

type Direction = 'json-to-yaml' | 'yaml-to-json';

export function JsonYamlTool({ initialDirection }: { initialDirection: Direction }) {
  const { t } = useI18n();
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [directionVersion, setDirectionVersion] = useState(0);
  const [indent, setIndent] = useState<'2' | '4'>('2');
  const [sortKeys, setSortKeys] = useState(false);

  const isJsonToYaml = direction === 'json-to-yaml';

  const changeDirection = (next: Direction) => {
    setDirection(next);
    setDirectionVersion((version) => version + 1);
  };

  return (
    <TransformTool
      resetOutputKey={directionVersion}
      transform={(input) =>
        isJsonToYaml
          ? jsonToYaml(input, Number(indent), sortKeys)
          : yamlToJson(input, Number(indent))
      }
      sample={isJsonToYaml ? SAMPLE_JSON : SAMPLE_YAML}
      inputLabel={
        isJsonToYaml
          ? { zh: 'JSON 输入', en: 'JSON input' }
          : { zh: 'YAML 输入', en: 'YAML input' }
      }
      outputLabel={
        isJsonToYaml
          ? { zh: 'YAML 结果', en: 'YAML result' }
          : { zh: 'JSON 结果', en: 'JSON result' }
      }
      inputPlaceholder={
        isJsonToYaml
          ? { zh: '粘贴 JSON，例如 {"name":"qwen","age":3}', en: 'Paste JSON, e.g. {"name":"qwen","age":3}' }
          : { zh: '粘贴 YAML，例如 name: qwen\nage: 3', en: 'Paste YAML, e.g. name: qwen\nage: 3' }
      }
      outputEmptyText={{ zh: '转换结果将在这里显示', en: 'Converted result will appear here' }}
      outputFilename={isJsonToYaml ? 'data.yaml' : 'data.json'}
      outputMime={isJsonToYaml ? 'application/x-yaml;charset=utf-8' : 'application/json;charset=utf-8'}
      outputHighlight={isJsonToYaml ? undefined : highlightJson}
      successMessage={
        isJsonToYaml
          ? t({ zh: '已转换为 YAML', en: 'Converted to YAML' })
          : t({ zh: '已转换为 JSON', en: 'Converted to JSON' })
      }
      onSwap={() => setDirection(isJsonToYaml ? 'yaml-to-json' : 'json-to-yaml')}
      options={
        <>
          <Segmented<Direction>
            value={direction}
            onChange={changeDirection}
            ariaLabel={t({ zh: '转换方向', en: 'Conversion direction' })}
            options={[
              { value: 'json-to-yaml', label: 'JSON → YAML' },
              { value: 'yaml-to-json', label: 'YAML → JSON' },
            ]}
          />
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            {t({ zh: '缩进', en: 'Indent' })}
            <Select
              value={indent}
              onChange={(event) => setIndent(event.target.value as '2' | '4')}
              aria-label={t({ zh: '缩进方式', en: 'Indent size' })}
              className="h-8 text-xs"
              wrapperClassName="w-24"
            >
              <option value="2">{t({ zh: '2 空格', en: '2 spaces' })}</option>
              <option value="4">{t({ zh: '4 空格', en: '4 spaces' })}</option>
            </Select>
          </label>
          {isJsonToYaml ? (
            <Checkbox
              checked={sortKeys}
              onChange={setSortKeys}
              label={t({ zh: '按键名排序', en: 'Sort keys' })}
              className="text-xs"
            />
          ) : null}
        </>
      }
      helpText={t({
        zh: '可直接切换转换方向，或点击「交换输入输出」同时交换内容与方向',
        en: 'Switch the direction here, or use “Swap input/output” to exchange content and direction together',
      })}
    />
  );
}
