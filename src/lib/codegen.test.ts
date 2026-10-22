import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  CODE_LANGUAGES,
  DEFAULT_CODE_GEN_OPTIONS,
  NAMING_STYLES,
  countJsonNodes,
  generateEntityCode,
  getCodeFilename,
  getLanguageMeta,
  sanitizeRootName,
  type CodeGenOptions,
  type CodeLanguage,
  type NamingStyle,
} from './codegen';

const SAMPLE = {
  user_id: 1001,
  user_name: 'admin',
  is_active: true,
  tags: ['vip', 'new'],
  metadata: null,
};

function options(patch: Partial<CodeGenOptions> = {}): CodeGenOptions {
  return { ...DEFAULT_CODE_GEN_OPTIONS, ...patch };
}

function generate(value: unknown, patch: Partial<CodeGenOptions> = {}): string {
  return generateEntityCode(value, options(patch));
}

function tsSyntaxErrors(code: string): string[] {
  const result = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
  });
  return (result.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

const LANGUAGE_EXPECTATIONS: Record<CodeLanguage, string[]> = {
  typescript: [
    'export interface RootData',
    'userId: number;',
    'userName: string;',
    'tags: string[];',
    'metadata: any | null;',
  ],
  java: [
    'public class RootData',
    'import java.util.List;',
    'public Long userId;',
    'public List<String> tags;',
  ],
  go: [
    'type RootData struct',
    'UserID int64 `json:"user_id"`',
    'UserName string `json:"user_name"`',
    'Metadata interface{} `json:"metadata,omitempty"`',
  ],
  csharp: [
    'public class RootData',
    'public long userId { get; set; }',
    'public List<string> tags { get; set; }',
  ],
  python: [
    '@dataclass',
    'class RootData:',
    'userId: int',
    'metadata: Optional[Any] = None',
  ],
  php: ['<?php', 'class RootData', 'public int $userId;', 'public array $tags;'],
  rust: [
    'pub struct RootData',
    '#[serde(rename = "user_id")]',
    'pub userId: i64,',
    'pub metadata: Option<serde_json::Value>,',
  ],
  swift: ['struct RootData', 'var userId: Int64', 'var metadata: Any?'],
  kotlin: ['data class RootData(', 'val userId: Long,', 'val metadata: Any? = null,'],
  dart: ['class RootData {', 'final int userId;', 'RootData({', 'this.metadata,'],
  'objective-c': [
    '@interface RootData : NSObject',
    'NSNumber *userId;',
    'NSArray<NSString *> *tags;',
  ],
  cpp: ['struct RootData {', 'int64_t userId;', 'std::vector<std::string> tags;', '};'],
  ruby: ['class RootData', 'attr_accessor :userId', 'attr_accessor :metadata'],
};

describe('codegen', () => {
  it('generates the PRD TypeScript example with comments and null handling', () => {
    const code = generate(SAMPLE);

    expect(code).toContain('export interface RootData {');
    expect(code).toContain('/** 用户ID */');
    expect(code).toContain('/** 用户名称 */');
    expect(code).toContain('/** 是否激活 */');
    expect(code).toContain('/** 标签列表 */');
    expect(code).toContain('/** 元数据 */');
    expect(code).toContain('userId: number;');
    expect(code).toContain('userName: string;');
    expect(code).toContain('isActive: boolean;');
    expect(code).toContain('tags: string[];');
    expect(code).toContain('metadata: any | null;');
    expect(tsSyntaxErrors(code)).toEqual([]);
  });

  it('generates valid code for every supported language', () => {
    for (const language of CODE_LANGUAGES) {
      const code = generate(SAMPLE, { language: language.value });
      expect(code.length, language.value).toBeGreaterThan(20);
      expect(code, language.value).not.toContain('undefined');
      expect(code, language.value).not.toContain('[object Object]');
      for (const expected of LANGUAGE_EXPECTATIONS[language.value]) {
        expect(code, `${language.value} should contain ${expected}`).toContain(expected);
      }
    }
  });

  it('exposes language labels, extensions and filenames', () => {
    expect(CODE_LANGUAGES).toHaveLength(13);
    expect(getLanguageMeta('go')).toEqual({ value: 'go', label: 'Go', extension: 'go' });
    expect(getLanguageMeta('typescript').extension).toBe('ts');
    expect(getLanguageMeta('csharp').extension).toBe('cs');
    expect(getLanguageMeta('objective-c').extension).toBe('h');
    expect(getLanguageMeta('cpp').extension).toBe('hpp');
    expect(getLanguageMeta('ruby').extension).toBe('rb');
    expect(getLanguageMeta('unknown' as CodeLanguage)).toBe(CODE_LANGUAGES[0]);

    expect(getCodeFilename('user data', 'typescript')).toBe('UserData.ts');
    expect(getCodeFilename('order', 'java')).toBe('Order.java');
    expect(getCodeFilename('', 'go')).toBe('RootData.go');
    expect(getCodeFilename('123', 'python')).toBe('Type123.py');
  });

  it('lists all naming styles', () => {
    expect(NAMING_STYLES.map((style) => style.value)).toEqual([
      'camel',
      'pascal',
      'snake',
      'preserve',
    ]);
  });

  it('applies each naming style to field names', () => {
    const value = { user_id: 1, userName: 2 };
    const expected: Record<NamingStyle, [string, string]> = {
      camel: ['userId', 'userName'],
      pascal: ['UserId', 'UserName'],
      snake: ['user_id', 'user_name'],
      preserve: ['user_id', 'userName'],
    };

    for (const style of NAMING_STYLES) {
      const code = generate(value, { naming: style.value });
      for (const field of expected[style.value]) {
        expect(code, style.value).toContain(`${field}: number;`);
      }
    }
  });

  it('sanitizes reserved words, digit prefixes and collisions', () => {
    const value = {
      class: 1,
      '1st': 2,
      'user-id': 3,
      user_id: 4,
      'user id': 5,
      '': 6,
    };
    const camel = generate(value);
    expect(camel).toContain('class_: number;');
    expect(camel).toContain('field1st: number;');
    expect(camel).toContain('userId: number;');
    expect(camel).toContain('userId2: number;');
    expect(camel).toContain('userId3: number;');
    expect(camel).toContain('field: number;');
    expect(tsSyntaxErrors(camel)).toEqual([]);

    const snake = generate(value, { naming: 'snake' });
    expect(snake).toContain('class_: number;');
    expect(snake).toContain('field_1st: number;');
    expect(snake).toContain('user_id: number;');
    expect(snake).toContain('user_id2: number;');
    expect(tsSyntaxErrors(snake)).toEqual([]);

    const pascal = generate(value, { naming: 'pascal' });
    expect(pascal).toContain('Class: number;');
    expect(pascal).toContain('Field1st: number;');
    expect(tsSyntaxErrors(pascal)).toEqual([]);

    const preserve = generate(value, { naming: 'preserve' });
    expect(preserve).toContain('class_: number;');
    expect(preserve).toContain('field_1st: number;');
    expect(preserve).toContain('user_id: number;');
    expect(preserve).toContain('user_id2: number;');
    expect(tsSyntaxErrors(preserve)).toEqual([]);
  });

  it('renames class names that collide with common language types', () => {
    const code = generate({ string: { a: 1 }, list: { b: 2 }, value: { c: 3 } });
    expect(code).toContain('interface StringModel');
    expect(code).toContain('interface ListModel');
    expect(code).toContain('interface ValueModel');
  });

  it('merges object shapes from arrays and marks missing fields optional', () => {
    const code = generate([{ id: 1, nickname: 'a' }, { id: 2, score: 1.5 }]);
    expect(code).toContain('export interface RootDataItem {');
    expect(code).toContain('id: number;');
    expect(code).toContain('nickname?: string;');
    expect(code).toContain('score?: number;');
    expect(code).toContain('export type RootData = RootDataItem[];');
    expect(tsSyntaxErrors(code)).toEqual([]);
  });

  it('turns mixed array element types into a general type', () => {
    const tsCode = generate([1, 'a', true, { x: 1 }]);
    expect(tsCode).toContain('export type RootData = any[];');

    const goCode = generate([1, 'a'], { language: 'go' });
    expect(goCode).toContain('type RootData []interface{}');
  });

  it('handles nullable values with and without null handling', () => {
    const value = { meta: null, list: [null, null], rows: [{ a: 1 }, null] };

    const withNull = generate(value);
    expect(withNull).toContain('meta: any | null;');
    expect(withNull).toContain('list: Array<any | null>;');
    expect(withNull).toContain('rows: Array<Row | null>;');

    const withoutNull = generate(value, { handleNull: false });
    expect(withoutNull).toContain('meta: any;');
    expect(withoutNull).not.toContain('| null');
    expect(tsSyntaxErrors(withoutNull)).toEqual([]);
  });

  it('handles optional fields in Go with omitempty only when enabled', () => {
    const value = [{ id: 1, note: 'x' }, { id: 2 }];

    const withNull = generate(value, {
      language: 'go',
      rootName: 'Row',
      naming: 'pascal',
    });
    expect(withNull).toContain('Note string `json:"note,omitempty"`');
    expect(withNull).toContain('type RowItem struct');
    expect(withNull).toContain('type Row []RowItem');

    const withoutNull = generate(value, {
      language: 'go',
      rootName: 'Row',
      naming: 'pascal',
      handleNull: false,
    });
    expect(withoutNull).toContain('Note string `json:"note"`');
    expect(withoutNull).not.toContain('omitempty');
  });

  it('adds a general-type note for fields whose shape cannot be inferred', () => {
    const code = generate([{ data: { a: 1 } }, { data: [1] }]);
    expect(code).toContain('无法推断类型');
    expect(code).toContain('data: any;');
  });

  it('omits comments when disabled', () => {
    const code = generate(SAMPLE, { comments: false });
    expect(code).not.toContain('/**');
    expect(code).not.toContain('用户ID');
  });

  it('supports empty objects and empty arrays', () => {
    const emptyObject = generate({});
    expect(emptyObject).toContain('export interface RootData {');
    expect(tsSyntaxErrors(emptyObject)).toEqual([]);

    const emptyArray = generate([]);
    expect(emptyArray).toContain('export type RootData = any[];');
    expect(tsSyntaxErrors(emptyArray)).toEqual([]);

    const nested = generate({ nested: {}, list: [] });
    expect(nested).toContain('nested: Nested;');
    expect(nested).toContain('list: any[];');
    expect(tsSyntaxErrors(nested)).toEqual([]);
  });

  it('generates aliases or wrappers for primitive and null roots in every language', () => {
    for (const root of ['hello', 42, null] as const) {
      for (const language of CODE_LANGUAGES) {
        const code = generate(root, { language: language.value, rootName: 'Payload' });
        expect(code, `${language.value} root ${String(root)}`).toContain('Payload');
        expect(code.length, `${language.value} root ${String(root)}`).toBeGreaterThan(10);
      }
    }
  });

  it('generates empty, object and array roots in every language', () => {
    const roots = [{}, { a: 1, nested: { b: true } }, [{ id: 1 }], [[1, 2], [3]]];
    for (const root of roots) {
      for (const language of CODE_LANGUAGES) {
        const code = generate(root, { language: language.value, rootName: 'Payload' });
        expect(code.length, `${language.value}`).toBeGreaterThan(10);
        expect(code, `${language.value}`).not.toContain('undefined');
      }
    }
  });

  it('keeps Objective-C id properties and C++ structs syntactically separated', () => {
    const objc = generate({ anything: null, user: { name: 'a' } }, { language: 'objective-c' });
    expect(objc).toContain('id anything;');
    expect(objc).not.toContain('idanything');

    const cpp = generate({ user: { name: 'a' }, id: 1 }, { language: 'cpp' });
    expect(cpp).toContain('struct User {');
    expect(cpp).toMatch(/\};\n\nstruct/);
    expect(cpp).toMatch(/\};\n$/);
  });

  it('escapes special characters in Go JSON tags', () => {
    const code = generate({ 'a"b': 1, 'line\nbreak': 2, 'back`tick': 3 }, { language: 'go' });
    expect(code).toContain('json:"a\\"b"');
    expect(code).toContain("json:\"line\\nbreak\"");
    expect(code).toContain("json:\"back'tick\"");
  });

  it('creates unique nested class names across parents', () => {
    const code = generate({
      user: { id: 1 },
      order: { user: { name: 'a' } },
    });
    expect(code).toContain('interface User {');
    expect(code).toContain('interface OrderUser {');
    expect(tsSyntaxErrors(code)).toEqual([]);
  });

  it('singularizes array item class names', () => {
    const code = generate({
      categories: [{ id: 1 }],
      boxes: [{ id: 2 }],
      dishes: [{ id: 3 }],
      users: [{ id: 4 }],
      status: [{ id: 5 }],
    });
    expect(code).toContain('interface Category {');
    expect(code).toContain('interface Box {');
    expect(code).toContain('interface Dish {');
    expect(code).toContain('interface User {');
    expect(code).toContain('interface Status {');
  });

  it('supports is / has / can comment prefixes', () => {
    const code = generate({ is_active: true, has_more: false, can_edit: true });
    expect(code).toContain('是否激活');
    expect(code).toContain('是否有更多');
    expect(code).toContain('是否可编辑');
  });

  it('sanitizes root names', () => {
    expect(sanitizeRootName('user data')).toBe('UserData');
    expect(sanitizeRootName('')).toBe('RootData');
    expect(sanitizeRootName('123')).toBe('Type123');
    expect(sanitizeRootName('class')).toBe('ClassModel');
    expect(sanitizeRootName('value')).toBe('ValueModel');
    expect(sanitizeRootName('用户资料')).toBe('用户资料');
  });

  it('counts JSON nodes', () => {
    expect(countJsonNodes(SAMPLE)).toBe(7);
    expect(countJsonNodes({ a: [1, 2], b: { c: true } })).toBe(5);
    expect(countJsonNodes([])).toBe(0);
    expect(countJsonNodes({})).toBe(0);
    expect(countJsonNodes('text')).toBe(0);
    expect(countJsonNodes([1, [2, 3]])).toBe(4);
  });

  it('generates TypeScript that parses across complex inputs', () => {
    const inputs = [
      SAMPLE,
      [{ id: 1, tags: ['a'] }, { id: 2, extra: null }],
      { '1st': { 'a-b': [{ x: 1 }, { y: 2 }] }, class: null, empty: {} },
      { value: { string: { list: [1, 2] } } },
    ];

    for (const input of inputs) {
      const code = generate(input);
      expect(tsSyntaxErrors(code), code).toEqual([]);
    }
  });
});
