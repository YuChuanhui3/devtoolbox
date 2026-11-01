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
  SAMPLE_MARKDOWN_TABLE,
  SAMPLE_NDJSON,
  SAMPLE_PROPERTIES,
  SAMPLE_QUERY,
  SAMPLE_SQL_INSERT,
  SAMPLE_XML,
  SAMPLE_YAML,
} from '@/data/samples';

export type FormatId =
  | 'json'
  | 'xml'
  | 'yaml'
  | 'csv'
  | 'ndjson'
  | 'markdown'
  | 'sql'
  | 'properties'
  | 'query';

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
  extension: string;
  mime: string;
  /** 只能生成、无法从文本还原的格式（如 SQL INSERT），在「输入格式」里不出现。 */
  canParse?: boolean;
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

/* --------------------------- NDJSON --------------------------- */

function parseNdjson(text: string): unknown {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) {
    throw emptyInputError({
      zh: '请粘贴 NDJSON（每行一个 JSON）内容后再试。',
      en: 'Paste NDJSON content (one JSON value per line) and try again.',
    });
  }
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new ToolError(
        {
          zh: `NDJSON 解析失败：第 ${index + 1} 行不是合法 JSON。`,
          en: `NDJSON parsing failed: line ${index + 1} is not valid JSON.`,
        },
        {
          zh: '每行必须是一个完整独立的 JSON 值，行内不要换行。',
          en: 'Each line must be one complete JSON value with no line breaks inside it.',
        },
      );
    }
  });
}

function serializeNdjson(value: unknown): string {
  const records = Array.isArray(value) ? value : [value];
  return records.map((record) => JSON.stringify(record)).join('\n');
}

/* -------------------------- Markdown table -------------------------- */

function splitMarkdownRow(line: string): string[] {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((cell) => cell.trim());
}

function isMarkdownSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function parseMarkdownTable(text: string): unknown {
  const lines = text.split(/\r?\n/).filter((line) => line.includes('|'));
  const headerIndex = lines.findIndex(
    (_line, index) => index + 1 < lines.length && isMarkdownSeparator(lines[index + 1]),
  );
  if (headerIndex < 0) {
    throw new ToolError(
      { zh: '没有找到 Markdown 表格', en: 'No Markdown table found' },
      {
        zh: '表格需要表头行和分隔行，例如：| name | age | 换行 | --- | --- |。',
        en: 'A table needs a header row and a separator row, e.g. | name | age | then | --- | --- |.',
      },
    );
  }
  const header = splitMarkdownRow(lines[headerIndex]);
  return lines
    .slice(headerIndex + 2)
    .filter((line) => !isMarkdownSeparator(line))
    .map((line) => {
      const cells = splitMarkdownRow(line);
      const record: Record<string, string> = {};
      header.forEach((key, index) => {
        record[key] = cells[index] ?? '';
      });
      return record;
    });
}

function markdownCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function serializeMarkdownTable(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ToolError(
      { zh: 'Markdown 表格需要一个非空数组', en: 'Markdown table output requires a non-empty array' },
      {
        zh: '顶层结构应为对象数组，例如 [{ "name": "a" }]。',
        en: 'The top level should be an array of objects, e.g. [{ "name": "a" }].',
      },
    );
  }
  const columns: string[] = [];
  for (const record of value) {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
      throw new ToolError(
        { zh: 'Markdown 表格的元素必须是对象', en: 'Markdown table rows must be objects' },
        {
          zh: '嵌套结构可以先转成 JSON 字符串，或改用 JSON / YAML 输出。',
          en: 'Flatten nested values first, or output JSON / YAML instead.',
        },
      );
    }
    for (const key of Object.keys(record as Record<string, unknown>)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  const header = `| ${columns.join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const rows = value.map(
    (record) =>
      `| ${columns
        .map((column) => markdownCell((record as Record<string, unknown>)[column]))
        .join(' | ')} |`,
  );
  return [header, divider, ...rows].join('\n');
}

/* ------------------------------ SQL ------------------------------ */

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `'${text.replace(/'/g, "''")}'`;
}

function serializeSql(value: unknown, options: ConvertOptions): string {
  const records = Array.isArray(value) ? value : [value];
  if (records.length === 0) {
    throw new ToolError(
      { zh: '数组为空，无法生成 INSERT', en: 'The array is empty, so there is nothing to insert' },
      { zh: '请提供至少一条记录。', en: 'Provide at least one record.' },
    );
  }
  const table = options.rootName.trim() || 'data';
  const columns: string[] = [];
  for (const record of records) {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
      throw new ToolError(
        { zh: 'SQL INSERT 的元素必须是对象', en: 'SQL INSERT rows must be objects' },
        {
          zh: '顶层结构应为对象数组，例如 [{ "name": "a" }]。',
          en: 'The top level should be an array of objects, e.g. [{ "name": "a" }].',
        },
      );
    }
    for (const key of Object.keys(record as Record<string, unknown>)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  const columnList = columns.map((column) => `\`${column.replace(/`/g, '``')}\``).join(', ');
  const rows = records.map(
    (record) =>
      `  (${columns
        .map((column) => sqlLiteral((record as Record<string, unknown>)[column]))
        .join(', ')})`,
  );
  return `INSERT INTO \`${table.replace(/`/g, '``')}\` (${columnList}) VALUES\n${rows.join(',\n')};\n`;
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
    extension: 'json',
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
    extension: 'xml',
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
    extension: 'yaml',
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
    extension: 'csv',
    filename: 'data.csv',
    mime: 'text/csv;charset=utf-8',
    inputPlaceholder: {
      zh: '粘贴 CSV，例如 name,age\na,1',
      en: 'Paste CSV, e.g. name,age\na,1',
    },
    parse: (text, options) => parseCsv(text, options),
    serialize: (value) => serializeCsv(value),
  },
  ndjson: {
    id: 'ndjson',
    label: 'NDJSON',
    sample: SAMPLE_NDJSON,
    extension: 'ndjson',
    filename: 'data.ndjson',
    mime: 'application/x-ndjson;charset=utf-8',
    inputPlaceholder: {
      zh: '粘贴 NDJSON，每行一个 JSON 对象',
      en: 'Paste NDJSON, one JSON value per line',
    },
    parse: (text) => parseNdjson(text),
    serialize: (value) => serializeNdjson(value),
  },
  markdown: {
    id: 'markdown',
    label: 'Markdown',
    sample: SAMPLE_MARKDOWN_TABLE,
    extension: 'md',
    filename: 'data.md',
    mime: 'text/markdown;charset=utf-8',
    inputPlaceholder: {
      zh: '粘贴 Markdown 表格，例如 | name | age | 换行 | --- | --- |',
      en: 'Paste a Markdown table, e.g. | name | age | then | --- | --- |',
    },
    parse: (text) => parseMarkdownTable(text),
    serialize: (value) => serializeMarkdownTable(value),
  },
  sql: {
    id: 'sql',
    label: 'SQL INSERT',
    sample: SAMPLE_SQL_INSERT,
    extension: 'sql',
    filename: 'data.sql',
    mime: 'application/sql;charset=utf-8',
    canParse: false,
    inputPlaceholder: {
      zh: 'SQL 只能生成、无法反解，请从其他格式转入',
      en: 'SQL is output-only here; convert into it from another format',
    },
    parse: () => {
      throw new ToolError(
        { zh: '不支持从 SQL 文本解析', en: 'Parsing from SQL text is not supported' },
        { zh: '请把 JSON / CSV 等结构化数据转换为 SQL INSERT。', en: 'Convert JSON / CSV or other structured data into SQL INSERT instead.' },
      );
    },
    serialize: (value, options) => serializeSql(value, options),
  },
  properties: {
    id: 'properties',
    label: 'Properties',
    sample: SAMPLE_PROPERTIES,
    extension: 'properties',
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
    extension: 'txt',
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

export const FORMAT_ORDER: FormatId[] = [
  'json',
  'xml',
  'yaml',
  'csv',
  'ndjson',
  'markdown',
  'sql',
  'properties',
  'query',
];

/** 可解析的格式才能作为输入格式或批量转换的源格式。 */
export const PARSABLE_FORMATS: FormatId[] = FORMAT_ORDER.filter((id) => FORMATS[id].canParse !== false);

const EXTENSION_FORMAT: Record<string, DetectedFormat> = {
  json: 'json',
  ndjson: 'ndjson',
  jsonl: 'ndjson',
  ndjsonl: 'ndjson',
  xml: 'xml',
  html: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  csv: 'csv',
  tsv: 'csv',
  md: 'markdown',
  markdown: 'markdown',
  properties: 'properties',
  env: 'properties',
  ini: 'properties',
  txt: 'text',
  log: 'text',
};

export type DetectedFormat = FormatId | 'text';

/** 批量转换时按扩展名猜源格式；未知扩展名回退到「按内容嗅探」。 */
export function detectFormat(filename: string): DetectedFormat {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() : '';
  return EXTENSION_FORMAT[ext] ?? 'text';
}

/** 无扩展名（或 .txt/.log）时按内容判断：JSON 数组/对象 → NDJSON → YAML → CSV。 */
export function sniffFormat(text: string): FormatId {
  const trimmed = text.trim();
  if (!trimmed) return 'json';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      /* 继续按行判断 */
    }
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length > 1 && lines.every((line) => line.startsWith('{') || line.startsWith('['))) {
    try {
      parseNdjson(trimmed);
      return 'ndjson';
    } catch {
      /* 继续按内容嗅探 */
    }
  }
  if (lines.some((line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line))) return 'markdown';
  if (lines[0].includes('<')) return 'xml';
  if (lines.every((line) => line.includes('=')) || lines.every((line) => line.includes(':'))) return 'yaml';
  if (lines.length > 1 && lines[0].split(/[;,|\t]/).length > 1) return 'csv';
  return 'yaml';
}

export function convertFormat(
  text: string,
  from: FormatId,
  to: FormatId,
  options: ConvertOptions,
): string {
  const value = FORMATS[from].parse(text, options);
  return FORMATS[to].serialize(value, options);
}
