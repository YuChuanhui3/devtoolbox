import type {
  CodeGenOptions,
  CodeLanguage,
  GeneratorContext,
  ObjectField,
  TypeNode,
} from './codegen';
import {
  capitalize,
  fieldComment,
  fieldNeedsOptional,
  isNullableNode,
} from './codegenShared';

function nodeUsesArray(node: TypeNode): boolean {
  if (node.kind === 'array') return true;
  if (node.kind === 'object') return node.fields.some((field) => nodeUsesArray(field.type));
  return false;
}

function finish(lines: string[]): string {
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function tsType(node: TypeNode, options: CodeGenOptions): string {
  let type: string;
  switch (node.kind) {
    case 'object':
      type = node.name;
      break;
    case 'array': {
      const element = tsType(node.element, options);
      type = element.includes('|') ? `Array<${element}>` : `${element}[]`;
      break;
    }
    case 'number':
      type = 'number';
      break;
    case 'string':
      type = 'string';
      break;
    case 'boolean':
      type = 'boolean';
      break;
    default:
      type = 'any';
  }

  if (options.handleNull && isNullableNode(node)) type += ' | null';
  return type;
}

function emitTypeScript(context: GeneratorContext): string {
  const { plan, options } = context;
  const lines: string[] = [];

  plan.objects.forEach((object, objectIndex) => {
    if (objectIndex > 0) lines.push('');
    lines.push(`export interface ${object.name} {`);
    for (const field of object.fields) {
      if (options.comments) lines.push(`  /** ${fieldComment(field)} */`);
      const optional = options.handleNull && field.optional ? '?' : '';
      lines.push(`  ${field.key}${optional}: ${tsType(field.type, options)};`);
    }
    lines.push('}');
  });

  if (plan.root.kind !== 'object') {
    if (lines.length > 0) lines.push('');
    lines.push(`export type ${plan.rootName} = ${tsType(plan.root, options)};`);
  }
  return finish(lines);
}

function javaType(node: TypeNode): string {
  switch (node.kind) {
    case 'object':
      return node.name;
    case 'array':
      return `List<${javaType(node.element)}>`;
    case 'number':
      return node.integer ? 'Long' : 'Double';
    case 'string':
      return 'String';
    case 'boolean':
      return 'Boolean';
    default:
      return 'Object';
  }
}

function emitJava(context: GeneratorContext): string {
  const { plan, options } = context;
  const lines: string[] = [];
  if (nodeUsesArray(plan.root)) lines.push('import java.util.List;', '');

  for (const object of plan.objects) {
    const publicClass = object.name === plan.rootName;
    lines.push(`${publicClass ? 'public ' : ''}class ${object.name} {`);
    for (const field of object.fields) {
      if (options.comments) lines.push(`    /** ${fieldComment(field)} */`);
      lines.push(`    public ${javaType(field.type)} ${field.key};`);
    }
    lines.push('}', '');
  }

  if (plan.root.kind !== 'object') {
    lines.push(`public class ${plan.rootName} {`);
    lines.push(`    public ${javaType(plan.root)} value;`);
    lines.push('}', '');
  }
  return finish(lines);
}

function goType(node: TypeNode): string {
  switch (node.kind) {
    case 'object':
      return node.name;
    case 'array':
      return `[]${goType(node.element)}`;
    case 'number':
      return node.integer ? 'int64' : 'float64';
    case 'string':
      return 'string';
    case 'boolean':
      return 'bool';
    default:
      return 'interface{}';
  }
}

function escapeGoTag(key: string): string {
  return key
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, "'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function goExportedName(key: string): string {
  let name = capitalize(key.replace(/^_+/, '') || 'field');
  if (!/^[A-Z]/.test(name)) name = `Field${name}`;
  return name
    .replace(/Id(?=[A-Z]|$)/g, 'ID')
    .replace(/Url(?=[A-Z]|$)/g, 'URL')
    .replace(/Api(?=[A-Z]|$)/g, 'API')
    .replace(/Ip(?=[A-Z]|$)/g, 'IP');
}

function goFieldNames(fields: ObjectField[]): string[] {
  const used = new Set<string>();
  return fields.map((field) => {
    const base = goExportedName(field.key);
    let name = base;
    let index = 2;
    while (used.has(name)) {
      name = `${base}${index}`;
      index += 1;
    }
    used.add(name);
    return name;
  });
}

function emitGo(context: GeneratorContext): string {
  const { plan, options } = context;
  const lines = ['package main', ''];

  for (const object of plan.objects) {
    lines.push(`type ${object.name} struct {`);
    const names = goFieldNames(object.fields);
    object.fields.forEach((field, index) => {
      if (options.comments) lines.push(`\t// ${fieldComment(field)}`);
      const omitempty = options.handleNull && fieldNeedsOptional(field, options) ? ',omitempty' : '';
      const tag = `json:"${escapeGoTag(field.rawKey)}${omitempty}"`;
      lines.push(`\t${names[index]} ${goType(field.type)} \`${tag}\``);
    });
    lines.push('}', '');
  }

  if (plan.root.kind !== 'object') {
    lines.push(`type ${plan.rootName} ${goType(plan.root)}`);
  }
  return finish(lines);
}

function isCsharpValueType(node: TypeNode): boolean {
  return node.kind === 'number' || node.kind === 'boolean';
}

function csharpType(node: TypeNode, options: CodeGenOptions): string {
  let base: string;
  switch (node.kind) {
    case 'object':
      base = node.name;
      break;
    case 'array':
      base = `List<${csharpType(node.element, options)}>`;
      break;
    case 'number':
      base = node.integer ? 'long' : 'double';
      break;
    case 'string':
      base = 'string';
      break;
    case 'boolean':
      base = 'bool';
      break;
    default:
      base = 'object';
  }
  if (options.handleNull && isNullableNode(node) && isCsharpValueType(node)) base += '?';
  return base;
}

function csharpComment(text: string): string {
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `/// <summary>${safe}</summary>`;
}

function emitCsharp(context: GeneratorContext): string {
  const { plan, options } = context;
  const lines: string[] = [];
  if (nodeUsesArray(plan.root)) lines.push('using System.Collections.Generic;', '');

  for (const object of plan.objects) {
    lines.push(`public class ${object.name}`, '{');
    for (const field of object.fields) {
      let type = csharpType(field.type, options);
      if (options.handleNull && field.optional && isCsharpValueType(field.type) && !type.endsWith('?')) {
        type += '?';
      }
      if (options.comments) lines.push(`    ${csharpComment(fieldComment(field))}`);
      lines.push(`    public ${type} ${field.key} { get; set; }`);
    }
    lines.push('}', '');
  }

  if (plan.root.kind !== 'object') {
    lines.push(`public class ${plan.rootName}`, '{');
    lines.push(`    public ${csharpType(plan.root, options)} Value { get; set; }`);
    lines.push('}', '');
  }
  return finish(lines);
}

function pythonType(node: TypeNode, options: CodeGenOptions, forceOptional = false): string {
  let base: string;
  switch (node.kind) {
    case 'object':
      base = node.name;
      break;
    case 'array':
      base = `List[${pythonType(node.element, options)}]`;
      break;
    case 'number':
      base = node.integer ? 'int' : 'float';
      break;
    case 'string':
      base = 'str';
      break;
    case 'boolean':
      base = 'bool';
      break;
    default:
      base = 'Any';
  }

  if (options.handleNull && (forceOptional || isNullableNode(node))) return `Optional[${base}]`;
  return base;
}

function emitPython(context: GeneratorContext): string {
  const { plan, options } = context;
  const lines = [
    'from __future__ import annotations',
    '',
    'from dataclasses import dataclass',
    'from typing import Any, List, Optional',
    '',
  ];

  for (const object of plan.objects) {
    lines.push('@dataclass');
    lines.push(`class ${object.name}:`);

    if (object.fields.length === 0) {
      lines.push('    pass', '');
      continue;
    }

    const ordered = [...object.fields].sort(
      (a, b) => Number(fieldNeedsOptional(a, options)) - Number(fieldNeedsOptional(b, options)),
    );
    for (const field of ordered) {
      if (options.comments) lines.push(`    # ${fieldComment(field)}`);
      const optional = fieldNeedsOptional(field, options);
      const type = pythonType(field.type, options, field.optional);
      lines.push(`    ${field.key}: ${type}${optional ? ' = None' : ''}`);
    }
    lines.push('');
  }

  if (plan.root.kind !== 'object') {
    lines.push(`${plan.rootName} = ${pythonType(plan.root, options)}`);
  }
  return finish(lines);
}

function phpType(node: TypeNode, options: CodeGenOptions, forceOptional = false): string {
  let base: string;
  switch (node.kind) {
    case 'object':
      base = node.name;
      break;
    case 'array':
      base = 'array';
      break;
    case 'number':
      base = node.integer ? 'int' : 'float';
      break;
    case 'string':
      base = 'string';
      break;
    case 'boolean':
      base = 'bool';
      break;
    default:
      base = 'mixed';
  }

  const optional = options.handleNull && (forceOptional || isNullableNode(node));
  return optional && base !== 'mixed' ? `?${base}` : base;
}

function emitPhp(context: GeneratorContext): string {
  const { plan, options } = context;
  const lines = ['<?php', ''];

  const emitClass = (name: string, fields: ObjectField[] | null) => {
    lines.push(`class ${name}`, '{');
    if (fields === null) {
      lines.push(`    public ${phpType(plan.root, options)} $value;`);
    } else {
      for (const field of fields) {
        if (options.comments) lines.push(`    /** ${fieldComment(field)} */`);
        const optional = fieldNeedsOptional(field, options);
        const type = phpType(field.type, options, field.optional);
        lines.push(`    public ${type} $${field.key}${optional ? ' = null' : ''};`);
      }
    }
    lines.push('}', '');
  };

  for (const object of plan.objects) emitClass(object.name, object.fields);
  if (plan.root.kind !== 'object') emitClass(plan.rootName, null);
  return finish(lines);
}

function rustType(node: TypeNode, options: CodeGenOptions, forceOptional = false): string {
  let base: string;
  switch (node.kind) {
    case 'object':
      base = node.name;
      break;
    case 'array':
      base = `Vec<${rustType(node.element, options)}>`;
      break;
    case 'number':
      base = node.integer ? 'i64' : 'f64';
      break;
    case 'string':
      base = 'String';
      break;
    case 'boolean':
      base = 'bool';
      break;
    default:
      base = 'serde_json::Value';
  }

  const optional = options.handleNull && (forceOptional || isNullableNode(node));
  return optional ? `Option<${base}>` : base;
}

function emitRust(context: GeneratorContext): string {
  const { plan, options } = context;
  const lines: string[] = [];

  for (const object of plan.objects) {
    lines.push('#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]');
    lines.push(`pub struct ${object.name} {`);
    for (const field of object.fields) {
      if (options.comments) lines.push(`    /// ${fieldComment(field)}`);
      if (field.key !== field.rawKey) {
        lines.push(`    #[serde(rename = ${JSON.stringify(field.rawKey)})]`);
      }
      lines.push(`    pub ${field.key}: ${rustType(field.type, options, field.optional)},`);
    }
    lines.push('}', '');
  }

  if (plan.root.kind !== 'object') {
    lines.push(`pub type ${plan.rootName} = ${rustType(plan.root, options)};`);
  }
  return finish(lines);
}

function swiftType(node: TypeNode, options: CodeGenOptions, forceOptional = false): string {
  let base: string;
  switch (node.kind) {
    case 'object':
      base = node.name;
      break;
    case 'array':
      base = `[${swiftType(node.element, options)}]`;
      break;
    case 'number':
      base = node.integer ? 'Int64' : 'Double';
      break;
    case 'string':
      base = 'String';
      break;
    case 'boolean':
      base = 'Bool';
      break;
    default:
      base = 'Any';
  }

  const optional = options.handleNull && (forceOptional || isNullableNode(node));
  return optional ? `${base}?` : base;
}

function emitSwift(context: GeneratorContext): string {
  const { plan, options } = context;
  const lines: string[] = [];

  for (const object of plan.objects) {
    lines.push(`struct ${object.name} {`);
    for (const field of object.fields) {
      if (options.comments) lines.push(`    /// ${fieldComment(field)}`);
      lines.push(`    var ${field.key}: ${swiftType(field.type, options, field.optional)}`);
    }
    lines.push('}', '');
  }

  if (plan.root.kind !== 'object') {
    lines.push(`typealias ${plan.rootName} = ${swiftType(plan.root, options)}`);
  }
  return finish(lines);
}

function kotlinType(node: TypeNode, options: CodeGenOptions, forceOptional = false): string {
  let base: string;
  switch (node.kind) {
    case 'object':
      base = node.name;
      break;
    case 'array':
      base = `List<${kotlinType(node.element, options)}>`;
      break;
    case 'number':
      base = node.integer ? 'Long' : 'Double';
      break;
    case 'string':
      base = 'String';
      break;
    case 'boolean':
      base = 'Boolean';
      break;
    default:
      base = 'Any';
  }

  const optional = options.handleNull && (forceOptional || isNullableNode(node));
  return optional ? `${base}?` : base;
}

function emitKotlin(context: GeneratorContext): string {
  const { plan, options } = context;
  const lines: string[] = [];

  for (const object of plan.objects) {
    if (object.fields.length === 0) {
      lines.push(`class ${object.name}`, '');
      continue;
    }
    lines.push(`data class ${object.name}(`);
    for (const field of object.fields) {
      if (options.comments) lines.push(`    /** ${fieldComment(field)} */`);
      const optional = fieldNeedsOptional(field, options);
      const type = kotlinType(field.type, options, field.optional);
      lines.push(`    val ${field.key}: ${type}${optional ? ' = null' : ''},`);
    }
    lines.push(')', '');
  }

  if (plan.root.kind !== 'object') {
    lines.push(`typealias ${plan.rootName} = ${kotlinType(plan.root, options)}`);
  }
  return finish(lines);
}

function dartType(node: TypeNode, options: CodeGenOptions, forceOptional = false): string {
  let base: string;
  switch (node.kind) {
    case 'object':
      base = node.name;
      break;
    case 'array':
      base = `List<${dartType(node.element, options)}>`;
      break;
    case 'number':
      base = node.integer ? 'int' : 'double';
      break;
    case 'string':
      base = 'String';
      break;
    case 'boolean':
      base = 'bool';
      break;
    default:
      base = 'dynamic';
  }

  const optional = options.handleNull && (forceOptional || isNullableNode(node));
  return optional && base !== 'dynamic' ? `${base}?` : base;
}

function emitDart(context: GeneratorContext): string {
  const { plan, options } = context;
  const lines: string[] = [];

  for (const object of plan.objects) {
    if (object.fields.length === 0) {
      lines.push(`class ${object.name} {}`, '');
      continue;
    }

    lines.push(`class ${object.name} {`);
    for (const field of object.fields) {
      if (options.comments) lines.push(`  /// ${fieldComment(field)}`);
      lines.push(`  final ${dartType(field.type, options, field.optional)} ${field.key};`);
    }
    lines.push('', `  ${object.name}({`);
    for (const field of object.fields) {
      const nullable = fieldNeedsOptional(field, options) || dartType(field.type, options) === 'dynamic';
      lines.push(`    ${nullable ? '' : 'required '}this.${field.key},`);
    }
    lines.push('  });', '}', '');
  }

  if (plan.root.kind !== 'object') {
    lines.push(`typedef ${plan.rootName} = ${dartType(plan.root, options)};`);
  }
  return finish(lines);
}

function objcType(node: TypeNode): string {
  switch (node.kind) {
    case 'object':
      return `${node.name} *`;
    case 'array': {
      const element = node.element;
      if (element.kind === 'array' || element.kind === 'any' || element.kind === 'null') {
        return 'NSArray *';
      }
      return `NSArray<${objcType(element)}> *`;
    }
    case 'number':
    case 'boolean':
      return 'NSNumber *';
    case 'string':
      return 'NSString *';
    default:
      return 'id ';
  }
}

function emitObjectiveC(context: GeneratorContext): string {
  const { plan, options } = context;
  const lines = ['#import <Foundation/Foundation.h>', ''];

  const forwards = plan.objects
    .map((object) => object.name)
    .filter((name) => name !== plan.rootName);
  if (forwards.length > 0) lines.push(`@class ${forwards.join(', ')};`, '');

  for (const object of plan.objects) {
    lines.push(`@interface ${object.name} : NSObject`);
    for (const field of object.fields) {
      if (options.comments) lines.push(`/** ${fieldComment(field)} */`);
      const type = objcType(field.type);
      const nullable = fieldNeedsOptional(field, options) ? ', nullable' : '';
      const memory = type === 'NSString *' || type.startsWith('NSArray') ? 'copy' : 'strong';
      lines.push(`@property (nonatomic, ${memory}${nullable}) ${type}${field.key};`);
    }
    lines.push('@end', '');
  }

  if (plan.root.kind !== 'object') {
    lines.push(`@interface ${plan.rootName} : NSObject`);
    lines.push(`@property (nonatomic, strong) ${objcType(plan.root)}value;`);
    lines.push('@end', '');
  }
  return finish(lines);
}

function cppType(node: TypeNode, options: CodeGenOptions, forceOptional = false): string {
  let base: string;
  switch (node.kind) {
    case 'object':
      base = node.name;
      break;
    case 'array':
      base = `std::vector<${cppType(node.element, options)}>`;
      break;
    case 'number':
      base = node.integer ? 'int64_t' : 'double';
      break;
    case 'string':
      base = 'std::string';
      break;
    case 'boolean':
      base = 'bool';
      break;
    default:
      base = 'std::any';
  }

  const optional = options.handleNull && (forceOptional || isNullableNode(node));
  return optional ? `std::optional<${base}>` : base;
}

function emitCpp(context: GeneratorContext): string {
  const { plan, options } = context;
  const lines = [
    '#include <any>',
    '#include <cstdint>',
    '#include <optional>',
    '#include <string>',
    '#include <vector>',
    '',
  ];

  const ordered = [...plan.objects].reverse();
  for (const object of ordered) {
    lines.push(`struct ${object.name} {`);
    for (const field of object.fields) {
      if (options.comments) lines.push(`    /** ${fieldComment(field)} */`);
      lines.push(`    ${cppType(field.type, options, field.optional)} ${field.key};`);
    }
    lines.push('};', '');
  }

  if (plan.root.kind !== 'object') {
    lines.push(`using ${plan.rootName} = ${cppType(plan.root, options)};`);
  }
  return finish(lines);
}

function emitRuby(context: GeneratorContext): string {
  const { plan, options } = context;
  const lines: string[] = [];

  for (const object of plan.objects) {
    lines.push(`class ${object.name}`);
    for (const field of object.fields) {
      if (options.comments) lines.push(`  # ${fieldComment(field)}`);
      lines.push(`  attr_accessor :${field.key}`);
    }
    lines.push('end', '');
  }

  if (plan.root.kind !== 'object') {
    lines.push(`class ${plan.rootName}`);
    lines.push('  attr_accessor :value');
    lines.push('end', '');
  }
  return finish(lines);
}

export const EMITTERS: Record<CodeLanguage, (context: GeneratorContext) => string> = {
  typescript: emitTypeScript,
  java: emitJava,
  go: emitGo,
  csharp: emitCsharp,
  python: emitPython,
  php: emitPhp,
  rust: emitRust,
  swift: emitSwift,
  kotlin: emitKotlin,
  dart: emitDart,
  'objective-c': emitObjectiveC,
  cpp: emitCpp,
  ruby: emitRuby,
};

