import yaml, { YAMLException } from 'js-yaml';
import { ToolError, errorHint } from './errors';

/** Java `.properties` 风格：key=value / key:value / key value，# 与 ! 注释，反斜杠续行与转义。 */

const ESCAPE_MAP: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  f: '\f',
};

function unescapeToken(token: string): string {
  let out = '';
  for (let i = 0; i < token.length; i += 1) {
    const char = token[i];
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = token[i + 1];
    if (next === undefined) {
      out += '\\';
      break;
    }
    if (next === 'u') {
      const hex = token.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16));
        i += 5;
        continue;
      }
    }
    out += ESCAPE_MAP[next] ?? next;
    i += 1;
  }
  return out;
}

function escapeKeySegment(key: string): string {
  return key
    .replace(/\\/g, '\\\\')
    .replace(/=/g, '\\=')
    .replace(/:/g, '\\:')
    .replace(/#/g, '\\#')
    .replace(/!/g, '\\!')
    .replace(/^ /g, '\\ ');
}

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/** 把物理行折叠成逻辑行：行尾奇数个反斜杠表示续行。 */
function toLogicalLines(text: string): string[] {
  const logical: string[] = [];
  let buffer: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line: string = buffer === null ? rawLine : rawLine.replace(/^\s+/, '');
    const trailing = /\\*$/.exec(line)?.[0].length ?? 0;
    if (trailing % 2 === 1) {
      buffer = (buffer ?? '') + line.slice(0, -1);
      continue;
    }
    logical.push(buffer === null ? line : buffer + line);
    buffer = null;
  }
  if (buffer !== null) logical.push(buffer);
  return logical;
}

/** 拆出 key 与 value：首个未转义的 `=`、`:` 或空白作为分隔符。 */
function splitKeyValue(line: string): [string, string] {
  let keyEnd = -1;
  let valueStart = -1;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '=' || char === ':') {
      if (keyEnd === -1) keyEnd = i;
      valueStart = i + 1;
      break;
    }
    if (/\s/.test(char)) {
      if (keyEnd === -1) keyEnd = i;
      // 空白分隔时，跳过空白后可选的一个 =/: 也算分隔符
      let j = i;
      while (j < line.length && /\s/.test(line[j])) j += 1;
      if (line[j] === '=' || line[j] === ':') j += 1;
      valueStart = j;
      break;
    }
  }

  if (valueStart === -1) {
    const trimmed = line.trim();
    return [unescapeToken(trimmed), ''];
  }
  const key = keyEnd === -1 ? '' : line.slice(0, keyEnd);
  return [unescapeToken(key.trim()), unescapeToken(line.slice(valueStart).trim())];
}

export function parseProperties(text: string): Record<string, string> {
  if (!text.trim()) {
    throw new ToolError(
      { zh: '输入内容为空', en: 'Input is empty' },
      { zh: '请粘贴 Properties 内容后再试。', en: 'Paste Properties content and try again.' },
    );
  }
  const result: Record<string, string> = {};
  for (const line of toLogicalLines(text)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    const [key, value] = splitKeyValue(line);
    if (!key) {
      throw new ToolError(
        { zh: 'Properties 解析失败', en: 'Properties parsing failed' },
        {
          zh: `存在没有键名的行：「${trimmed.slice(0, 60)}」`,
          en: `Line without a key name: "${trimmed.slice(0, 60)}"`,
        },
      );
    }
    result[key] = value;
  }
  return result;
}

interface PathStep {
  key: string;
  index: number | null;
}

/** 把 `a.b[0].c` 拆成导航步骤；非数字方括号按字面键名处理。 */
function parsePropertyPath(path: string): PathStep[] {
  const steps: PathStep[] = [];
  for (const chunk of path.split('.')) {
    const match = /^([^[\]]*)((?:\[\d+\])+)$/.exec(chunk);
    if (!match) {
      steps.push({ key: chunk, index: null });
      continue;
    }
    if (match[1] !== '') steps.push({ key: match[1], index: null });
    for (const digits of match[2].match(/\d+/g) ?? []) {
      steps.push({ key: '', index: Number(digits) });
    }
  }
  return steps;
}

/** 将扁平点号 / 方括号键展开为嵌套对象与数组。 */
export function expandPropertyKeys(flat: Record<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {};

  for (const [path, value] of Object.entries(flat)) {
    const steps = parsePropertyPath(path);
    if (!steps.length || steps[0].index !== null) {
      throw new ToolError(
        { zh: 'Properties 键格式不正确', en: 'Properties key has invalid format' },
        {
          zh: `键「${path}」不能以数组索引起头。`,
          en: `Key "${path}" cannot start with an array index.`,
        },
      );
    }
    let cursor: Record<string, unknown> | unknown[] = root;

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const next = steps[i + 1];
      const isLast = next === undefined;

      if (step.index !== null) {
        if (!Array.isArray(cursor)) {
          throw new ToolError(
            { zh: 'Properties 键冲突', en: 'Properties key conflict' },
            {
              zh: `键「${path}」要求数组，但父级不是数组。`,
              en: `Key "${path}" requires an array, but the parent is not an array.`,
            },
          );
        }
        while (cursor.length <= step.index) cursor.push(undefined);
        if (isLast) {
          cursor[step.index] = value;
          break;
        }
        const existingItem = cursor[step.index];
        if (next.index === null) {
          if (existingItem !== undefined && (typeof existingItem !== 'object' || Array.isArray(existingItem))) {
            throw new ToolError(
              { zh: 'Properties 键冲突', en: 'Properties key conflict' },
              {
                zh: `键「${path}」与已有值冲突。`,
                en: `Key "${path}" conflicts with an existing value.`,
              },
            );
          }
          if (existingItem === undefined) cursor[step.index] = {};
          cursor = cursor[step.index] as Record<string, unknown>;
        } else {
          if (existingItem !== undefined && !Array.isArray(existingItem)) {
            throw new ToolError(
              { zh: 'Properties 键冲突', en: 'Properties key conflict' },
              {
                zh: `键「${path}」要求数组，但已有值不是数组。`,
                en: `Key "${path}" requires an array, but the existing value is not an array.`,
              },
            );
          }
          if (existingItem === undefined) cursor[step.index] = [];
          cursor = cursor[step.index] as unknown[];
        }
        continue;
      }

      if (Array.isArray(cursor)) {
        throw new ToolError(
          { zh: 'Properties 键冲突', en: 'Properties key conflict' },
          {
            zh: `键「${path}」要求对象，但父级是数组。`,
            en: `Key "${path}" requires an object, but the parent is an array.`,
          },
        );
      }
      if (isLast) {
        cursor[step.key] = value;
        break;
      }
      const existing = cursor[step.key];
      if (next.index === null) {
        if (existing !== undefined && (typeof existing !== 'object' || Array.isArray(existing))) {
          throw new ToolError(
            { zh: 'Properties 键冲突', en: 'Properties key conflict' },
            {
              zh: `键「${path}」与已有值冲突。`,
              en: `Key "${path}" conflicts with an existing value.`,
            },
          );
        }
        if (existing === undefined) cursor[step.key] = {};
        cursor = cursor[step.key] as Record<string, unknown>;
      } else {
        if (existing !== undefined && !Array.isArray(existing)) {
          throw new ToolError(
            { zh: 'Properties 键冲突', en: 'Properties key conflict' },
            {
              zh: `键「${path}」要求数组，但已有值不是数组。`,
              en: `Key "${path}" requires an array, but the existing value is not an array.`,
            },
          );
        }
        if (existing === undefined) cursor[step.key] = [];
        cursor = cursor[step.key] as unknown[];
      }
    }
  }

  const fillGaps = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : fillGaps(item)));
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        out[key] = item === undefined ? null : fillGaps(item);
      }
      return out;
    }
    return value;
  };
  return fillGaps(root) as Record<string, unknown>;
}

/** 嵌套对象 / 数组拍平为 `a.b`、`a[0]` 形式的 Properties 文本。 */
export function flattenToProperties(value: unknown, sortKeys = false): string {
  if (value === null || typeof value !== 'object') {
    throw new ToolError(
      { zh: '内容无法转成 Properties', en: 'Content cannot be converted to Properties' },
      { zh: '顶层结构需要是对象或数组。', en: 'The top-level structure must be an object or array.' },
    );
  }
  const lines: string[] = [];

  const walk = (node: unknown, prefix: string) => {
    if (Array.isArray(node)) {
      if (!node.length) lines.push(`${prefix}=`);
      node.forEach((item, index) => walk(item, `${prefix}[${index}]`));
      return;
    }
    if (node !== null && typeof node === 'object') {
      const entries = Object.entries(node as Record<string, unknown>);
      if (sortKeys) entries.sort(([a], [b]) => a.localeCompare(b));
      if (!entries.length) {
        if (prefix) lines.push(`${prefix}=`);
        return;
      }
      for (const [key, child] of entries) {
        walk(child, prefix ? `${prefix}.${escapeKeySegment(key)}` : escapeKeySegment(key));
      }
      return;
    }
    lines.push(`${prefix}=${escapeValue(node === null || node === undefined ? '' : String(node))}`);
  };

  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, String(index)));
  } else {
    walk(value, '');
  }
  return lines.join('\n');
}

export interface PropertiesToYamlOptions {
  indent?: number;
  expandDots?: boolean;
  sortKeys?: boolean;
}

export function propertiesToYaml(text: string, options: PropertiesToYamlOptions = {}): string {
  const { indent = 2, expandDots = true, sortKeys = false } = options;
  let flat = parseProperties(text);
  if (sortKeys) {
    flat = Object.fromEntries(Object.entries(flat).sort(([a], [b]) => a.localeCompare(b)));
  }
  const value = expandDots ? expandPropertyKeys(flat) : flat;
  return yaml.dump(value, {
    indent,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
  });
}

export interface YamlToPropertiesOptions {
  sortKeys?: boolean;
}

export function yamlToProperties(text: string, options: YamlToPropertiesOptions = {}): string {
  if (!text.trim()) {
    throw new ToolError(
      { zh: '输入内容为空', en: 'Input is empty' },
      { zh: '请粘贴 YAML 内容后再试。', en: 'Paste YAML content and try again.' },
    );
  }
  let value: unknown;
  try {
    value = yaml.load(text, { filename: 'input.yaml' });
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
  if (value === null || value === undefined) {
    throw new ToolError(
      { zh: 'YAML 内容为空', en: 'YAML content is empty' },
      { zh: '请提供至少一个键值对。', en: 'Provide at least one key-value pair.' },
    );
  }
  return flattenToProperties(value, options.sortKeys ?? false);
}
