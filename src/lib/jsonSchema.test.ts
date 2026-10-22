import { describe, expect, test } from 'vitest';
import { tl } from '@/i18n/locale';
import { ToolError } from './errors';
import { inferJsonSchema, validateAgainstSchema } from './jsonSchema';

describe('validateAgainstSchema', () => {
  test('passes a matching document', () => {
    const result = validateAgainstSchema(
      { name: 'mqtt', count: 3, tags: ['a', 'b'] },
      {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          count: { type: 'integer', minimum: 0, maximum: 10 },
          tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
        },
      },
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test('reports type mismatches with instance path', () => {
    const result = validateAgainstSchema({ a: { b: [1, 'x'] } }, {
      type: 'object',
      properties: { a: { type: 'object', properties: { b: { type: 'array', items: { type: 'integer' } } } } },
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0].path).toBe('$.a.b[1]');
    expect(tl(result.issues[0].message, 'zh')).toContain('integer');
    expect(tl(result.issues[0].message, 'en')).toContain('integer');
  });

  test('collects missing required properties', () => {
    const result = validateAgainstSchema({}, { type: 'object', required: ['id', 'name'] });
    expect(result.issues).toHaveLength(2);
    expect(tl(result.issues[0].message, 'zh')).toContain('id');
  });

  test('supports type unions, enum and const', () => {
    expect(validateAgainstSchema(null, { type: ['string', 'null'] }).valid).toBe(true);
    expect(validateAgainstSchema(3, { enum: [1, 2, 3] }).valid).toBe(true);
    expect(validateAgainstSchema(4, { enum: [1, 2, 3] }).valid).toBe(false);
    expect(validateAgainstSchema('v2', { const: 'v2' }).valid).toBe(true);
    expect(validateAgainstSchema('v3', { const: 'v2' }).valid).toBe(false);
  });

  test('validates numeric bounds and multipleOf', () => {
    expect(validateAgainstSchema(5, { minimum: 6 }).valid).toBe(false);
    expect(validateAgainstSchema(5, { exclusiveMaximum: 5 }).valid).toBe(false);
    expect(validateAgainstSchema(9, { multipleOf: 3 }).valid).toBe(true);
    expect(validateAgainstSchema(10, { multipleOf: 3 }).valid).toBe(false);
  });

  test('validates strings with length and pattern', () => {
    expect(validateAgainstSchema('ab', { minLength: 3 }).valid).toBe(false);
    expect(validateAgainstSchema('abc', { pattern: '^[a-c]+$' }).valid).toBe(true);
    expect(validateAgainstSchema('xyz', { pattern: '^[a-c]+$' }).valid).toBe(false);
  });

  test('applies additionalProperties rules', () => {
    const schema = { properties: { a: { type: 'number' } }, additionalProperties: false };
    expect(validateAgainstSchema({ a: 1 }, schema).valid).toBe(true);
    const bad = validateAgainstSchema({ a: 1, b: 2 }, schema);
    expect(bad.valid).toBe(false);
    expect(bad.issues[0].path).toBe('$.b');
    const schemaPassthrough = { additionalProperties: { type: 'string' } };
    expect(validateAgainstSchema({ x: 1 }, schemaPassthrough).valid).toBe(false);
  });

  test('supports tuple items with additionalItems', () => {
    const schema = { items: [{ type: 'string' }, { type: 'number' }], additionalItems: false };
    expect(validateAgainstSchema(['a', 1], schema).valid).toBe(true);
    expect(validateAgainstSchema([1, 'a'], schema).valid).toBe(false);
    expect(validateAgainstSchema(['a', 1, true], schema).valid).toBe(false);
  });

  test('resolves local $ref against definitions and $defs', () => {
    const schema = {
      $defs: { coord: { type: 'object', required: ['x', 'y'], properties: { x: { type: 'number' }, y: { type: 'number' } } } },
      properties: { pos: { $ref: '#/$defs/coord' } },
    };
    expect(validateAgainstSchema({ pos: { x: 1, y: 2 } }, schema).valid).toBe(true);
    expect(validateAgainstSchema({ pos: { x: 1 } }, schema).valid).toBe(false);
  });

  test('rejects unsupported remote $ref and broken pointers', () => {
    expect(() => validateAgainstSchema({}, { $ref: 'http://example.com/schema' })).toThrow(ToolError);
    expect(() => validateAgainstSchema({}, { $ref: '#/definitions/missing' })).toThrow(ToolError);
  });

  test('guards against circular $ref recursion', () => {
    const schema = { $ref: '#/definitions/x', definitions: { x: { $ref: '#/definitions/x' } } };
    expect(() => validateAgainstSchema({}, schema)).toThrow(ToolError);
  });

  test('combines allOf / anyOf / oneOf / not', () => {
    expect(validateAgainstSchema(5, { allOf: [{ type: 'integer' }, { minimum: 6 }] }).valid).toBe(false);
    expect(validateAgainstSchema(5, { anyOf: [{ type: 'string' }, { type: 'number' }] }).valid).toBe(true);
    expect(validateAgainstSchema(5, { oneOf: [{ maximum: 10 }, { minimum: 0 }] }).valid).toBe(false);
    expect(validateAgainstSchema(5, { oneOf: [{ type: 'number' }, { type: 'string' }] }).valid).toBe(true);
    expect(validateAgainstSchema('x', { not: { type: 'number' } }).valid).toBe(true);
    expect(validateAgainstSchema(1, { not: { type: 'number' } }).valid).toBe(false);
  });

  test('enforces uniqueItems and array bounds', () => {
    expect(validateAgainstSchema([1, 2, 1], { uniqueItems: true }).valid).toBe(false);
    expect(validateAgainstSchema([{ a: 1 }, { a: 1 }], { uniqueItems: true }).valid).toBe(false);
    expect(validateAgainstSchema([1], { minItems: 2 }).valid).toBe(false);
    expect(validateAgainstSchema([1, 2], { maxItems: 1 }).valid).toBe(false);
  });

  test('boolean schemas accept or reject everything', () => {
    expect(validateAgainstSchema({ any: 1 }, true).valid).toBe(true);
    expect(validateAgainstSchema({ any: 1 }, false).valid).toBe(false);
  });

  test('invalid schema constructs throw ToolError', () => {
    expect(() => validateAgainstSchema({}, { type: 'strng' })).toThrow(ToolError);
    expect(() => validateAgainstSchema('x', { pattern: '(' })).toThrow(ToolError);
    expect(() => validateAgainstSchema({}, 'not-an-object' as unknown)).toThrow(ToolError);
  });

  test('unknown keywords are ignored (validation succeeds)', () => {
    expect(validateAgainstSchema(1, { format: 'ipv4', title: 'x' }).valid).toBe(true);
  });
});

describe('inferJsonSchema', () => {
  test('infers object with all keys required', () => {
    const schema = inferJsonSchema({ name: 'a', count: 2, ok: true });
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['name', 'count', 'ok']);
    expect((schema.properties as Record<string, { type: string }>).count.type).toBe('integer');
  });

  test('merges heterogeneous array items', () => {
    const schema = inferJsonSchema([1, 2.5]);
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'array',
      items: { type: ['integer', 'number'] },
    });
  });

  test('merges object item properties with required intersection', () => {
    const schema = inferJsonSchema([{ a: 1, b: 'x' }, { a: 2 }]);
    const items = schema.items as Record<string, unknown>;
    expect(Object.keys(items.properties as Record<string, unknown>)).toEqual(['a', 'b']);
    expect(items.required).toEqual(['a']);
  });

  test('handles empty containers and null', () => {
    expect(inferJsonSchema(null).type).toBe('null');
    const emptyArray = inferJsonSchema([]);
    expect(emptyArray.type).toBe('array');
    expect(emptyArray.items).toBe(true);
    expect(inferJsonSchema({}).properties).toEqual({});
  });

  test('generated schema validates its own source document', () => {
    const value = { id: 'abc', list: [{ n: 1 }, { n: 2, s: 'x' }], nested: { deep: { flag: false } } };
    const schema = inferJsonSchema(value);
    expect(validateAgainstSchema(value, schema).valid).toBe(true);
  });

  test('inferred schema rejects wrong types', () => {
    const schema = inferJsonSchema({ a: 1, b: 'text' });
    expect(validateAgainstSchema({ a: 'oops', b: 'text' }, schema).valid).toBe(false);
  });
});
