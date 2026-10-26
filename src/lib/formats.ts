import yaml, { YAMLException } from 'js-yaml';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import Papa from 'papaparse';
import type { Localized } from '@/i18n/locale';
import { ToolError, errorHint } from './errors';
import { parseJson, sortKeysDeep } from './json';
import { expandPropertyKeys, flattenToProperties, parseProperties } from './properties';
import { jsonObjectToQuery, queryToJsonObject, type QueryFlags } from './url';
import {
  SAMPLE_CSV,
  SAMPLE_JSON,
  SAMPLE_PROPERTIES,
  SAMPLE_QUERY,
  SAMPLE_XML,
  SAMPLE_YAML,
} from '@/data/samples';

export type FormatId = 'json' | 'xml' | 'yaml' | 'csv' | 'properties' | 'query';

export interface ConvertOptions {
  indent: number;
  rootName: string;
  sortKeys: boolean;
  csvDelimiter: string;
  csvHasHeader: boolean;
  expandDots: boolean;
  queryFlags: QueryFlags;
}

export const DEFAULT_CONVERT_OPTIONS: ConvertOptions = {
  indent: 2,
  rootName: 'root',
  sortKeys: false,
  csvDelimiter: ',',
  csvHasHeader: true,
  expandDots: true,
  queryFlags: { encode: true, parseArrays: true, coerceTypes: true, bracketArrays: false },
};

export interface FormatSpec {
  id: FormatId;
  label: string;
  sample: string;
  filename: string;
  mime: string;
  inputPlaceholder: Localized;
  parse: (text: string, options: ConvertOptions) => unknown;
  serialize: (value: unknown, options: ConvertOptions) => string;
}

const emptyInputError = (hint: Localized) =>
  new ToolError({ zh: '输入内容为空', en: 'Input is empty' }, hint);

/* ------------------------------ YAML ------------------------------ */

function loadYaml(text: string): unknown {
  if (!text.trim()) {
    throw emptyInputError({
      zh: '请粘贴 YAML 内容后再试。',
      en: 'Paste YAML content and try again.',
    });
  }

  try {
    return yaml.load(text, { filename: 'input.yaml' });
  } catch (error) {
    if (error instanceof YAMLException) {
      const line = (error.mark?.line ?? 0) + 1;
      const column = (error.mark?.column ?? 0) + 1;
      throw new ToolError(
        {
          zh: `YAML 解析失败：第 ${line} 行第 ${column} 列，${error.reason || '语法不正确'}。`,
          en: `YAML parsing failed: line ${line}, column ${column}, ${error.reason || 'invalid syntax'}.`,
        },
        {
          zh: '请检查缩进是否一致，冒号后是否有空格，以及列表项是否以 "- " 开头。',
          en: 'Check that indentation is consistent, that there is a space after colons, and that list items start with "- ".',
        },
      );
    }
    throw new ToolError(
      { zh: 'YAML 解析失败', en: 'YAML parsing failed' },
      errorHint(error, { zh: '请检查 YAML 内容是否合法。', en: 'Check that the YAML content is valid.' }),
    );
  }
}

function dumpYaml(value: unknown, options: ConvertOptions): string {
  const normalized = options.sortKeys ? sortKeysDeep(value) : value;
  try {
    return yaml.dump(normalized, {
      indent: options.indent,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
    });
  } catch (error) {
    throw new ToolError(
      { zh: '转 YAML 失败', en: 'Conversion to YAML failed' },
      errorHint(error, { zh: '请检查内容是否为合法的结构化数据。', en: 'Check that the content is valid structured data.' }),
    );
  }
}

/* ------------------------------ XML ------------------------------ */

// 转换只认标签名：解析时忽略属性；构建前清洗历史产物里的 @_ / #text 语义键。

function normalizeParsedXml(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeParsedXml);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1 && entries[0][0] === '#text') {
      return normalizeParsedXml(entries[0][1]);
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of entries) out[key] = normalizeParsedXml(item);
    return out;
  }
  return value;
}

function safeXmlTagName(key: string): string {
  let name = key.replace(/[^A-Za-z0-9_.-]/g, '_');
  if (!name) name = '_';
  if (/^[-.0-9]/.test(name)) name = `_${name}`;
  return name;
}

function prepareValueForXml(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(prepareValueForXml);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !key.startsWith('@_'),
    );
    if (entries.length === 1 && entries[0][0] === '#text') {
      return prepareValueForXml(entries[0][1]);
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of entries) {
      out[key === '#text' ? '#text' : safeXmlTagName(key)] = prepareValueForXml(item);
    }
    return out;
  }
  return value;
}

function parseXml(text: string): unknown {
  if (!text.trim()) {
    throw emptyInputError({ zh: '请粘贴 XML 内容后再试。', en: 'Paste XML content and try again.' });
  }

  try {
    const parser = new XMLParser({
      ignoreAttributes: true,
      ignoreDeclaration: true,
      trimValues: true,
      parseTagValue: true,
    });
    return normalizeParsedXml(parser.parse(text));
  } catch (error) {
    throw new ToolError(
      { zh: 'XML 解析失败', en: 'XML parsing failed' },
      errorHint(error, { zh: '请检查标签是否正确闭合。', en: 'Check that tags are closed correctly.' }),
    );
  }
}

function serializeXml(value: unknown, options: ConvertOptions): string {
  const root = safeXmlTagName(options.rootName.trim() || 'root');
  const prepared = prepareValueForXml(value);
  const wrapped = Array.isArray(prepared) ? { [root]: { item: prepared } } : { [root]: prepared };

  try {
    const builder = new XMLBuilder({
      ignoreAttributes: true,
      textNodeName: '#text',
      format: true,
      indentBy: '  ',
      suppressEmptyNode: true,
      processEntities: true,
    });
    return builder.build(wrapped) as string;
  } catch (error) {
    throw new ToolError(
      { zh: '转 XML 失败', en: 'Conversion to XML failed' },
      errorHint(error, { zh: '请检查内容是否为合法的结构化数据。', en: 'Check that the content is valid structured data.' }),
    );
  }
}

/* ------------------------------ CSV ------------------------------ */

function parseCsv(text: string, options: ConvertOptions): unknown {
  if (!text.trim()) {
    throw emptyInputError({ zh: '请粘贴 CSV 内容后再试。', en: 'Paste CSV content and try again.' });
  }

  const result = Papa.parse<Record<string, string> | string[]>(text.trim(), {
    header: options.csvHasHeader,
    delimiter: options.csvDelimiter,
    skipEmptyLines: 'greedy',
  });

  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new ToolError(
      {
        zh: `CSV 解析失败：第 ${(first.row ?? 0) + 1} 行，${first.message}。`,
        en: `CSV parsing failed: line ${(first.row ?? 0) + 1}, ${first.message}.`,
      },
      {
        zh: '请检查分隔符是否正确、引号是否成对闭合。',
        en: 'Check that the delimiter is correct and quotes are closed in pairs.',
      },
    );
  }

  return result.data;
}

function serializeCsv(value: unknown): string {
  if (!Array.isArray(value)) {
    throw new ToolError(
      { zh: 'CSV 输出需要一个数组', en: 'CSV output requires an array' },
      {
        zh: '顶层结构应为对象数组或二维数组，例如 [{ "name": "a" }]。',
        en: 'The top level should be an array of objects or a 2D array, e.g. [{ "name": "a" }].',
      },
    );
  }
  if (value.length === 0) {
    throw new ToolError(
      { zh: '数组为空', en: 'The array is empty' },
      { zh: '请提供至少一条记录。', en: 'Provide at least one record.' },
    );
  }

  try {
    return Papa.unparse(value, { quotes: false, newline: '\n' });
  } catch (error) {
    throw new ToolError(
      { zh: '转 CSV 失败', en: 'Conversion to CSV failed' },
      errorHint(error, { zh: '请检查数组元素是否为对象或数组。', en: 'Check that the array elements are objects or arrays.' }),
    );
  }
}

/* --------------------------- Properties --------------------------- */

function parsePropertiesValue(text: string, options: ConvertOptions): unknown {
  const flat = parseProperties(text);
  return options.expandDots ? expandPropertyKeys(flat) : flat;
}

/* ------------------------------ Query ------------------------------ */

export const FORMATS: Record<FormatId, FormatSpec> = {
  json: {
    id: 'json',
    label: 'JSON',
    sample: SAMPLE_JSON,
    filename: 'data.json',
    mime: 'application/json;charset=utf-8',
    inputPlaceholder: {
      zh: '粘贴 JSON，例如 {"user":{"name":"qwen"}}',
      en: 'Paste JSON, e.g. {"user":{"name":"qwen"}}',
    },
    parse: (text) => parseJson(text),
    serialize: (value, options) =>
      JSON.stringify(options.sortKeys ? sortKeysDeep(value) : value, null, options.indent),
  },
  xml: {
    id: 'xml',
    label: 'XML',
    sample: SAMPLE_XML,
    filename: 'data.xml',
    mime: 'application/xml;charset=utf-8',
    inputPlaceholder: {
      zh: '粘贴 XML，例如 <user><name>qwen</name></user>',
      en: 'Paste XML, e.g. <user><name>qwen</name></user>',
    },
    parse: (text) => parseXml(text),
    serialize: (value, options) => serializeXml(value, options),
  },
  yaml: {
    id: 'yaml',
    label: 'YAML',
    sample: SAMPLE_YAML,
    filename: 'data.yaml',
    mime: 'application/x-yaml;charset=utf-8',
    inputPlaceholder: {
      zh: '粘贴 YAML，例如 name: qwen',
      en: 'Paste YAML, e.g. name: qwen',
    },
    parse: (text) => loadYaml(text),
    serialize: (value, options) => dumpYaml(value, options),
  },
  csv: {
    id: 'csv',
    label: 'CSV',
    sample: SAMPLE_CSV,
    filename: 'data.csv',
    mime: 'text/csv;charset=utf-8',
    inputPlaceholder: {
      zh: '粘贴 CSV，例如 name,age\na,1',
      en: 'Paste CSV, e.g. name,age\na,1',
    },
    parse: (text, options) => parseCsv(text, options),
    serialize: (value) => serializeCsv(value),
  },
  properties: {
    id: 'properties',
    label: 'Properties',
    sample: SAMPLE_PROPERTIES,
    filename: 'config.properties',
    mime: 'text/plain;charset=utf-8',
    inputPlaceholder: {
      zh: '粘贴 Properties，例如 app.name=DevToolbox\nserver.host: localhost',
      en: 'Paste Properties, e.g. app.name=DevToolbox\nserver.host: localhost',
    },
    parse: (text, options) => parsePropertiesValue(text, options),
    serialize: (value, options) => flattenToProperties(value, options.sortKeys),
  },
  query: {
    id: 'query',
    label: 'Query',
    sample: SAMPLE_QUERY,
    filename: 'query.txt',
    mime: 'text/plain;charset=utf-8',
    inputPlaceholder: {
      zh: '粘贴 Query，例如 name=qwen&age=3',
      en: 'Paste a query string, e.g. name=qwen&age=3',
    },
    parse: (text, options) => queryToJsonObject(text, options.queryFlags),
    serialize: (value, options) => jsonObjectToQuery(value, options.queryFlags),
  },
};

export const FORMAT_ORDER: FormatId[] = ['json', 'xml', 'yaml', 'csv', 'properties', 'query'];

export function convertFormat(
  text: string,
  from: FormatId,
  to: FormatId,
  options: ConvertOptions,
): string {
  const value = FORMATS[from].parse(text, options);
  return FORMATS[to].serialize(value, options);
}
