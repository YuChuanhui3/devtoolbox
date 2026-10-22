import { capitalize, splitWords } from './codegenShared';

import { EMITTERS } from './codegenEmitters';
import type { Localized } from '@/i18n/locale';

export type CodeLanguage =
  | 'typescript'
  | 'java'
  | 'go'
  | 'csharp'
  | 'python'
  | 'php'
  | 'rust'
  | 'swift'
  | 'kotlin'
  | 'dart'
  | 'objective-c'
  | 'cpp'
  | 'ruby';

export type NamingStyle = 'camel' | 'pascal' | 'snake' | 'preserve';

export interface CodeGenOptions {
  language: CodeLanguage;
  naming: NamingStyle;
  rootName: string;
  comments: boolean;
  handleNull: boolean;
}

export interface LanguageMeta {
  value: CodeLanguage;
  label: string;
  extension: string;
}

export const CODE_LANGUAGES: LanguageMeta[] = [
  { value: 'typescript', label: 'TypeScript', extension: 'ts' },
  { value: 'java', label: 'Java', extension: 'java' },
  { value: 'go', label: 'Go', extension: 'go' },
  { value: 'csharp', label: 'C#', extension: 'cs' },
  { value: 'python', label: 'Python', extension: 'py' },
  { value: 'php', label: 'PHP', extension: 'php' },
  { value: 'rust', label: 'Rust', extension: 'rs' },
  { value: 'swift', label: 'Swift', extension: 'swift' },
  { value: 'kotlin', label: 'Kotlin', extension: 'kt' },
  { value: 'dart', label: 'Dart', extension: 'dart' },
  { value: 'objective-c', label: 'Objective-C', extension: 'h' },
  { value: 'cpp', label: 'C++', extension: 'hpp' },
  { value: 'ruby', label: 'Ruby', extension: 'rb' },
];

export const NAMING_STYLES: Array<{ value: NamingStyle; label: string }> = [
  { value: 'camel', label: '小驼峰' },
  { value: 'pascal', label: '大驼峰' },
  { value: 'snake', label: '下划线' },
  { value: 'preserve', label: '保持原样' },
];

export const DEFAULT_CODE_GEN_OPTIONS: CodeGenOptions = {
  language: 'typescript',
  naming: 'camel',
  rootName: 'RootData',
  comments: true,
  handleNull: true,
};

export function getLanguageMeta(language: CodeLanguage): LanguageMeta {
  return CODE_LANGUAGES.find((item) => item.value === language) ?? CODE_LANGUAGES[0];
}

export interface CodeGenRequest {
  id: number;
  json: string;
  options: CodeGenOptions;
}

export type CodeGenResponse = { id: number } & (
  | { ok: true; code: string; nodeCount: number; durationMs: number }
  | {
      ok: false;
      error: { message: Localized; hint?: Localized; line?: number; column?: number };
      nodeCount: number;
      durationMs: number;
    }
);

interface ScalarType {
  kind: 'string' | 'boolean' | 'any' | 'null';
  nullable?: boolean;
}

interface NumberType {
  kind: 'number';
  integer: boolean;
  nullable?: boolean;
}

interface ArrayType {
  kind: 'array';
  element: TypeNode;
  nullable?: boolean;
}

export interface ObjectField {
  rawKey: string;
  key: string;
  type: TypeNode;
  optional: boolean;
}

interface ObjectType {
  kind: 'object';
  suggestedName: string;
  name: string;
  fields: ObjectField[];
  nullable?: boolean;
}

export type TypeNode = ScalarType | NumberType | ArrayType | ObjectType;

interface BuildPlan {
  root: TypeNode;
  rootName: string;
  objects: ObjectType[];
}

export interface GeneratorContext {
  options: CodeGenOptions;
  plan: BuildPlan;
}

const CLASS_RESERVED = new Set([
  'Self',
  'Any',
  'Class',
  'Object',
  'String',
  'Number',
  'Boolean',
  'Array',
  'List',
  'Map',
  'Set',
  'Date',
  'Error',
  'Optional',
  'Result',
  'Type',
  'Value',
]);

const BASE_RESERVED = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
]);

const LANGUAGE_RESERVED: Record<CodeLanguage, string[]> = {
  typescript: [
    'abstract', 'any', 'as', 'async', 'await', 'declare', 'delete', 'implements', 'infer',
    'interface', 'is', 'keyof', 'let', 'namespace', 'never', 'of', 'private', 'protected',
    'public', 'readonly', 'static', 'type', 'undefined', 'unknown', 'yield',
  ],
  java: [
    'abstract', 'assert', 'boolean', 'byte', 'char', 'double', 'final', 'float', 'goto',
    'implements', 'int', 'interface', 'long', 'native', 'package', 'private', 'protected',
    'public', 'short', 'static', 'strictfp', 'synchronized', 'throws', 'transient', 'volatile',
  ],
  go: ['chan', 'defer', 'fallthrough', 'func', 'go', 'goto', 'interface', 'map', 'package', 'range', 'select', 'struct', 'type', 'var'],
  csharp: [
    'abstract', 'as', 'base', 'bool', 'byte', 'char', 'checked', 'decimal', 'delegate',
    'double', 'event', 'explicit', 'extern', 'fixed', 'float', 'implicit', 'int', 'internal',
    'is', 'lock', 'long', 'namespace', 'object', 'operator', 'out', 'override', 'params',
    'private', 'protected', 'public', 'readonly', 'ref', 'sbyte', 'sealed', 'short', 'sizeof',
    'stackalloc', 'static', 'string', 'struct', 'uint', 'ulong', 'unchecked', 'unsafe',
    'ushort', 'using', 'virtual', 'volatile', 'record', 'dynamic',
  ],
  python: [
    'and', 'as', 'assert', 'async', 'await', 'def', 'del', 'elif', 'except', 'from', 'global',
    'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'yield', 'None', 'True', 'False',
    'match', 'case',
  ],
  php: [
    'abstract', 'and', 'array', 'as', 'callable', 'clone', 'declare', 'echo', 'elseif', 'empty',
    'eval', 'exit', 'final', 'fn', 'foreach', 'global', 'goto', 'implements', 'include',
    'include_once', 'insteadof', 'interface', 'isset', 'list', 'match', 'namespace', 'or',
    'print', 'private', 'protected', 'public', 'readonly', 'require', 'require_once', 'static',
    'trait', 'unset', 'use', 'xor', 'yield',
  ],
  rust: [
    'as', 'async', 'await', 'const', 'crate', 'dyn', 'extern', 'fn', 'impl', 'let', 'loop',
    'match', 'mod', 'move', 'mut', 'pub', 'ref', 'self', 'Self', 'static', 'struct', 'trait',
    'type', 'unsafe', 'use', 'where', 'abstract', 'become', 'box', 'final', 'macro', 'override',
    'priv', 'typeof', 'unsized', 'virtual', 'yield', 'try',
  ],
  swift: [
    'associatedtype', 'deinit', 'extension', 'fileprivate', 'func', 'init', 'inout', 'internal',
    'let', 'open', 'operator', 'protocol', 'public', 'rethrows', 'static', 'struct',
    'subscript', 'typealias', 'guard', 'repeat', 'defer', 'fallthrough', 'where', 'Any',
    'catch', 'self', 'Self', 'throws', 'nil',
  ],
  kotlin: [
    'as', 'fun', 'in', 'interface', 'object', 'package', 'typealias', 'typeof', 'val', 'var',
    'when', 'by', 'constructor', 'delegate', 'dynamic', 'field', 'file', 'get', 'init',
    'param', 'property', 'receiver', 'set', 'setparam', 'where', 'actual', 'annotation',
    'companion', 'crossinline', 'data', 'expect', 'external', 'final', 'infix', 'inline',
    'inner', 'internal', 'lateinit', 'noinline', 'open', 'operator', 'out', 'override',
    'private', 'protected', 'public', 'reified', 'sealed', 'suspend', 'tailrec', 'vararg',
  ],
  dart: [
    'abstract', 'as', 'assert', 'async', 'await', 'covariant', 'deferred', 'dynamic',
    'extension', 'external', 'factory', 'Function', 'get', 'hide', 'implements', 'interface',
    'is', 'late', 'library', 'mixin', 'on', 'operator', 'part', 'required', 'rethrow', 'set',
    'show', 'static', 'sync', 'typedef', 'when',
  ],
  'objective-c': [
    'auto', 'char', 'double', 'extern', 'float', 'goto', 'inline', 'int', 'long', 'register',
    'restrict', 'short', 'signed', 'sizeof', 'static', 'struct', 'typedef', 'union',
    'unsigned', 'volatile', 'id', 'self', 'super', 'nil', 'YES', 'NO', 'BOOL', 'Class', 'SEL',
    'IMP',
  ],
  cpp: [
    'alignas', 'alignof', 'and', 'and_eq', 'asm', 'auto', 'bitand', 'bitor', 'bool', 'char',
    'char8_t', 'char16_t', 'char32_t', 'compl', 'concept', 'consteval', 'constexpr',
    'constinit', 'const_cast', 'co_await', 'co_return', 'co_yield', 'decltype', 'delete',
    'double', 'dynamic_cast', 'explicit', 'float', 'friend', 'inline', 'int', 'long',
    'mutable', 'namespace', 'noexcept', 'not', 'not_eq', 'nullptr', 'operator', 'or', 'or_eq',
    'private', 'protected', 'public', 'register', 'reinterpret_cast', 'requires', 'short',
    'signed', 'size_t', 'static', 'static_assert', 'static_cast', 'template', 'thread_local',
    'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using', 'virtual', 'wchar_t', 'xor',
    'xor_eq',
  ],
  ruby: [
    'alias', 'begin', 'def', 'defined?', 'elsif', 'ensure', 'module', 'next', 'nil', 'redo',
    'rescue', 'retry', 'self', 'then', 'undef', 'unless', 'until', 'when', 'yield', '__FILE__',
    '__LINE__',
  ],
};

function toPascal(raw: string): string {
  return splitWords(raw)
    .map((word) => capitalize(word.toLowerCase()))
    .join('');
}

function makeClassName(raw: string, fallback: string): string {
  let name = toPascal(raw);
  if (!name) name = fallback;
  if (/^\d/.test(name)) name = `Type${name}`;
  if (CLASS_RESERVED.has(name)) name = `${name}Model`;
  return name;
}

export function sanitizeRootName(raw: string): string {
  return makeClassName(raw, 'RootData');
}

function singularize(word: string): string {
  if (/ies$/i.test(word)) return `${word.slice(0, -3)}y`;
  if (/(sses|xes|zes|ches|shes)$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word) && !/(ss|us|is|os)$/i.test(word)) return word.slice(0, -1);
  return word;
}

function childSuggestedName(rawKey: string, isArray: boolean): string {
  if (!isArray) return makeClassName(rawKey, 'Item');
  const words = splitWords(rawKey);
  if (words.length === 0) return 'Item';
  const last = singularize(words[words.length - 1]);
  return makeClassName([...words.slice(0, -1), last].join(' '), 'Item');
}

function preserveIdentifier(raw: string): string {
  let identifier = raw.trim().replace(/[^\p{L}\p{N}_]/gu, '_');
  if (!identifier || /^_+$/.test(identifier)) identifier = 'field';
  if (/^\p{N}/u.test(identifier)) identifier = `field_${identifier}`;
  return identifier;
}

function fieldIdentifier(raw: string, naming: NamingStyle): string {
  if (naming === 'preserve') return preserveIdentifier(raw);

  const words = splitWords(raw).map((word) => word.toLowerCase());
  if (words.length === 0) return 'field';

  let identifier: string;
  if (naming === 'snake') {
    identifier = words.join('_');
  } else if (naming === 'pascal') {
    identifier = words.map(capitalize).join('');
  } else {
    identifier = words[0] + words.slice(1).map(capitalize).join('');
  }

  if (/^\p{N}/u.test(identifier)) {
    if (naming === 'snake') return `field_${identifier}`;
    if (naming === 'pascal') return `Field${identifier}`;
    return `field${capitalize(identifier)}`;
  }
  return identifier;
}

function inferType(value: unknown, suggestedName: string): TypeNode {
  if (value === null) return { kind: 'null' };

  if (Array.isArray(value)) {
    let element: TypeNode = { kind: 'any' };
    if (value.length > 0) {
      element = inferType(value[0], suggestedName);
      for (let index = 1; index < value.length; index += 1) {
        element = mergeTypes(element, inferType(value[index], suggestedName));
      }
    }
    return { kind: 'array', element };
  }

  if (typeof value === 'object') {
    const fields = Object.entries(value as Record<string, unknown>).map(([rawKey, child]) => ({
      rawKey,
      key: '',
      type: inferType(child, childSuggestedName(rawKey, Array.isArray(child))),
      optional: false,
    }));
    return { kind: 'object', suggestedName, name: '', fields };
  }

  if (typeof value === 'number') return { kind: 'number', integer: Number.isInteger(value) };
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (typeof value === 'string') return { kind: 'string' };
  return { kind: 'any' };
}

function markNullable(node: TypeNode): TypeNode {
  return { ...node, nullable: true };
}

function mergeTypes(a: TypeNode, b: TypeNode): TypeNode {
  if (a.kind === 'null' && b.kind === 'null') return { kind: 'null', nullable: true };
  if (a.kind === 'null') return markNullable(b);
  if (b.kind === 'null') return markNullable(a);

  const nullable = Boolean(a.nullable || b.nullable);

  if (a.kind === 'object' && b.kind === 'object') {
    return {
      kind: 'object',
      suggestedName: a.suggestedName || b.suggestedName,
      name: '',
      fields: mergeFields(a.fields, b.fields),
      nullable,
    };
  }

  if (a.kind === 'array' && b.kind === 'array') {
    return { kind: 'array', element: mergeTypes(a.element, b.element), nullable };
  }

  if (a.kind === 'number' && b.kind === 'number') {
    return { kind: 'number', integer: a.integer && b.integer, nullable };
  }

  if (a.kind === b.kind) {
    return { ...a, nullable } as TypeNode;
  }

  return { kind: 'any', nullable };
}

function mergeFields(a: ObjectField[], b: ObjectField[]): ObjectField[] {
  const aMap = new Map(a.map((field) => [field.rawKey, field]));
  const bMap = new Map(b.map((field) => [field.rawKey, field]));
  const keys = Array.from(new Set([...aMap.keys(), ...bMap.keys()]));

  return keys.map((rawKey) => {
    const aField = aMap.get(rawKey);
    const bField = bMap.get(rawKey);
    if (!aField) return { ...bField!, optional: true };
    if (!bField) return { ...aField, optional: true };
    return {
      rawKey,
      key: '',
      type: mergeTypes(aField.type, bField.type),
      optional: aField.optional || bField.optional,
    };
  });
}

function getReservedWords(language: CodeLanguage): Set<string> {
  return new Set([...BASE_RESERVED, ...LANGUAGE_RESERVED[language]]);
}

function assignFieldKeys(object: ObjectType, naming: NamingStyle, reserved: Set<string>): void {
  const used = new Set<string>();
  for (const field of object.fields) {
    let base = fieldIdentifier(field.rawKey, naming);
    if (reserved.has(base)) base = `${base}_`;

    let candidate = base;
    let index = 2;
    while (used.has(candidate) || reserved.has(candidate)) {
      candidate = `${base}${index}`;
      index += 1;
    }
    used.add(candidate);
    field.key = candidate;
  }
}

function buildPlan(value: unknown, options: CodeGenOptions): BuildPlan {
  const rootName = sanitizeRootName(options.rootName);
  const root = Array.isArray(value)
    ? inferType(value, `${rootName}Item`)
    : inferType(value, rootName);

  const used = new Set<string>();
  if (root.kind !== 'object') used.add(rootName);
  const objects: ObjectType[] = [];

  const visit = (node: TypeNode, parentName: string): void => {
    if (node.kind === 'array') {
      visit(node.element, parentName);
      return;
    }
    if (node.kind !== 'object') return;

    let name = makeClassName(node.suggestedName, 'Item');
    if (used.has(name) && parentName) name = makeClassName(`${parentName}${name}`, 'Item');
    if (used.has(name)) {
      let index = 2;
      while (used.has(`${name}${index}`)) index += 1;
      name = `${name}${index}`;
    }

    used.add(name);
    node.name = name;
    objects.push(node);
    for (const field of node.fields) visit(field.type, name);
  };

  visit(root, '');

  const reserved = getReservedWords(options.language);
  for (const object of objects) assignFieldKeys(object, options.naming, reserved);

  return { root, rootName, objects };
}

export function generateEntityCode(value: unknown, options: CodeGenOptions): string {
  const plan = buildPlan(value, options);
  return EMITTERS[options.language]({ plan, options });
}

export function countJsonNodes(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce<number>((sum, item) => sum + 1 + countJsonNodes(item), 0);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (sum, child) => sum + 1 + countJsonNodes(child),
      0,
    );
  }
  return 0;
}

export function getCodeFilename(rootName: string, language: CodeLanguage): string {
  return `${sanitizeRootName(rootName)}.${getLanguageMeta(language).extension}`;
}
