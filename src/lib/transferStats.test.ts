import { describe, expect, test } from 'vitest';
import { RateTracker } from './transferStats';

describe('RateTracker', () => {
  test('instant uses the sliding window including inflight bytes', () => {
    const r = new RateTracker();
    r.sample(0, 0, 0);
    r.sample(1500, 0, 1500);
    expect(r.instant()).toBeCloseTo(1000, 6);
    // 在途字节计入：落盘停在 1500，但网络已多收了 500
    r.sample(1500, 500, 3000);
    expect(r.instant()).toBeCloseTo((1500 + 500 - 0) / 3000 * 1000, 6);
  });

  test('instant is 0 until the window has enough span', () => {
    const r = new RateTracker();
    r.sample(0, 0, 0);
    r.sample(100, 0, 100);
    expect(r.instant()).toBe(0);
  });

  test('average covers since the first sample and respects nowMs', () => {
    const r = new RateTracker();
    r.sample(0, 0, 0);
    r.sample(3000, 0, 3000);
    expect(r.average(3000)).toBeCloseTo(1000, 6);
    // 传输停顿：时间继续走，平均速度被摊薄
    expect(r.average(6000)).toBeCloseTo(500, 6);
  });

  test('eta takes the more conservative of instant and average', () => {
    const r = new RateTracker();
    r.sample(0, 0, 0);
    r.sample(10000, 0, 5000); // 前 5 秒只有 2000B/s
    r.sample(16000, 0, 6000); // 最近 1 秒冲到 6000B/s
    expect(r.instant()).toBeCloseTo(6000, 6);
    expect(r.average(6000)).toBeCloseTo(16000 / 6, 6);
    // 保守取较慢的平均值：6400B ÷ (16000/6 B/s) = 2400ms
    expect(r.eta(6400, 6000)).toBeCloseTo(2400, 6);
  });

  test('eta is Infinity without any rate, 0 when done', () => {
    const r = new RateTracker();
    expect(r.eta(100, 1000)).toBe(Number.POSITIVE_INFINITY);
    expect(r.eta(0, 1000)).toBe(0);
  });

  test('reset clears history', () => {
    const r = new RateTracker();
    r.sample(1000, 0, 1000);
    r.reset();
    expect(r.instant()).toBe(0);
    expect(r.average(2000)).toBe(0);
  });
});
