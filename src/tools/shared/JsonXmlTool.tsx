import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Segmented } from '@/components/ui/Segmented';
import { TransformTool } from '@/components/tool/TransformTool';
import { jsonToXml, xmlToJson } from '@/lib/converters';
import { highlightJson } from '@/lib/json';
import { SAMPLE_JSON, SAMPLE_XML } from '@/data/samples';
import { useI18n } from '@/i18n/I18nProvider';

type Direction = 'json-to-xml' | 'xml-to-json';

export function JsonXmlTool({ initialDirection }: { initialDirection: Direction }) {
  const { t } = useI18n();
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [directionVersion, setDirectionVersion] = useState(0);
  const [rootName, setRootName] = useState('root');
  const [keepAttributes, setKeepAttributes] = useState(true);
  const [keepComments, setKeepComments] = useState(true);
  const [fieldMapping, setFieldMapping] = useState(false);

  const isJsonToXml = direction === 'json-to-xml';

  const changeDirection = (next: Direction) => {
    setDirection(next);
    setDirectionVersion((version) => version + 1);
  };

  return (
    <TransformTool
      resetOutputKey={directionVersion}
      transform={(input) =>
        isJsonToXml
          ? jsonToXml(input, rootName)
          : xmlToJson(input, { keepAttributes, keepComments, fieldMapping })
      }
      sample={isJsonToXml ? SAMPLE_JSON : SAMPLE_XML}
      inputLabel={
        isJsonToXml
          ? { zh: 'JSON 输入', en: 'JSON input' }
          : { zh: 'XML 输入', en: 'XML input' }
      }
      outputLabel={
        isJsonToXml
          ? { zh: 'XML 结果', en: 'XML result' }
          : { zh: 'JSON 结果', en: 'JSON result' }
      }
      inputPlaceholder={
        isJsonToXml
          ? { zh: '粘贴 JSON 对象，例如 {"user":{"name":"qwen"}}', en: 'Paste a JSON object, e.g. {"user":{"name":"qwen"}}' }
          : { zh: '粘贴 XML，例如 <user><name>qwen</name></user>', en: 'Paste XML, e.g. <user><name>qwen</name></user>' }
      }
      outputFilename={isJsonToXml ? 'data.xml' : 'data.json'}
      outputMime={isJsonToXml ? 'application/xml;charset=utf-8' : 'application/json;charset=utf-8'}
      outputHighlight={isJsonToXml ? undefined : highlightJson}
      successMessage={
        isJsonToXml
          ? { zh: '已转换为 XML', en: 'Converted to XML' }
          : { zh: '已转换为 JSON', en: 'Converted to JSON' }
      }
      onSwap={() => setDirection(isJsonToXml ? 'xml-to-json' : 'json-to-xml')}
      options={
        <>
          <Segmented<Direction>
            value={direction}
            onChange={changeDirection}
            ariaLabel={t({ zh: '转换方向', en: 'Conversion direction' })}
            options={[
              { value: 'json-to-xml', label: 'JSON → XML' },
              { value: 'xml-to-json', label: 'XML → JSON' },
            ]}
          />
          {isJsonToXml ? (
            <label className="flex items-center gap-1.5 text-xs text-ink-3">
              {t({ zh: '根节点', en: 'Root tag' })}
              <Input
                value={rootName}
                onChange={(event) => setRootName(event.target.value)}
                aria-label={t({ zh: 'XML 根节点名称', en: 'XML root tag name' })}
                className="h-8 w-24 text-xs"
              />
            </label>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Checkbox
                checked={keepAttributes}
                onChange={setKeepAttributes}
                label={t({ zh: '保留属性', en: 'Keep attributes' })}
                className="text-xs"
              />
              <Checkbox
                checked={keepComments}
                onChange={setKeepComments}
                label={t({ zh: '注释转 remark', en: 'Comments → remark' })}
                className="text-xs"
              />
              <Checkbox
                checked={fieldMapping}
                onChange={setFieldMapping}
                label={t({ zh: '字段映射 name→desc', en: 'Field mapping name→desc' })}
                className="text-xs"
              />
            </div>
          )}
        </>
      }
      helpText={t({
        zh: 'XML 解析会将属性以 @_ 前缀保存、注释写入 remark；字段映射会把带 name 属性的元素数组折叠为 {name: desc} 紧凑映射，备注等信息自动并入 {desc, remark} 结构。JSON 转 XML 时 remark 会写回注释。',
        en: 'Parsing keeps attributes with an @_ prefix and stores comments in remark. Field mapping collapses element arrays with a name attribute into a compact {name: desc} map, keeping notes in a {desc, remark} object. On JSON to XML, remark is written back as a comment.',
      })}
    />
  );
}
