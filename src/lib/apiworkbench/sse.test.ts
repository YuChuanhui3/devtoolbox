import { describe, expect, test } from 'vitest';
import { createSseState, feedSse, flushSse, parseSse } from './sse';
import type { SseEvent, SseState } from './sse';

/** 把整段文本按任意边界切成 chunk 依次喂入，收集所有帧。 */
function feedChunks(chunks: string[]) {
  let state: SseState = createSseState();
  const events: SseEvent[] = [];
  const perChunk: number[] = [];
  for (const chunk of chunks) {
    const fed = feedSse(state, chunk);
    state = fed.state;
    events.push(...fed.events);
    perChunk.push(fed.events.length);
  }
  const flushed = flushSse(state);
  return { state, events: [...events, ...flushed.events], perChunk, discarded: flushed.discarded };
}

describe('parseSse', () => {
  test('默认事件名 message，多行 data 用 \\n 连接', () => {
    expect(parseSse('data: first\ndata: second\n\n')).toEqual([{ event: 'message', data: 'first\nsecond' }]);
  });

  test('event/id 落在帧上，retry 是流级设置只进 state', () => {
    expect(parseSse('event: done\nid: 42\nretry: 3000\ndata: bye\n\n')).toEqual([{ event: 'done', data: 'bye', id: '42' }]);
    expect(feedSse(createSseState(), 'retry: 3000\ndata: x\n\n').state.retry).toBe(3000);
  });

  test('注释行与未知字段不产出帧', () => {
    expect(parseSse(': keep-alive\n\ndata: real\n\n')).toEqual([{ event: 'message', data: 'real' }]);
    expect(parseSse('x-custom: ignored\ndata: kept\n\n')).toEqual([{ event: 'message', data: 'kept' }]);
  });

  test('只有 event 没有 data 的帧不派发', () => {
    expect(parseSse('event: ping\n\n')).toEqual([]);
  });

  test('值的前导空格只去一个，冒号只切第一处', () => {
    expect(parseSse('data:  {"a":"b:c"}\n\n')[0].data).toBe(' {"a":"b:c"}');
    expect(parseSse('data:{"a":"b:c"}\n\n')[0].data).toBe('{"a":"b:c"}');
  });

  test('没有冒号的行按空值字段处理', () => {
    expect(parseSse('data\ndata\ndata\n\n')[0].data).toBe('\n\n');
  });

  test('\\r\\n、\\r、\\n 三种行分隔符等价', () => {
    const expected = [{ event: 'message', data: 'a' }, { event: 'message', data: 'b' }];
    expect(parseSse('data: a\r\n\r\ndata: b\r\n\r\n')).toEqual(expected);
    expect(parseSse('data: a\r\rdata: b\r\r')).toEqual(expected);
  });

  test('一帧内的空行才算边界，连续空行不产出空帧', () => {
    expect(parseSse('data: a\n\n\n\ndata: b\n\n')).toHaveLength(2);
  });

  test('半帧在流结束时被标成 incomplete 而不是消失', () => {
    const { events, discarded } = feedChunks(['data: tail']);
    expect(events).toEqual([{ event: 'message', data: 'tail', incomplete: true }]);
    expect(discarded).toBe(false);
  });

  test('攒不出 data 的残帧算丢弃，并如实报告', () => {
    const { events, discarded } = feedChunks(['event: broken']);
    expect(events).toEqual([]);
    expect(discarded).toBe(true);
  });

  test('retry 非数字被丢弃并记账', () => {
    const state = feedSse(createSseState(), 'retry: soon\ndata: x\n\n').state;
    expect(state.dropped).toBe(1);
    expect(state.retry).toBeUndefined();
  });
});

describe('feedSse 增量', () => {
  test('字段跨 chunk 不断裂：按每个字符切一次仍只得到一帧', () => {
    const raw = 'event: tick\nid: 7\ndata: {"n":1}\n\n';
    const { events, perChunk } = feedChunks([...raw]);
    expect(events).toEqual([{ event: 'tick', data: '{"n":1}', id: '7' }]);
    expect(perChunk.reduce((a, b) => a + b, 0)).toBe(1);
  });

  test('\\r\\n 被切在两个 chunk 之间时不会多出一个空行', () => {
    const { events } = feedChunks(['data: a\r', '\n\r', '\ndata: b\r\n\r\n']);
    expect(events).toEqual([{ event: 'message', data: 'a' }, { event: 'message', data: 'b' }]);
  });

  test('帧边界落在 chunk 中间：前半与后半各自成帧', () => {
    const { events, perChunk } = feedChunks(['data: one\n\ndata: tw', 'o\n\n']);
    expect(events).toEqual([{ event: 'message', data: 'one' }, { event: 'message', data: 'two' }]);
    expect(perChunk).toEqual([1, 1]);
  });

  test('lastEventId 只在带 id 的帧上更新', () => {
    let state = feedSse(createSseState(), 'data: a\nid: 1\n\n').state;
    expect(state.lastEventId).toBe('1');
    state = feedSse(state, 'data: b\n\n').state;
    expect(state.lastEventId).toBe('1');
  });

  test('含 NUL 的 id 被丢弃但不影响 data', () => {
    const { events, state } = feedSse(createSseState(), 'id: a\u0000b\ndata: keep\n\n');
    expect(events).toEqual([{ event: 'message', data: 'keep' }]);
    expect(state.dropped).toBe(1);
  });

  test('一次喂入多帧', () => {
    expect(feedSse(createSseState(), 'data: 1\n\ndata: 2\n\ndata: 3\n\n').events).toHaveLength(3);
  });
});
