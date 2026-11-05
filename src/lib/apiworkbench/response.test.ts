import { describe, expect, test } from 'vitest';
import {
  MAX_DIFF_CHARS,
  RENDER_CHUNK_CHARS,
  baseMime,
  canDiff,
  headerValue,
  isEventStream,
  renderSlice,
  responseViewKind,
  suggestFilename,
} from './response';

const ct = (value: string): [string, string][] => [['Content-Type', value]];

describe('响应头读取', () => {
  const headers: [string, string][] = [['Content-Type', 'text/event-stream; charset=utf-8'], ['X-A', 'b']];

  test('取头不区分大小写', () => {
    expect(headerValue(headers, 'content-type')).toBe('text/event-stream; charset=utf-8');
    expect(headerValue([['content-TYPE', 'a']], 'Content-Type')).toBe('a');
    expect(headerValue(headers, 'missing')).toBeUndefined();
  });

  test('带 charset 的 event-stream 仍判为流', () => {
    expect(isEventStream(headers)).toBe(true);
    expect(isEventStream(ct('application/json'))).toBe(false);
    expect(isEventStream([])).toBe(false);
  });

  test('baseMime 去掉参数并小写', () => {
    expect(baseMime(ct('Application/JSON; charset=UTF-8'))).toBe('application/json');
    expect(baseMime([])).toBe('');
  });
});

describe('responseViewKind 先看声明的类型', () => {
  test('图片、PDF、HTML、XML、JSON 各自归位', () => {
    expect(responseViewKind(ct('image/png'), '[binary 3 bytes]')).toBe('image');
    expect(responseViewKind(ct('application/pdf'), '[binary 9 bytes]')).toBe('pdf');
    expect(responseViewKind(ct('text/html'), '<p>x</p>')).toBe('html');
    expect(responseViewKind(ct('application/xml'), '<a/>')).toBe('xml');
    expect(responseViewKind(ct('application/json; charset=utf-8'), 'not json at all')).toBe('json');
    expect(responseViewKind(ct('image/vnd.amazon.ebook'), '+json')).toBe('image');
  });

  test('压缩包、音视频、octet-stream 都归为不可预览的二进制', () => {
    for (const mime of ['application/zip', 'application/gzip', 'audio/mpeg', 'video/mp4', 'application/octet-stream']) {
      expect(responseViewKind(ct(mime), 'body')).toBe('binary');
    }
  });
});

describe('responseViewKind 的正文嗅探', () => {
  test('代理把 content-type 抹成 text/plain 时仍认 JSON', () => {
    expect(responseViewKind(ct('text/plain'), '{"a":1}')).toBe('json');
    expect(responseViewKind([], '[1,2,3]')).toBe('json');
  });

  test('看着像 JSON 但解不出来就按原文', () => {
    expect(responseViewKind(ct('text/plain'), '{broken')).toBe('text');
  });

  test('HTML 与 XML 的声明能认出来', () => {
    expect(responseViewKind([], '<!DOCTYPE html><html><body>x</body></html>')).toBe('html');
    expect(responseViewKind(ct('text/plain'), '<?xml version="1.0"?><a/>')).toBe('xml');
  });

  test('空体与含控制字符的体分开', () => {
    expect(responseViewKind(ct('text/plain'), '   \n')).toBe('empty');
    expect(responseViewKind(ct('text/plain'), 'PK\u0003\u0004binary')).toBe('binary');
  });

  test('普通文本就是 text', () => {
    expect(responseViewKind(ct('text/csv'), 'a,b\n1,2')).toBe('text');
    expect(responseViewKind(ct('application/graphql'), 'query { me }')).toBe('text');
  });
});

describe('renderSlice', () => {
  const text = 'x'.repeat(RENDER_CHUNK_CHARS * 2 + 5);

  test('第一块只给一个 chunk，剩下的记账', () => {
    const slice = renderSlice(text, 1);
    expect(slice.shown).toHaveLength(RENDER_CHUNK_CHARS);
    expect(slice.remaining).toBe(RENDER_CHUNK_CHARS + 5);
    expect(slice.blocks).toBe(1);
    expect(slice.totalBlocks).toBe(3);
  });

  test('继续加载到最后一块时 remaining 归零', () => {
    const slice = renderSlice(text, 3);
    expect(slice.shown).toHaveLength(text.length);
    expect(slice.remaining).toBe(0);
  });

  test('块数越界不会算出负数或第 4 块', () => {
    const slice = renderSlice(text, 99);
    expect(slice.blocks).toBe(3);
    expect(slice.remaining).toBe(0);
  });

  test('短文本一屏就够', () => {
    expect(renderSlice('short')).toMatchObject({ remaining: 0, blocks: 1, totalBlocks: 1 });
    expect(renderSlice('')).toMatchObject({ shown: '', remaining: 0, totalBlocks: 1 });
  });
});

describe('canDiff', () => {
  test('两侧都在闸门内才比', () => {
    expect(canDiff('a', 'b')).toBe(true);
    expect(canDiff('a', 'b'.repeat(MAX_DIFF_CHARS + 1))).toBe(false);
    expect(canDiff('x'.repeat(MAX_DIFF_CHARS + 1), 'a')).toBe(false);
  });

  test('刚好等于闸门仍然放行', () => {
    const big = 'y'.repeat(MAX_DIFF_CHARS);
    expect(canDiff(big, big)).toBe(true);
  });
});

describe('suggestFilename', () => {
  test('content-disposition 优先，filename*= 的百分号编码会被解开', () => {
    expect(suggestFilename([['Content-Disposition', 'attachment; filename="report.pdf"']], 'https://a/x')).toBe('report.pdf');
    expect(suggestFilename([['content-disposition', "attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.csv"]], 'https://a/x')).toBe('报告.csv');
    expect(suggestFilename([['Content-Disposition', 'attachment; filename="100%.png"']], 'https://a/x')).toBe('100%.png');
  });

  test('没有声明时取 URL 末段，忽略查询与片段', () => {
    expect(suggestFilename([], 'https://a/b/logo.png?x=1#frag')).toBe('logo.png');
    expect(suggestFilename([], 'https://a/b/')).toBe('b');
  });

  test('末段过长或没有路径就兜底', () => {
    expect(suggestFilename([], `https://a/${'z'.repeat(80)}`)).toBe('response');
    expect(suggestFilename([], '')).toBe('response');
  });
});
