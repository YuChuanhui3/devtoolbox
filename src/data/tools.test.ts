import { describe, expect, test } from 'vitest';
import {
  LEGACY_TOOL_IDS,
  TOOLS,
  compareToolName,
  getTool,
  getToolsByCategory,
  getToolsByIds,
  hasSortPinyin,
  searchTools,
  sortToolsForLocale,
  toolPath,
} from './tools';
import { CATEGORIES } from './categories';

describe('展示排序（自动）', () => {
  test('TOOLS 按分类拼音序分组，组内按名称拼音首字母排序', () => {
    const categoryOrder = new Map(CATEGORIES.map((c, i) => [c.id, i]));
    let prevIndex = -1;
    for (const tool of TOOLS) {
      const index = categoryOrder.get(tool.category)!;
      expect(index).toBeGreaterThanOrEqual(prevIndex);
      prevIndex = index;
    }
    for (const category of CATEGORIES) {
      const names = getToolsByCategory(category.id).map((tool) => tool.name);
      expect(names).toEqual([...names].sort((a, b) => compareToolName({ name: a }, { name: b })));
    }
  });

  test('每个工具名的首字都可排序（拉丁字母或已登记的汉字）', () => {
    const missing = TOOLS.filter((tool) => !hasSortPinyin(tool.name)).map((tool) => tool.name);
    expect(missing).toEqual([]);
  });
});

describe('双语元数据', () => {
  test('每个工具都有 nameEn 与 descriptionEn', () => {
    const missing = TOOLS.filter((tool) => !tool.nameEn || !tool.descriptionEn).map((tool) => tool.id);
    expect(missing).toEqual([]);
  });

  test('en 模式下分类内按英文名字母序排列', () => {
    for (const category of CATEGORIES) {
      const names = sortToolsForLocale(getToolsByCategory(category.id), 'en').map((tool) => tool.nameEn!);
      expect(names).toEqual([...names].sort((a, b) => compareToolName({ name: a }, { name: b })));
    }
  });

  test('英文名与英文说明参与搜索', () => {
    expect(searchTools('subnet mask')[0]?.id).toBe('ip-toolkit');
    expect(searchTools('formatter').some((tool) => tool.id === 'json-toolkit')).toBe(true);
    expect(searchTools('QR', 'en')[0]?.id).toBe('qr-generator');
  });
});

describe('tool registry search', () => {
  test('returns all tools for an empty query', () => {
    expect(searchTools('')).toHaveLength(TOOLS.length);
  });

  test('ranks exact aliases above partial name matches', () => {
    const results = searchTools('md');
    expect(results[0]?.id).toBe('markdown-editor');
  });

  test('finds tools by name, alias and tag', () => {
    expect(searchTools('base64编码')[0]?.id).toBe('codec-toolkit');
    expect(searchTools('jsonpath')[0]?.id).toBe('json-toolkit');
    expect(searchTools('二维码')[0]?.id).toBe('qr-generator');
    expect(searchTools('图片').some((tool) => tool.category === 'image')).toBe(true);
  });

  test('returns no results for unmatched queries', () => {
    expect(searchTools('不存在的工具关键词')).toHaveLength(0);
  });

  test('every tool has a unique id and route-friendly id', () => {
    const ids = TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('JSON 工具箱合并', () => {
  test('data category keeps the toolkit plus json-to-code and no legacy ids', () => {
    const dataToolIds = getToolsByCategory('data').map((tool) => tool.id);
    expect(dataToolIds).toEqual(['json-toolkit', 'json-to-code']);
    expect(Object.keys(LEGACY_TOOL_IDS).every((id) => !dataToolIds.includes(id))).toBe(true);
  });

  test('resolves all legacy routes to their unified toolkit', () => {
    for (const [legacyId, targetId] of Object.entries(LEGACY_TOOL_IDS)) {
      expect(getTool(legacyId)?.id).toBe(targetId);
      expect(toolPath(legacyId)).toBe(`/tools/${targetId}`);
    }
  });

  test('finds the toolkit from old keywords', () => {
    expect(searchTools('json格式化')[0]?.id).toBe('json-toolkit');
    expect(searchTools('schema校验')[0]?.id).toBe('json-toolkit');
    expect(searchTools('生成schema').some((tool) => tool.id === 'json-toolkit')).toBe(true);
    expect(searchTools('csv转json')[0]?.id).toBe('json-toolkit');
    expect(searchTools('xml转json')[0]?.id).toBe('json-toolkit');
    expect(searchTools('json对比')[0]?.id).toBe('json-toolkit');
    expect(searchTools('jsondiff')[0]?.id).toBe('json-toolkit');
  });

  test('saved legacy ids collapse to one toolkit entry', () => {
    expect(getToolsByIds(['json-formatter', 'jsonpath', 'json-schema'])).toHaveLength(1);
    expect(getToolsByIds(['csv-to-json', 'json-to-csv', 'json-diff', 'format-converter'])).toHaveLength(1);
    expect(getToolsByIds(['csv-to-json', 'json-diff', 'format-converter'])[0]?.id).toBe('json-toolkit');
    expect(getToolsByIds(['yaml-to-json'], 1)[0]?.id).toBe('json-toolkit');
  });
});

describe('新一批工具搜索直达', () => {
  const cases: Array<[string, string]> = [
    ['htpasswd生成', 'hash-toolkit'],
    ['子网掩码', 'ip-toolkit'],
    ['base32编码', 'codec-toolkit'],
    ['vmess解析', 'link-parser-toolkit'],
    ['迅雷解密', 'link-parser-toolkit'],
    ['bcrypt验证', 'hash-toolkit'],
    ['莫斯密码', 'codec-toolkit'],
    ['gzip压缩', 'codec-toolkit'],
    ['type7解密', 'link-parser-toolkit'],
    ['ppi计算', 'dev-calc-toolkit'],
    ['种子转磁力', 'link-parser-toolkit'],
    ['自签名证书', 'ssl-cert'],
    ['rc4加密', 'crypto-toolkit'],
    ['rsa密钥生成', 'crypto-toolkit'],
    ['gravatar', 'hash-toolkit'],
    ['mysql密码', 'random-toolkit'],
    ['escape解密', 'codec-toolkit'],
    ['unicode中文互转', 'codec-toolkit'],
    ['GUID随机生成', 'random-toolkit'],
    ['utf8编码', 'codec-toolkit'],
    ['crc32计算', 'dev-calc-toolkit'],
    ['杀死端口进程', 'dev-reference'],
  ];
  test.each(cases)('“%s” 直达 %s', (query, id) => {
    expect(searchTools(query)[0]?.id).toBe(id);
  });
});
