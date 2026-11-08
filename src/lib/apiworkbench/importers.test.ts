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

const zh = (value: ReturnType<typeof importWorkbenchFile>['ignored'][number]) => (typeof value === 'string' ? value : value.zh);

describe('detectImportFormat', () => {
  test('两种文件各认各的形状', () => {
    expect(detectImportFormat(POSTMAN)).toBe('postman');
    expect(detectImportFormat(HAR)).toBe('har');
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
    expect(bundle.requestCount).toBe(1);
  });

  test('HAR 的响应面被点名丢弃', () => {
    const bundle = importWorkbenchFile(HAR);
    expect(bundle.collections[0].root.requests[0].url).toBe('https://api.test/h');
    expect(bundle.ignored.map(zh).join(' ')).toContain('响应');
  });

  test('非法 JSON 说的是「不是合法 JSON」，不是「认不出格式」', () => {
    expect(() => importWorkbenchFile('not json')).toThrow(/不是合法 JSON/);
  });

  test('认不出时把两种格式该长什么样说清，而不是甩一个「解析失败」', () => {    let thrown: unknown;
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
