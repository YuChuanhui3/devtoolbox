import { describe, expect, it } from 'vitest';
import {
  collectJsonDiffContainerIds,
  compareJson,
  flattenJsonDiff,
  formatJsonDiff,
  type JsonDiffNode,
  type JsonDiffResult,
} from './jsonDiff';
import { tl } from '@/i18n/locale';

function expectOk(result: JsonDiffResult) {
  if (!result.ok) {
    throw new Error(`expected a valid diff: ${result.errors.map((error) => tl(error.message, 'zh')).join('; ')}`);
  }
  return result;
}

function findNode(root: JsonDiffNode, path: string): JsonDiffNode | undefined {
  if (root.path === path) return root;
  for (const child of root.children) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return undefined;
}

describe('compareJson', () => {
  it('treats reordered keys and insignificant whitespace as equal by default', () => {
    const result = expectOk(compareJson('{"b":2,"a":[1,2]}', '{\n  "a": [1, 2],\n  "b": 2\n}'));

    expect(result.equal).toBe(true);
    expect(result.stats).toEqual({ added: 0, removed: 0, modified: 0 });
  });

  it('detects added, removed and modified values with nested paths', () => {
    const left = `{
      "id": 1001,
      "version": "1.0.0",
      "tags": ["json", "format"],
      "author": { "name": "Qwen", "email": "old@example.com" },
      "deprecated": false
    }`;
    const right = `{
      "id": 1001,
      "version": "1.1.0",
      "tags": ["json", "format", "diff"],
      "author": { "name": "Qwen", "email": "hello@example.com", "homepage": "https://example.com" },
      "license": "MIT"
    }`;
    const result = expectOk(compareJson(left, right));

    expect(result.equal).toBe(false);
    expect(result.stats).toEqual({ added: 3, removed: 1, modified: 2 });

    expect(findNode(result.root, '$.version')?.status).toBe('modified');
    expect(findNode(result.root, '$.tags[2]')?.status).toBe('added');
    expect(findNode(result.root, '$.author.email')?.status).toBe('modified');
    expect(findNode(result.root, '$.author.homepage')?.status).toBe('added');
    expect(findNode(result.root, '$.license')?.status).toBe('added');
    expect(findNode(result.root, '$.deprecated')?.status).toBe('removed');
    expect(findNode(result.root, '$.author')?.status).toBe('unchanged');
  });

  it('does not count modified container ancestors twice', () => {
    const result = expectOk(compareJson('{"user":{"name":"a"}}', '{"user":{"name":"b"}}'));

    expect(result.stats).toEqual({ added: 0, removed: 0, modified: 1 });
    expect(findNode(result.root, '$.user')?.status).toBe('unchanged');
  });

  it('counts leaf values when an entire object or array is added', () => {
    const result = expectOk(
      compareJson('{"a":1}', '{"a":1,"tags":["x","y"],"meta":{"owner":"qwen"}}'),
    );

    expect(result.stats).toEqual({ added: 3, removed: 0, modified: 0 });
    expect(findNode(result.root, '$.tags')?.status).toBe('added');
    expect(findNode(result.root, '$.tags[1]')?.status).toBe('added');
    expect(findNode(result.root, '$.meta.owner')?.status).toBe('added');
  });

  it('counts an added empty object as one change', () => {
    const result = expectOk(compareJson('{}', '{"meta":{}}'));

    expect(result.stats).toEqual({ added: 1, removed: 0, modified: 0 });
    expect(findNode(result.root, '$.meta')?.kind).toBe('object');
  });

  it('compares arrays by index and marks extra items as removed', () => {
    const result = expectOk(compareJson('{"list":[1,2,3]}', '{"list":[1,4]}'));

    expect(result.stats).toEqual({ added: 0, removed: 1, modified: 1 });
    expect(findNode(result.root, '$.list[1]')).toMatchObject({
      status: 'modified',
      left: { preview: '2' },
      right: { preview: '4' },
    });
    expect(findNode(result.root, '$.list[2]')?.status).toBe('removed');
    expect(findNode(result.root, '$.list')?.status).toBe('unchanged');
  });

  it('treats a container/primitive type change as one modification', () => {
    const result = expectOk(compareJson('{"a":1}', '{"a":{"x":1}}'));
    const node = findNode(result.root, '$.a');

    expect(result.stats).toEqual({ added: 0, removed: 0, modified: 1 });
    expect(node).toMatchObject({ kind: 'value', status: 'modified', children: [] });
    expect(node?.left?.preview).toBe('1');
    expect(node?.right?.preview).toBe('{ 1 个字段 }');
  });

  it('supports primitive and null roots', () => {
    expect(expectOk(compareJson('null', 'null')).equal).toBe(true);
    expect(expectOk(compareJson('1', '"1"')).stats.modified).toBe(1);
    expect(findNode(expectOk(compareJson('1', '2')).root, '$')?.status).toBe('modified');
  });

  it('ignores duplicate keys by keeping the last value', () => {
    expect(expectOk(compareJson('{"a":1,"a":2}', '{"a":2}')).equal).toBe(true);
  });

  it('reports both sides when both JSON inputs are invalid', () => {
    const result = compareJson('{\n  "a": 1,\n}', '{"b": }');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.side)).toEqual(['left', 'right']);
    for (const error of result.errors) {
      expect(tl(error.message, 'zh')).toContain('JSON 解析失败');
      expect(error.line).toBeGreaterThan(0);
      expect(error.column).toBeGreaterThan(0);
    }
  });

  it('reports the valid side name and empty-input error', () => {
    const result = compareJson('', '{"a":1}');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].side).toBe('left');
    expect(tl(result.errors[0].message, 'zh')).toContain('输入内容为空');
  });

  it('ignores key order only when the option is enabled', () => {
    const ignored = expectOk(compareJson('{"a":1,"b":2}', '{"b":2,"a":1}'));
    expect(ignored.equal).toBe(true);

    const strict = expectOk(
      compareJson('{"a":1,"b":2}', '{"b":2,"a":1}', { ignoreKeyOrder: false }),
    );
    expect(strict.equal).toBe(false);
    expect(strict.stats).toEqual({ added: 0, removed: 0, modified: 1 });
    expect(strict.root).toMatchObject({ status: 'modified', orderChanged: true });
  });

  it('does not flag an inserted key as a reorder in strict mode', () => {
    const result = expectOk(
      compareJson('{"a":1,"b":2}', '{"a":1,"c":3,"b":2}', { ignoreKeyOrder: false }),
    );

    expect(result.root.orderChanged).toBe(false);
    expect(result.stats).toEqual({ added: 1, removed: 0, modified: 0 });
  });

  it('maps source line numbers for each side', () => {
    const left = `{
  "a": 1,
  "b": {
    "c": 2
  }
}`;
    const right = '{"a":1,"b":{"c":3}}';
    const result = expectOk(compareJson(left, right));
    const node = findNode(result.root, '$.b.c');

    expect(node?.left?.line).toBe(4);
    expect(node?.right?.line).toBe(1);
    expect(findNode(result.root, '$')?.left?.line).toBe(1);
  });

  it('formats special property names as bracket paths', () => {
    const result = expectOk(compareJson('{"a.b":{"c d":1}}', '{"a.b":{"c d":2}}'));

    expect(findNode(result.root, '$["a.b"]["c d"]')?.status).toBe('modified');
    expect(formatJsonDiff(result.root, result.stats)).toContain('$["a.b"]["c d"]');
  });
});

describe('flattenJsonDiff', () => {
  const left = '{"keep":1,"change":1,"nested":{"same":true,"deep":{"x":1}}}';
  const right = '{"keep":1,"change":2,"nested":{"same":true,"deep":{"x":2}}}';

  it('returns every node by default', () => {
    const result = expectOk(compareJson(left, right));
    const paths = flattenJsonDiff(result.root).map((row) => row.node.path);

    expect(paths).toEqual([
      '$',
      '$.keep',
      '$.change',
      '$.nested',
      '$.nested.same',
      '$.nested.deep',
      '$.nested.deep.x',
    ]);
  });

  it('hides unchanged subtrees when only changes are requested', () => {
    const result = expectOk(compareJson(left, right));
    const rows = flattenJsonDiff(result.root, { onlyChanges: true });

    expect(rows.map((row) => row.node.path)).toEqual([
      '$',
      '$.change',
      '$.nested',
      '$.nested.deep',
      '$.nested.deep.x',
    ]);
    expect(rows.find((row) => row.node.path === '$.nested.deep.x')?.depth).toBe(3);
  });

  it('does not descend into collapsed containers', () => {
    const result = expectOk(compareJson(left, right));
    const paths = flattenJsonDiff(result.root, {
      collapsed: new Set(['$.nested']),
    }).map((row) => row.node.path);

    expect(paths).toEqual(['$', '$.keep', '$.change', '$.nested']);
  });

  it('collects all expandable container ids', () => {
    const result = expectOk(compareJson(left, right));

    expect(collectJsonDiffContainerIds(result.root)).toEqual([
      '$',
      '$.nested',
      '$.nested.deep',
    ]);
  });
});

describe('formatJsonDiff', () => {
  it('returns an explicit message when both sides match', () => {
    const result = expectOk(compareJson('{"a":1}', '{"a":1}'));

    expect(formatJsonDiff(result.root, result.stats)).toBe('两侧 JSON 结构一致，无差异。');
  });

  it('renders a copy-friendly summary with paths and values', () => {
    const left = '{"name":"demo","tags":["a"],"old":1}';
    const right = '{"name":"demo2","tags":["a","b"],"new":null}';
    const result = expectOk(compareJson(left, right));
    const text = formatJsonDiff(result.root, result.stats);

    expect(text).toContain('JSON Diff（新增 2 · 删除 1 · 修改 1）');
    expect(text).toContain('~ $.name: "demo" => "demo2"');
    expect(text).toContain('+ $.tags[1] = "b"');
    expect(text).toContain('- $.old = 1');
    expect(text).toContain('+ $.new = null');
  });

  it('expands added nested objects into leaf paths', () => {
    const result = expectOk(compareJson('{"a":1}', '{"a":1,"o":{"x":1,"y":{"z":2}}}'));
    const text = formatJsonDiff(result.root, result.stats);

    expect(text).toContain('+ $.o.x = 1');
    expect(text).toContain('+ $.o.y.z = 2');
    expect(text).not.toContain('+ $.o =');
  });

  it('reports key-order changes in strict mode', () => {
    const result = expectOk(
      compareJson('{"a":1,"b":2}', '{"b":2,"a":1}', { ignoreKeyOrder: false }),
    );

    expect(formatJsonDiff(result.root, result.stats)).toContain('~ $: 键顺序变化');
  });
});
