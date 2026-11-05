import { describe, expect, test } from 'vitest';
import { tl } from '@/i18n/locale';
import { toToolError } from '../errors';
import { detectImportFormat, importWorkbenchFile } from './importers';

const POSTMAN = JSON.stringify({
  info: { name: 'PM', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [{ name: 'Ping', request: { method: 'GET', url: { raw: 'https://api.test/ping' } } }],
});

const HAR = JSON.stringify({
  log: { creator: { name: 'Chrome' }, entries: [{ request: { method: 'GET', url: 'https://api.test/h', headers: [] }, response: { status: 200 } }] },
});

const HOP_COLLECTION = JSON.stringify([{ v: 12, name: 'Hop', folders: [], requests: [{ v: '1', name: 'Q', endpoint: 'https://api.test/q', method: 'GET', params: [], headers: [], auth: { authType: 'none', authActive: true }, body: { contentType: null, body: null } }] }]);

const HOP_ENVS = JSON.stringify([{ v: 2, name: 'Prod', variables: [{ key: 'host', initialValue: 'https://api.test', currentValue: '', secret: false }] }]);

const zh = (value: ReturnType<typeof importWorkbenchFile>['ignored'][number]) => (typeof value === 'string' ? value : value.zh);

describe('detectImportFormat', () => {
  test('三种文件各认各的形状', () => {
    expect(detectImportFormat(POSTMAN)).toBe('postman');
    expect(detectImportFormat(HAR)).toBe('har');
    expect(detectImportFormat(HOP_COLLECTION)).toBe('hoppscotch');
    expect(detectImportFormat(HOP_ENVS)).toBe('hoppscotch');
  });

  test('坏 JSON 与不相干的对象认不出，而不是硬猜一种', () => {
    expect(detectImportFormat('not json')).toBeNull();
    expect(detectImportFormat('{"hello":1}')).toBeNull();
    expect(detectImportFormat('[1,2]')).toBeNull();
  });
});

describe('importWorkbenchFile', () => {
  test('自动识别 Postman：一个集合、没有环境、说明已换成人话', () => {
    const bundle = importWorkbenchFile(POSTMAN);
    expect(bundle.format).toBe('postman');
    expect(bundle.collections.map((c) => c.name)).toEqual(['PM']);
    expect(bundle.environments).toEqual([]);
    expect(bundle.requestCount).toBe(1);
  });

  test('HAR 的响应面被点名丢弃', () => {
    const bundle = importWorkbenchFile(HAR);
    expect(bundle.collections[0].root.requests[0].url).toBe('https://api.test/h');
    expect(bundle.ignored.map(zh).join(' ')).toContain('响应');
  });

  test('Hoppscotch 环境数组只出环境，不出空集合', () => {
    const bundle = importWorkbenchFile(HOP_ENVS);
    expect(bundle.collections).toEqual([]);
    expect(bundle.environments.map((e) => e.name)).toEqual(['Prod']);
  });

  test('手选格式能纠正识别结果：把 Hoppscotch 当 Postman 读会如实报错', () => {
    expect(() => importWorkbenchFile(HOP_COLLECTION, 'postman')).toThrow(/不是 Postman 集合文件|没有可导入的请求/);
  });

  test('非法 JSON 说的是「不是合法 JSON」，不是「认不出格式」', () => {
    expect(() => importWorkbenchFile('not json')).toThrow(/不是合法 JSON/);
  });

  test('认不出时把三种格式该长什么样说清，而不是甩一个「解析失败」', () => {    let thrown: unknown;
    try {
      importWorkbenchFile('{"hello":1}');
    } catch (error) {
      thrown = error;
    }
    const err = toToolError(thrown);
    const text = `${tl(err.localized, 'zh')} ${tl(err.hint ?? { zh: '', en: '' }, 'zh')}`;
    expect(text).toContain('Postman');
    expect(text).toContain('HAR');
    expect(text).toContain('curl');
  });
});
