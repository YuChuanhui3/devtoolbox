import { describe, expect, test } from 'vitest';
import { endpointsToImport, parseOpenApi, schemaToExample } from './openapi';

const PETSTORE = `
openapi: "3.0.0"
info:
  title: Petstore
  version: "1.0"
servers:
  - url: https://petstore.example.com/v1/
paths:
  /pets:
    get:
      tags: [pets]
      summary: List pets
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        "200":
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/Pet" }
    post:
      tags: [pets]
      summary: Create pet
      requestBody:
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Pet" }
      responses:
        "201":
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Pet" }
  /pets/{petId}:
    get:
      summary: Get pet
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "200":
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Pet" }
components:
  schemas:
    Pet:
      type: object
      required: [id, name]
      properties:
        id: { type: integer }
        name: { type: string, example: Bubbles }
        tag: { type: string }
        owner: { $ref: "#/components/schemas/Human" }
    Human:
      type: object
      properties:
        name: { type: string }
        pet: { $ref: "#/components/schemas/Pet" }
`;

describe('parseOpenApi', () => {
  test('解析 petstore YAML：端点数、servers、请求体示例', () => {
    const spec = parseOpenApi(PETSTORE);
    expect(spec.title).toBe('Petstore');
    expect(spec.baseUrl).toBe('https://petstore.example.com/v1');
    expect(spec.endpoints).toHaveLength(3);
    const create = spec.endpoints.find((e) => e.method === 'POST')!;
    expect(JSON.parse(create.requestExample!).name).toBe('Bubbles');
    const list = spec.endpoints.find((e) => e.summary === 'List pets')!;
    expect(JSON.parse(list.responseExample!)).toHaveLength(1);
  });

  test('JSON 文档同样可解析', () => {
    const spec = parseOpenApi(JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Mini' },
      paths: { '/ping': { get: { responses: { '200': { description: 'ok' } } } } },
    }));
    expect(spec.endpoints[0].path).toBe('/ping');
    expect(spec.baseUrl).toBe('{{baseUrl}}');
  });

  test('环状 $ref 不死循环，降级为 <recursive>', () => {
    const spec = parseOpenApi(PETSTORE);
    const get = spec.endpoints.find((e) => e.path === '/pets/{petId}')!;
    expect(get.responseExample).toContain('<recursive>');
  });

  test('Swagger 2.0 最小提升：host/basePath 与 definitions 引用', () => {
    const spec = parseOpenApi(JSON.stringify({
      swagger: '2.0',
      info: { title: 'Legacy' },
      host: 'legacy.example.com',
      basePath: '/api',
      schemes: ['http'],
      paths: {
        '/things': {
          get: {
            parameters: [{ name: 'body', in: 'body', schema: { $ref: '#/definitions/Thing' } }],
            responses: { '200': { schema: { $ref: '#/definitions/Thing' } } },
          },
        },
      },
      definitions: { Thing: { type: 'object', properties: { id: { type: 'integer' } } } },
    }));
    expect(spec.baseUrl).toBe('http://legacy.example.com/api');
    const body = spec.endpoints[0].requestExample!;
    expect(JSON.parse(body)).toEqual({ id: 1 });
  });

  test('非 OpenAPI 文本报双语 ToolError', () => {
    expect(() => parseOpenApi('hello')).toThrowError();
    expect(() => parseOpenApi('{"title": "no version"}')).toThrowError(/openapi/i);
  });
});

describe('schemaToExample', () => {
  test('优先级 example > default > enum > format > 类型桩', () => {
    const root = {};
    expect(schemaToExample({ type: 'string', example: 'X', enum: ['Y'], default: 'Z' }, root)).toBe('X');
    expect(schemaToExample({ type: 'string', default: 'Z', enum: ['Y'] }, root)).toBe('Z');
    expect(schemaToExample({ type: 'string', enum: ['Y'] }, root)).toBe('Y');
    expect(schemaToExample({ type: 'string', format: 'email' }, root)).toBe('user@example.com');
    expect(schemaToExample({ type: 'number' }, root)).toBe(1.5);
  });

  test('allOf 合并、oneOf 取第一支、深度上限降级', () => {
    const merged = schemaToExample({
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', properties: { b: { type: 'integer' } } },
      ],
    }, {});
    expect(merged).toEqual({ a: 'string', b: 1 });
    expect(schemaToExample({ oneOf: [{ type: 'integer' }, { type: 'string' }] }, {})).toBe(1);
    let deep: unknown = { type: 'string' };
    for (let i = 0; i < 10; i += 1) deep = { type: 'object', properties: { nest: deep } };
    expect(JSON.stringify(schemaToExample(deep, {}))).toContain('<max-depth>');
  });
});

describe('endpointsToImport', () => {
  test('生成集合 + baseUrl 环境 + mock 路由（path 模板转 :param）', () => {
    const spec = parseOpenApi(PETSTORE);
    const result = endpointsToImport(spec, { withMockRoutes: true });
    expect(result.environment?.variables[0].key).toBe('baseUrl');
    expect(result.environment?.variables[0].value).toBe('https://petstore.example.com/v1');
    expect(result.collection.root.folders.map((f) => f.name)).toEqual(['pets']);
    const getRequest = result.collection.root.folders
      .flatMap((f) => f.requests)
      .find((r) => r.method === 'GET' && r.url.includes('/pets/'))!;
    expect(getRequest.url).toMatch(/^https:\/\/petstore\.example\.com\/v1|^\{\{baseUrl\}\}\/pets\/[0-9a-f-]+/);
    expect(getRequest.url.startsWith('{{baseUrl}}/pets/')).toBe(true);
    const mock = result.mockRoutes.find((r) => r.path === '/pets/:param')!;
    expect(mock).toBeTruthy();
    expect(mock.status).toBe(200);
  });

  test('withMockRoutes=false 时不生成路由', () => {
    const spec = parseOpenApi(PETSTORE);
    expect(endpointsToImport(spec, { withMockRoutes: false }).mockRoutes).toEqual([]);
  });
});
