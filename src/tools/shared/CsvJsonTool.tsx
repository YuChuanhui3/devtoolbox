import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Segmented } from '@/components/ui/Segmented';
import { TransformTool } from '@/components/tool/TransformTool';
import { csvToJson, jsonToCsv } from '@/lib/converters';
import { highlightJson } from '@/lib/json';
import { SAMPLE_CSV, SAMPLE_JSON_ARRAY } from '@/data/samples';
import { useI18n } from '@/i18n/I18nProvider';

type Direction = 'json-to-csv' | 'csv-to-json';

export function CsvJsonTool({ initialDirection }: { initialDirection: Direction }) {
  const { t } = useI18n();
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [directionVersion, setDirectionVersion] = useState(0);
  const [delimiter, setDelimiter] = useState(',');
  const [hasHeader, setHasHeader] = useState(true);

  const isJsonToCsv = direction === 'json-to-csv';

  const changeDirection = (next: Direction) => {
    setDirection(next);
    setDirectionVersion((version) => version + 1);
  };

  return (
    <TransformTool
      resetOutputKey={directionVersion}
      transform={(input) =>
        isJsonToCsv
          ? jsonToCsv(input)
          : csvToJson(input, { delimiter, hasHeader })
      }
      sample={isJsonToCsv ? SAMPLE_JSON_ARRAY : SAMPLE_CSV}
      inputLabel={isJsonToCsv ? { zh: 'JSON 数组', en: 'JSON array' } : { zh: 'CSV 文本', en: 'CSV text' }}
      outputLabel={isJsonToCsv ? { zh: 'CSV 结果', en: 'CSV result' } : { zh: 'JSON 结果', en: 'JSON result' }}
      inputPlaceholder={
        isJsonToCsv
          ? { zh: '粘贴对象数组，例如 [{"name":"a","age":1}]', en: 'Paste an array of objects, e.g. [{"name":"a","age":1}]' }
          : { zh: '粘贴 CSV 文本，首行可作为表头', en: 'Paste CSV text; the first row can be the header' }
      }
      outputFilename={isJsonToCsv ? 'data.csv' : 'data.json'}
      outputMime={isJsonToCsv ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'}
      outputHighlight={isJsonToCsv ? undefined : highlightJson}
      successMessage={{ zh: '转换完成', en: 'Converted' }}
      onSwap={() => setDirection(isJsonToCsv ? 'csv-to-json' : 'json-to-csv')}
      options={
        <>
          <Segmented<Direction>
            value={direction}
            onChange={changeDirection}
            ariaLabel={t({ zh: '转换方向', en: 'Conversion direction' })}
            options={[
              { value: 'json-to-csv', label: 'JSON → CSV' },
              { value: 'csv-to-json', label: 'CSV → JSON' },
            ]}
          />
          {!isJsonToCsv ? (
            <>
              <label className="flex items-center gap-1.5 text-xs text-ink-3">
                {t({ zh: '分隔符', en: 'Delimiter' })}
                <Select
                  value={delimiter}
                  onChange={(event) => setDelimiter(event.target.value)}
                  aria-label={t({ zh: 'CSV 分隔符', en: 'CSV delimiter' })}
                  className="h-8 text-xs"
                  wrapperClassName="w-24"
                >
                  <option value=",">{t({ zh: '逗号 ,', en: 'Comma ,' })}</option>
                  <option value=";">{t({ zh: '分号 ;', en: 'Semicolon ;' })}</option>
                  <option value={'\t'}>{t({ zh: '制表符 Tab', en: 'Tab' })}</option>
                  <option value="|">{t({ zh: '竖线 |', en: 'Pipe |' })}</option>
                </Select>
              </label>
              <Checkbox
                checked={hasHeader}
                onChange={setHasHeader}
                label={t({ zh: '首行是表头', en: 'First row is header' })}
                className="text-xs"
              />
            </>
          ) : null}
        </>
      }
      helpText={
        isJsonToCsv
          ? t({
              zh: 'JSON 转 CSV 需要顶层为对象数组；嵌套对象会被序列化为 JSON 字符串。',
              en: 'JSON → CSV requires a top-level array of objects; nested objects are serialized as JSON strings.',
            })
          : t({
              zh: 'CSV 转 JSON 默认将首行作为字段名，所有值以字符串输出。可直接切换方向或交换输入输出。',
              en: 'CSV → JSON uses the first row as field names and outputs all values as strings. Switch direction or swap input/output anytime.',
            })
      }
    />
  );
}
