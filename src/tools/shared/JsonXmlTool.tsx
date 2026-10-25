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
          : xmlToJson(input, { keepAttributes })
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
            <Checkbox
              checked={keepAttributes}
              onChange={setKeepAttributes}
              label={t({ zh: '保留属性', en: 'Keep attributes' })}
              className="text-xs"
            />
          )}
        </>
      }
      helpText={t({
        zh: 'XML 解析会将属性以 @_ 前缀保存；空节点会被保留为空对象。',
        en: 'XML parsing stores attributes with an @_ prefix; empty nodes are kept as empty objects.',
      })}
    />
  );
}
