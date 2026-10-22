import { ToolError } from './errors';
import type { L10n } from '@/i18n/locale';

export interface SchemaIssue {
  path: string;
  message: L10n;
}

export interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaIssue[];
}

type SchemaLike = unknown;

const JSON_TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'] as const;
type JsonTypeName = (typeof JSON_TYPES)[number];

const MAX_DEPTH = 64;
const MAX_ISSUES = 200;

function typeNameOf(value: unknown): JsonTypeName {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'number':
      return Number.isFinite(value) ? 'number' : 'string';
    default:
      return 'object';
  }
}

function matchesType(value: unknown, expected: string): boolean {
  if (expected === 'integer') {
    return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
  }
  return typeNameOf(value) === expected;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length && keysA.every((key) => deepEqual(a[key], b[key]));
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  if (value === undefined) return 'undefined';
  const text = JSON.stringify(value);
  return text && text.length > 40 ? `${text.slice(0, 40)}…` : String(text);
}

function resolveRef(ref: string, root: unknown): SchemaLike {
  if (!ref.startsWith('#')) {
    throw new ToolError({
      zh: `不支持远程引用：${ref}`,
      en: `Remote $ref is not supported: ${ref}`,
    });
  }
  const pointer = decodeURIComponent(ref.slice(1)).replace(/^\/+/, '');
  let current: unknown = root;
  if (!pointer) return root;
  for (const rawSegment of pointer.split('/')) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        throw new ToolError({ zh: `$ref 无法解析：${ref}`, en: `$ref cannot be resolved: ${ref}` });
      }
      current = current[index];
    } else if (isPlainObject(current) && segment in current) {
      current = current[segment];
    } else {
      throw new ToolError({ zh: `$ref 无法解析：${ref}`, en: `$ref cannot be resolved: ${ref}` });
    }
  }
  return current;
}

function issue(issues: SchemaIssue[], path: string, message: L10n) {
  if (issues.length < MAX_ISSUES) issues.push({ path, message });
}

function validateNode(value: unknown, schema: SchemaLike, root: unknown, path: string, depth: number, issues: SchemaIssue[]) {
  if (depth > MAX_DEPTH) {
    throw new ToolError({ zh: 'Schema 递归过深（可能存在循环 $ref）', en: 'Schema recursion is too deep (likely a circular $ref)' });
  }
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    issue(issues, path, { zh: '该路径不允许存在任何值', en: 'No value is allowed at this path' });
    return;
  }
  if (!isPlainObject(schema)) {
    throw new ToolError({ zh: 'Schema 必须是对象或布尔值', en: 'A schema must be an object or a boolean' });
  }
  if (typeof schema.$ref === 'string') {
    validateNode(value, resolveRef(schema.$ref, root), root, path, depth + 1, issues);
    return;
  }

  if (typeof schema.type === 'string' || Array.isArray(schema.type)) {
    const allowed = (Array.isArray(schema.type) ? schema.type : [schema.type]) as string[];
    for (const name of allowed) {
      if (!JSON_TYPES.includes(name as JsonTypeName)) {
        throw new ToolError({ zh: `未知的类型名：${name}`, en: `Unknown type name: ${name}` });
      }
    }
    if (!allowed.some((name) => matchesType(value, name))) {
      const want = allowed.join(' | ');
      issue(issues, path, {
        zh: `期望类型 ${want}，实际为 ${typeNameOf(value)}`,
        en: `Expected type ${want}, got ${typeNameOf(value)}`,
      });
      return;
    }
  }

  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some((candidate: unknown) => deepEqual(candidate, value))) {
      issue(issues, path, {
        zh: `取值不在枚举中：${schema.enum.map(displayValue).join(' / ')}`,
        en: `Value is not one of the enum: ${schema.enum.map(displayValue).join(' / ')}`,
      });
    }
  }

  if ('const' in schema && !deepEqual(schema.const, value)) {
    issue(issues, path, {
      zh: `取值必须等于常量 ${displayValue(schema.const)}`,
      en: `Value must equal the constant ${displayValue(schema.const)}`,
    });
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      issue(issues, path, { zh: `数值应 ≥ ${schema.minimum}，实际为 ${value}`, en: `Number should be >= ${schema.minimum}, got ${value}` });
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      issue(issues, path, { zh: `数值应 ≤ ${schema.maximum}，实际为 ${value}`, en: `Number should be <= ${schema.maximum}, got ${value}` });
    }
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
      issue(issues, path, { zh: `数值应 > ${schema.exclusiveMinimum}，实际为 ${value}`, en: `Number should be > ${schema.exclusiveMinimum}, got ${value}` });
    }
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) {
      issue(issues, path, { zh: `数值应 < ${schema.exclusiveMaximum}，实际为 ${value}`, en: `Number should be < ${schema.exclusiveMaximum}, got ${value}` });
    }
    if (typeof schema.multipleOf === 'number' && schema.multipleOf > 0) {
      const ratio = value / schema.multipleOf;
      if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
        issue(issues, path, { zh: `数值应为 ${schema.multipleOf} 的整数倍`, en: `Number should be a multiple of ${schema.multipleOf}` });
      }
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      issue(issues, path, { zh: `长度应 ≥ ${schema.minLength}，实际为 ${value.length}`, en: `Length should be >= ${schema.minLength}, got ${value.length}` });
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      issue(issues, path, { zh: `长度应 ≤ ${schema.maxLength}，实际为 ${value.length}`, en: `Length should be <= ${schema.maxLength}, got ${value.length}` });
    }
    if (typeof schema.pattern === 'string') {
      let re: RegExp;
      try {
        re = new RegExp(schema.pattern, 'u');
      } catch {
        throw new ToolError({ zh: `Schema 中的 pattern 不是合法正则：${schema.pattern}`, en: `Invalid regex in schema pattern: ${schema.pattern}` });
      }
      if (!re.test(value)) {
        issue(issues, path, { zh: `字符串不匹配 pattern /${schema.pattern}/`, en: `String does not match pattern /${schema.pattern}/` });
      }
    }
  }

  if (isPlainObject(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!(key in value)) {
          issue(issues, path, { zh: `缺少必填属性 "${key}"`, en: `Missing required property "${key}"` });
        }
      }
    }
    if (typeof schema.minProperties === 'number' && Object.keys(value).length < schema.minProperties) {
      issue(issues, path, { zh: `属性数量应 ≥ ${schema.minProperties}`, en: `Object should have at least ${schema.minProperties} properties` });
    }
    if (typeof schema.maxProperties === 'number' && Object.keys(value).length > schema.maxProperties) {
      issue(issues, path, { zh: `属性数量应 ≤ ${schema.maxProperties}`, en: `Object should have at most ${schema.maxProperties} properties` });
    }
    const properties = isPlainObject(schema.properties) ? schema.properties : undefined;
    if (properties) {
      for (const [key, childSchema] of Object.entries(properties)) {
        if (key in value) {
          validateNode(value[key], childSchema, root, `${path}.${key}`, depth + 1, issues);
        }
      }
    }
    const patternProperties = isPlainObject(schema.patternProperties) ? schema.patternProperties : undefined;
    if (patternProperties) {
      for (const [pattern, childSchema] of Object.entries(patternProperties)) {
        let re: RegExp;
        try {
          re = new RegExp(pattern, 'u');
        } catch {
          throw new ToolError({ zh: `Schema 中的 patternProperties 不是合法正则：${pattern}`, en: `Invalid regex in patternProperties: ${pattern}` });
        }
        for (const [key, child] of Object.entries(value)) {
          if (re.test(key)) validateNode(child, childSchema, root, `${path}.${key}`, depth + 1, issues);
        }
      }
    }
    const matched = new Set<string>(Object.keys(properties ?? {}).filter((key) => key in value));
    if (patternProperties) {
      for (const key of Object.keys(value)) {
        for (const pattern of Object.keys(patternProperties)) {
          if (new RegExp(pattern, 'u').test(key)) matched.add(key);
        }
      }
    }
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) {
      for (const key of Object.keys(value)) {
        if (matched.has(key)) continue;
        if (schema.additionalProperties === false) {
          issue(issues, `${path}.${key}`, { zh: `不允许的属性 "${key}"`, en: `Property "${key}" is not allowed` });
        } else {
          validateNode(value[key], schema.additionalProperties, root, `${path}.${key}`, depth + 1, issues);
        }
      }
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      issue(issues, path, { zh: `数组长度应 ≥ ${schema.minItems}，实际为 ${value.length}`, en: `Array should have at least ${schema.minItems} items, got ${value.length}` });
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      issue(issues, path, { zh: `数组长度应 ≤ ${schema.maxItems}，实际为 ${value.length}`, en: `Array should have at most ${schema.maxItems} items, got ${value.length}` });
    }
    if (schema.uniqueItems === true) {
      for (let i = 0; i < value.length; i += 1) {
        for (let j = i + 1; j < value.length; j += 1) {
          if (deepEqual(value[i], value[j])) {
            issue(issues, `${path}[${j}]`, { zh: `元素与 [${i}] 重复，但 uniqueItems 要求互异`, en: `Item duplicates [${i}] but uniqueItems requires distinct values` });
            i = value.length;
            break;
          }
        }
      }
    }
    if (Array.isArray(schema.items)) {
      schema.items.forEach((childSchema: SchemaLike, index: number) => {
        if (index < value.length) validateNode(value[index], childSchema, root, `${path}[${index}]`, depth + 1, issues);
      });
      if (schema.additionalItems === false && value.length > schema.items.length) {
        issue(issues, path, {
          zh: `元组最多 ${schema.items.length} 项，实际为 ${value.length}`,
          en: `Tuple allows at most ${schema.items.length} items, got ${value.length}`,
        });
      } else if (isPlainObject(schema.additionalItems) || schema.additionalItems === true) {
        for (let index = schema.items.length; index < value.length; index += 1) {
          validateNode(value[index], schema.additionalItems, root, `${path}[${index}]`, depth + 1, issues);
        }
      }
    } else if (schema.items !== undefined) {
      value.forEach((item, index) => validateNode(item, schema.items, root, `${path}[${index}]`, depth + 1, issues));
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf as SchemaLike[]) validateNode(value, sub, root, path, depth + 1, issues);
  }
  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf as SchemaLike[];
    if (!branches.some((sub) => collectIssues(value, sub, root, depth).length === 0)) {
      issue(issues, path, { zh: '值必须至少匹配 anyOf 中的一个子 Schema', en: 'Value must match at least one anyOf subschema' });
    }
  }
  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf as SchemaLike[];
    const matched = branches.filter((sub) => collectIssues(value, sub, root, depth).length === 0).length;
    if (matched !== 1) {
      issue(issues, path, {
        zh: `值必须恰好匹配 oneOf 中的一个子 Schema，实际匹配 ${matched} 个`,
        en: `Value must match exactly one oneOf subschema, matched ${matched}`,
      });
    }
  }
  if (schema.not !== undefined && collectIssues(value, schema.not, root, depth).length === 0) {
    issue(issues, path, { zh: '值不允许匹配 not 中定义的 Schema', en: 'Value must not match the "not" subschema' });
  }
}

function collectIssues(value: unknown, schema: SchemaLike, root: unknown, depth: number): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  validateNode(value, schema, root, '$', depth, issues);
  return issues;
}

export function validateAgainstSchema(data: unknown, schema: unknown): SchemaValidationResult {
  if (schema === null || (!isPlainObject(schema) && typeof schema !== 'boolean')) {
    throw new ToolError({
      zh: 'Schema 必须是 JSON 对象（或布尔 true / false）',
      en: 'Schema must be a JSON object (or the boolean true / false)',
    });
  }
  const issues: SchemaIssue[] = [];
  validateNode(data, schema, schema, '$', 0, issues);
  return { valid: issues.length === 0, issues };
}

function typesOf(schema: Record<string, unknown>): string[] {
  if (typeof schema.type === 'string') return [schema.type];
  if (Array.isArray(schema.type)) return schema.type as string[];
  return [];
}

function mergeSchemas(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const aType = typesOf(a);
  const bType = typesOf(b);
  if (JSON.stringify(a) === JSON.stringify(b)) return structuredClone(a);
  if (aType.includes('object') && bType.includes('object')) {
    const propsA = isPlainObject(a.properties) ? a.properties : {};
    const propsB = isPlainObject(b.properties) ? b.properties : {};
    const merged: Record<string, unknown> = { ...propsA };
    for (const [key, schema] of Object.entries(propsB)) {
      merged[key] = key in propsA && isPlainObject(merged[key]) && isPlainObject(schema)
        ? mergeSchemas(merged[key] as Record<string, unknown>, schema)
        : schema;
    }
    const requiredA = new Set(Array.isArray(a.required) ? (a.required as string[]) : []);
    const requiredB = Array.isArray(b.required) ? (b.required as string[]) : [];
    return {
      type: 'object',
      properties: merged,
      required: requiredB.filter((key) => requiredA.has(key)),
    };
  }
  if (aType.includes('array') && bType.includes('array') && isPlainObject(a.items) && isPlainObject(b.items)) {
    return {
      type: 'array',
      items: mergeSchemas(a.items as Record<string, unknown>, b.items as Record<string, unknown>),
    };
  }
  const types = [...new Set([...aType, ...bType])].sort();
  return { type: types.length === 1 ? types[0] : types };
}

function inferNode(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array', items: true };
    let items: Record<string, unknown> = inferNode(value[0]);
    for (const item of value.slice(1)) {
      items = mergeSchemas(items, inferNode(item));
      if (typesOf(items).length > 4) break;
    }
    return { type: 'array', items };
  }
  if (isPlainObject(value)) {
    const properties: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      properties[key] = inferNode(child);
    }
    return { type: 'object', properties, required: Object.keys(value) };
  }
  if (typeof value === 'number') {
    return { type: Number.isInteger(value) ? 'integer' : 'number' };
  }
  if (typeof value === 'string') return { type: 'string' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  return {};
}

export function inferJsonSchema(value: unknown): Record<string, unknown> {
  const root = inferNode(value);
  return { $schema: 'http://json-schema.org/draft-07/schema#', ...root };
}
