import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Segmented } from '@/components/ui/Segmented';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import { propertiesToYaml, yamlToProperties } from '@/lib/properties';
import { SAMPLE_PROPERTIES, SAMPLE_YAML } from '@/data/samples';

type Direction = 'properties-to-yaml' | 'yaml-to-properties';

export default function YamlPropertiesTool() {
  const { t } = useI18n();
  const [direction, setDirection] = useState<Direction>('properties-to-yaml');
  const [directionVersion, setDirectionVersion] = useState(0);
  const [indent, setIndent] = useState<'2' | '4'>('2');
  const [expandDots, setExpandDots] = useState(true);
  const [sortKeys, setSortKeys] = useState(false);

  const isToYaml = direction === 'properties-to-yaml';

  const changeDirection = (next: Direction) => {
    setDirection(next);
    setDirectionVersion((version) => version + 1);
  };

  return (
    <TransformTool
      resetOutputKey={directionVersion}
      transform={(input) =>
        isToYaml
          ? propertiesToYaml(input, { indent: Number(indent), expandDots, sortKeys })
          : yamlToProperties(input, { sortKeys })
      }
      sample={isToYaml ? SAMPLE_PROPERTIES : SAMPLE_YAML}
      inputLabel={isToYaml ? { zh: 'Properties 输入', en: 'Properties input' } : { zh: 'YAML 输入', en: 'YAML input' }}
      outputLabel={isToYaml ? { zh: 'YAML 结果', en: 'YAML result' } : { zh: 'Properties 结果', en: 'Properties result' }}
      inputPlaceholder={
        isToYaml
          ? {
              zh: '粘贴 Properties，例如 app.name=DevToolbox\nserver.host: localhost',
              en: 'Paste Properties, e.g. app.name=DevToolbox\nserver.host: localhost',
            }
          : { zh: '粘贴 YAML，例如 app:\n  name: DevToolbox', en: 'Paste YAML, e.g. app:\n  name: DevToolbox' }
      }
      outputEmptyText={{ zh: '转换结果将在这里显示', en: 'Converted output will appear here' }}
      outputFilename={isToYaml ? 'config.yaml' : 'config.properties'}
      outputMime={isToYaml ? 'application/x-yaml;charset=utf-8' : 'text/plain;charset=utf-8'}
      successMessage={
        isToYaml
          ? t({ zh: '已转换为 YAML', en: 'Converted to YAML' })
          : t({ zh: '已转换为 Properties', en: 'Converted to Properties' })
      }
      onSwap={() => setDirection(isToYaml ? 'yaml-to-properties' : 'properties-to-yaml')}
      options={
        <>
          <Segmented<Direction>
            value={direction}
            onChange={changeDirection}
            ariaLabel={t({ zh: '转换方向', en: 'Conversion direction' })}
            options={[
              { value: 'properties-to-yaml', label: 'Properties → YAML' },
              { value: 'yaml-to-properties', label: 'YAML → Properties' },
            ]}
          />
          {isToYaml ? (
            <label className="flex items-center gap-1.5 text-xs text-ink-3">
              {t({ zh: '缩进', en: 'Indent' })}
              <Select
                value={indent}
                onChange={(event) => setIndent(event.target.value as '2' | '4')}
                aria-label={t({ zh: '缩进方式', en: 'Indent style' })}
                className="h-8 text-xs"
                wrapperClassName="w-24"
              >
                <option value="2">{t({ zh: '2 空格', en: '2 spaces' })}</option>
                <option value="4">{t({ zh: '4 空格', en: '4 spaces' })}</option>
              </Select>
            </label>
          ) : null}
          {isToYaml ? (
            <Checkbox
              checked={expandDots}
              onChange={setExpandDots}
              label={t({ zh: '展开 a.b / a[0] 为层级结构', en: 'Expand a.b / a[0] into nested structure' })}
              className="text-xs"
            />
          ) : null}
          <Checkbox
            checked={sortKeys}
            onChange={setSortKeys}
            label={t({ zh: '按键名排序', en: 'Sort keys' })}
            className="text-xs"
          />
        </>
      }
      helpText={t({
        zh: '支持 key=value / key: value / key value 三种分隔、# 与 ! 注释、反斜杠续行与 \\uXXXX 转义；YAML 转 Properties 会把嵌套结构拍平为 a.b 与 a[0] 形式',
        en: 'Supports key=value / key: value / key value separators, # and ! comments, backslash line continuation, and \\uXXXX escapes; YAML to Properties flattens nesting into a.b and a[0] form',
      })}
    />
  );
}
