import { useState } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import { TransformTool } from '@/components/tool/TransformTool';
import { useI18n } from '@/i18n/I18nProvider';
import { jsonObjectToQuery, queryToJsonObject, type QueryFlags } from '@/lib/url';
import { highlightJson, parseJson } from '@/lib/json';
import { SAMPLE_JSON, SAMPLE_QUERY } from '@/data/samples';

type Direction = 'json-to-query' | 'query-to-json';

export default function JsonQueryTool() {
  const { t } = useI18n();
  const [direction, setDirection] = useState<Direction>('json-to-query');
  const [flags, setFlags] = useState<QueryFlags>({
    encode: true,
    parseArrays: true,
    coerceTypes: true,
    bracketArrays: false,
  });

  const isJsonToQuery = direction === 'json-to-query';

  const updateFlag = (key: keyof QueryFlags) => (value: boolean) =>
    setFlags((current) => ({ ...current, [key]: value }));

  return (
    <TransformTool
      transform={(input) =>
        isJsonToQuery
          ? jsonObjectToQuery(parseJson(input), flags)
          : JSON.stringify(queryToJsonObject(input, flags), null, 2)
      }
      sample={isJsonToQuery ? SAMPLE_JSON : SAMPLE_QUERY}
      inputLabel={isJsonToQuery ? { zh: 'JSON 对象', en: 'JSON object' } : { zh: 'Query 字符串', en: 'Query string' }}
      outputLabel={isJsonToQuery ? { zh: 'Query 结果', en: 'Query result' } : { zh: 'JSON 结果', en: 'JSON result' }}
      inputPlaceholder={
        isJsonToQuery
          ? { zh: '粘贴 JSON 对象，例如 {"name":"qwen","age":3}', en: 'Paste a JSON object, e.g. {"name":"qwen","age":3}' }
          : { zh: '粘贴 Query，例如 name=qwen&age=3', en: 'Paste a query string, e.g. name=qwen&age=3' }
      }
      outputFilename={isJsonToQuery ? 'query.txt' : 'query.json'}
      outputMime={isJsonToQuery ? 'text/plain;charset=utf-8' : 'application/json;charset=utf-8'}
      outputHighlight={isJsonToQuery ? undefined : highlightJson}
      successMessage={{ zh: '转换完成', en: 'Converted' }}
      onSwap={() => setDirection(isJsonToQuery ? 'query-to-json' : 'json-to-query')}
      options={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Checkbox
            checked={flags.encode}
            onChange={updateFlag('encode')}
            label={t({ zh: 'URL 编码', en: 'URL encode' })}
            className="text-xs"
          />
          <Checkbox
            checked={flags.parseArrays}
            onChange={updateFlag('parseArrays')}
            label={t({ zh: '解析重复参数为数组', en: 'Parse repeated params into arrays' })}
            className="text-xs"
          />
          <Checkbox
            checked={flags.coerceTypes}
            onChange={updateFlag('coerceTypes')}
            label={t({ zh: '自动转数字 / 布尔', en: 'Coerce numbers / booleans' })}
            className="text-xs"
          />
          <Checkbox
            checked={flags.bracketArrays}
            onChange={updateFlag('bracketArrays')}
            label={t({ zh: '数组使用 [] 语法', en: 'Use [] syntax for arrays' })}
            className="text-xs"
          />
        </div>
      }
      helpText={t({
        zh: 'JSON 转 Query 支持嵌套对象展开；Query 转 JSON 支持重复参数与 [] 数组语法。',
        en: 'JSON to Query expands nested objects; Query to JSON supports repeated parameters and [] array syntax.',
      })}
    />
  );
}
