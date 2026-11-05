import { describe, expect, test } from 'vitest';
import {
  LEGACY_TOOL_IDS,
  TOOLS,
  compareToolName,
  getTool,
  getToolsByCategory,
  getToolsByIds,
  hasSortPinyin,
  resolveToolTarget,
  searchTools,
  searchToolTargets,
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

describe('HTML 工具并入代码格式化工具箱', () => {
  test('旧链接解析到 web 页签 + 对应子功能', () => {
    expect(resolveToolTarget('html-entities')).toEqual({ toolId: 'code-format-toolkit', mode: 'web', sub: 'entities' });
    expect(resolveToolTarget('html-cleaner')).toEqual({ toolId: 'code-format-toolkit', mode: 'web', sub: 'cleaner' });
    expect(resolveToolTarget('sql-formatter')).toEqual({ toolId: 'code-format-toolkit', mode: 'sql' });
  });

  test('两个旧 ID 不再作为独立工具存在', () => {
    expect(TOOLS.some((tool) => tool.id === 'html-entities' || tool.id === 'html-cleaner')).toBe(false);
    expect(getTool('html-entities')?.id).toBe('code-format-toolkit');
  });

  test('“html转义” 能搜到格式化工具箱', () => {
    expect(searchTools('html转义')[0]?.id).toBe('code-format-toolkit');
  });
});

describe('WebSocket 测试并入 API 工作台', () => {
  test('旧链接解析到 websocket 页签', () => {
    expect(resolveToolTarget('websocket-client')).toEqual({ toolId: 'http-simulator', mode: 'websocket' });
  });

  test('旧 ID 不再作为独立工具存在', () => {
    expect(TOOLS.some((tool) => tool.id === 'websocket-client')).toBe(false);
    expect(getTool('websocket-client')?.id).toBe('http-simulator');
  });

  test('“模拟websocket” 与 “ws在线” 都能搜到工作台', () => {
    expect(searchTools('模拟websocket')[0]?.id).toBe('http-simulator');
    expect(searchTools('ws在线')[0]?.id).toBe('http-simulator');
    expect(searchToolTargets('websocket').some((hit) => hit.tool.id === 'http-simulator' && hit.sub?.id === 'websocket')).toBe(true);
  });
});

describe('搜索直达子功能页签', () => {  test('“JWT” 命中加解密工具箱的 jwt 页签', () => {
    const hits = searchToolTargets('JWT');
    expect(hits.some((h) => h.tool.id === 'crypto-toolkit' && h.sub?.id === 'jwt')).toBe(true);
  });

  test('子页签跟随其工具箱、且每个工具箱最多带出 2 个', () => {
    const hits = searchToolTargets('json');
    const firstTool = hits[0]?.tool.id;
    const subsOfFirst = hits.filter((h) => h.tool.id === firstTool && h.sub).length;
    expect(subsOfFirst).toBeLessThanOrEqual(2);
    expect(hits.some((h) => h.tool.id === firstTool && !h.sub)).toBe(true);
  });

  test.each([
    ['磁力', 'link-parser-toolkit', 'torrent-magnet'],
    ['子网', 'ip-toolkit', 'subnet'],
    ['bcrypt', 'hash-toolkit', 'pwdhash'],
    ['状态码', 'dev-reference', 'http-status'],
    ['录屏', 'transfer-toolkit', 'salvage'],
  ] as const)('“%s” 直达 %s 的 %s', (query, toolId, subId) => {
    const hit = searchToolTargets(query).find((h) => h.sub?.id === subId);
    expect(hit?.tool.id).toBe(toolId);
  });

  test('无子功能的工具只出裸条目；空查询受 limit 约束', () => {
    expect(searchToolTargets('时间戳').every((h) => h.tool.id !== 'json-toolkit' || !h.sub || h.sub.id)).toBe(true);
    expect(searchToolTargets('', 'zh', 100)).toHaveLength(TOOLS.length);
    expect(searchToolTargets('')).toHaveLength(12);
  });

  test('每个 subFeatures id 都是合法页签寻址（与 LEGACY_TOOL_MODES 同构）', () => {
    for (const tool of TOOLS) {
      for (const sub of tool.subFeatures ?? []) {
        expect(sub.id).toMatch(/^[a-z0-9-]+$/);
        expect(sub.name.zh.length).toBeGreaterThan(0);
        expect(sub.name.en.length).toBeGreaterThan(0);
      }
    }
  });
});
