import yaml, { YAMLException } from 'js-yaml';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import Papa from 'papaparse';
import { ToolError, errorHint } from './errors';
import { parseJson, sortKeysDeep } from './json';

export function jsonToYaml(text: string, indent = 2, sortKeys = false): string {
  const value = parseJson(text);
  const normalized = sortKeys ? sortKeysDeep(value) : value;

  try {
    return yaml.dump(normalized, {
      indent,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
    });
  } catch (error) {
    throw new ToolError(
      { zh: 'JSON 转 YAML 失败', en: 'JSON to YAML conversion failed' },
      errorHint(error, { zh: '请检查 JSON 内容是否合法。', en: 'Check that the JSON content is valid.' }),
    );
  }
}

export function yamlToJson(text: string, indent = 2): string {
  if (!text.trim()) {
    throw new ToolError(
      { zh: '输入内容为空', en: 'Input is empty' },
      { zh: '请粘贴 YAML 内容后再试。', en: 'Paste YAML content and try again.' },
    );
  }

  try {
    const value = yaml.load(text, { filename: 'input.yaml' });
    return JSON.stringify(value ?? null, null, indent);
  } catch (error) {
    if (error instanceof YAMLException) {
      const line = (error.mark?.line ?? 0) + 1;
      const column = (error.mark?.column ?? 0) + 1;
      throw new ToolError(
        {
          zh: `YAML 解析失败：第 ${line} 行第 ${column} 列，${error.reason || '语法不正确'}。`,
          en: `YAML parsing failed: line ${line}, column ${column}, ${error.reason || '语法不正确'}.`,
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

export interface XmlParseOptions {
  keepAttributes: boolean;
}

export function xmlToJson(text: string, options: XmlParseOptions): string {
  if (!text.trim()) {
    throw new ToolError(
      { zh: '输入内容为空', en: 'Input is empty' },
      { zh: '请粘贴 XML 内容后再试。', en: 'Paste XML content and try again.' },
    );
  }

  try {
    const parser = new XMLParser({
      ignoreAttributes: !options.keepAttributes,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      trimValues: true,
      parseTagValue: true,
      parseAttributeValue: true,
    });
    const value: unknown = parser.parse(text);
    return JSON.stringify(value, null, 2);
  } catch (error) {
    throw new ToolError(
      { zh: 'XML 解析失败', en: 'XML parsing failed' },
      errorHint(error, { zh: '请检查标签是否正确闭合。', en: 'Check that tags are closed correctly.' }),
    );
  }
}

export function jsonToXml(text: string, rootName: string): string {
  const value = parseJson(text);
  const root = rootName.trim() || 'root';
  const wrapped = Array.isArray(value) ? { [root]: { item: value } } : { [root]: value };

  try {
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      format: true,
      indentBy: '  ',
      suppressEmptyNode: true,
      processEntities: true,
    });
    return builder.build(wrapped) as string;
  } catch (error) {
    throw new ToolError(
      { zh: 'JSON 转 XML 失败', en: 'JSON to XML conversion failed' },
      errorHint(error, { zh: '请检查 JSON 内容是否合法。', en: 'Check that the JSON content is valid.' }),
    );
  }
}

export function jsonToCsv(text: string): string {
  const value = parseJson(text);
  if (!Array.isArray(value)) {
    throw new ToolError(
      { zh: 'JSON 转 CSV 需要一个数组', en: 'JSON to CSV requires an array' },
      {
        zh: '顶层结构应为对象数组，例如 [{ "name": "a" }]。',
        en: 'The top-level structure should be an array of objects, e.g. [{ "name": "a" }].',
      },
    );
  }
  if (value.length === 0) {
    throw new ToolError(
      { zh: 'JSON 数组为空', en: 'JSON array is empty' },
      { zh: '请提供至少一条记录。', en: 'Provide at least one record.' },
    );
  }

  try {
    return Papa.unparse(value, { quotes: false, newline: '\n' });
  } catch (error) {
    throw new ToolError(
      { zh: 'JSON 转 CSV 失败', en: 'JSON to CSV conversion failed' },
      errorHint(error, { zh: '请检查数组元素是否为对象。', en: 'Check that the array elements are objects.' }),
    );
  }
}

export interface CsvParseOptions {
  delimiter: string;
  hasHeader: boolean;
}

export function csvToJson(text: string, options: CsvParseOptions): string {
  if (!text.trim()) {
    throw new ToolError(
      { zh: '输入内容为空', en: 'Input is empty' },
      { zh: '请粘贴 CSV 内容后再试。', en: 'Paste CSV content and try again.' },
    );
  }

  const result = Papa.parse<Record<string, string> | string[]>(text.trim(), {
    header: options.hasHeader,
    delimiter: options.delimiter,
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

  return JSON.stringify(result.data, null, 2);
}

export function detectCsvDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}
