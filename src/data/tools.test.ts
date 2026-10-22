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
    expect(searchTools('subnet mask')[0]?.id).toBe('subnet-mask');
    expect(searchTools('formatter').some((tool) => tool.id === 'json-formatter')).toBe(true);
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
    expect(searchTools('base64')[0]?.id).toBe('base64');
    expect(searchTools('jsonpath')[0]?.id).toBe('jsonpath');
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

describe('bidirectional conversion tools', () => {
  test('lists each reversible converter once in its category', () => {
    const dataToolIds = getToolsByCategory('data').map((tool) => tool.id);
    expect(dataToolIds.filter((id) => id === 'json-to-yaml')).toHaveLength(1);
    expect(dataToolIds.filter((id) => id === 'json-to-xml')).toHaveLength(1);
    expect(dataToolIds.filter((id) => id === 'json-to-csv')).toHaveLength(1);
    expect(Object.keys(LEGACY_TOOL_IDS).every((id) => !dataToolIds.includes(id))).toBe(true);
  });

  test('resolves legacy reverse routes to the merged tool', () => {
    expect(getTool('yaml-to-json')?.id).toBe('json-to-yaml');
    expect(getTool('xml-to-json')?.id).toBe('json-to-xml');
    expect(getTool('csv-to-json')?.id).toBe('json-to-csv');
    expect(toolPath('csv-to-json')).toBe('/tools/json-to-csv');
    expect(toolPath('yaml-to-json')).toBe('/tools/json-to-yaml');
  });

  test('finds merged tools from reverse direction keywords', () => {
    expect(searchTools('csv转json')[0]?.id).toBe('json-to-csv');
    expect(searchTools('yaml转json')[0]?.id).toBe('json-to-yaml');
    expect(searchTools('xml转json')[0]?.id).toBe('json-to-xml');
  });

  test('resolves saved legacy ids without duplicate entries', () => {
    expect(getToolsByIds(['csv-to-json', 'json-to-csv'])).toHaveLength(1);
    expect(getToolsByIds(['csv-to-json', 'json-to-csv'])[0]?.id).toBe('json-to-csv');
    expect(getToolsByIds(['yaml-to-json'], 1)[0]?.id).toBe('json-to-yaml');
  });
});

describe('新一批工具搜索直达', () => {
  const cases: Array<[string, string]> = [
    ['htpasswd生成', 'htpasswd'],
    ['子网掩码', 'subnet-mask'],
    ['base32编码', 'base-codec'],
    ['vmess解析', 'proxy-link'],
    ['迅雷解密', 'thunder-url'],
    ['bcrypt验证', 'pwdhash'],
    ['莫斯密码', 'morse-codec'],
    ['gzip压缩', 'gzip-codec'],
    ['type7解密', 'type7-cisco'],
    ['ppi计算', 'ppi-calc'],
    ['种子转磁力', 'torrent-magnet'],
    ['自签名证书', 'ssl-cert'],
    ['rc4加密', 'symcipher'],
    ['rsa密钥生成', 'rsa-codec'],
    ['gravatar', 'hash'],
    ['mysql密码', 'password-generator'],
    ['escape解密', 'js-escape'],
    ['unicode中文互转', 'unicode'],
    ['GUID随机生成', 'uuid'],
    ['utf8编码', 'url-codec'],
    ['crc32计算', 'crc-calc'],
    ['杀死端口进程', 'linux-commands'],
  ];
  test.each(cases)('“%s” 直达 %s', (query, id) => {
    expect(searchTools(query)[0]?.id).toBe(id);
  });
});
