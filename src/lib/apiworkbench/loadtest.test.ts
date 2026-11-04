import { describe, expect, test } from 'vitest';
import {
  bucketSeries,
  classifyError,
  clampPlan,
  LoadTestCancelled,
  percentile,
  runLoadTest,
  type LoadSample,
  type LoadTestPlan,
} from './loadtest';

const base: LoadTestPlan = { concurrency: 4, mode: 'count', iterations: 10, timeoutMs: 1000 };
const noop = () => undefined;
const freshSignal = () => new AbortController().signal;

function sample(partial: Partial<LoadSample> = {}): LoadSample {
  return { index: 0, startMs: 0, latencyMs: 10, ok: true, ...partial };
}

describe('runLoadTest', () => {
  test('count 模式跑满计划次数且并发峰值不超上限', async () => {
    let inFlight = 0;
    let peak = 0;
    const task = {
      async run() {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return { ok: true, status: 200, ms: 2 };
      },
    };
    const result = await runLoadTest({ ...base, concurrency: 3, iterations: 12 }, task, noop, freshSignal());
    expect(result.completed).toBe(12);
    expect(result.stopReason).toBe('count');
    expect(peak).toBeLessThanOrEqual(3);
    expect(result.samples).toHaveLength(12);
    expect(new Set(result.samples.map((s) => s.index)).size).toBe(12);
  });

  test('duration 模式到期即停', async () => {
    const task = {
      async run() {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { ok: true, status: 200, ms: 5 };
      },
    };
    const start = Date.now();
    const result = await runLoadTest({ concurrency: 2, mode: 'duration', seconds: 1, timeoutMs: 500 }, task, noop, freshSignal());
    expect(result.stopReason).toBe('duration');
    expect(Date.now() - start).toBeLessThan(2500);
    expect(result.completed).toBeGreaterThan(0);
  });

  test('运行中取消：stopReason=cancel 且已完成样本保留', async () => {
    const controller = new AbortController();
    let clock = 0;
    let done = 0;
    const task = {
      async run(signal: AbortSignal) {
        const reject = new Promise<never>((_resolve, rejectPromise) => {
          signal.addEventListener('abort', () => rejectPromise(signal.reason), { once: true });
        });
        const outcome = await Promise.race([new Promise((resolve) => setTimeout(() => resolve('ok'), 50)), reject]);
        if (outcome === 'ok') {
          clock += 10;
          done += 1;
        }
        return { ok: outcome === 'ok', status: 200, ms: 10 };
      },
    };
    const result = await runLoadTest(
      { concurrency: 2, mode: 'duration', seconds: 60, timeoutMs: 50_000 },
      task,
      () => {
        if (done >= 2 && !controller.signal.aborted) controller.abort(new LoadTestCancelled());
      },
      controller.signal,
      () => clock,
    );
    expect(result.stopReason).toBe('cancel');
    expect(result.samples.length).toBeGreaterThanOrEqual(2);
    expect(result.completed).toBe(result.samples.length);
  });

  test('连续全败触发熔断并给出错误分类', async () => {
    const task = {
      async run() {
        return { ok: false, status: 503, ms: 1 };
      },
    };
    const result = await runLoadTest({ concurrency: 2, mode: 'count', iterations: 1000, timeoutMs: 1000 }, task, noop, freshSignal());
    expect(result.stopReason).toBe('circuit');
    expect(result.failed).toBeGreaterThanOrEqual(20);
    expect(result.completed).toBe(result.failed);
    expect(result.errorCounts['http-5xx']).toBe(result.failed);
  });

  test('task 抛错记为 task-error 并保留统计', async () => {
    const task = {
      async run(): Promise<{ ok: boolean; status?: number; ms: number }> {
        throw new Error('boom');
      },
    };
    const result = await runLoadTest({ ...base, concurrency: 1 }, task, noop, freshSignal());
    expect(result.stopReason).toBe('task-error');
    expect(result.samples).toHaveLength(0);
  });
});

describe('统计函数', () => {
  test('percentile 最近秩与边界', () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(percentile(sorted, 0)).toBe(10);
    expect(percentile(sorted, 50)).toBe(30);
    expect(percentile(sorted, 95)).toBe(50);
    expect(percentile(sorted, 100)).toBe(50);
    expect(percentile([], 50)).toBe(0);
    expect(percentile([7], 13)).toBe(7);
  });

  test('bucketSeries 按完成秒分桶', () => {
    const samples = [
      sample({ startMs: 100, latencyMs: 800 }),
      sample({ startMs: 900, latencyMs: 200 }),
      sample({ startMs: 1100, latencyMs: 100, ok: false }),
    ];
    const series = bucketSeries(samples);
    expect(series).toEqual([
      { atSecond: 1, rps: 1, p95: 800 },
      { atSecond: 2, rps: 1, p95: 200 },
    ]);
  });

  test('clampPlan 裁剪越界计划', () => {
    expect(clampPlan({ concurrency: 999, mode: 'count', iterations: 999_999, timeoutMs: 0 }).concurrency).toBe(20);
    const clamped = clampPlan({ concurrency: 0, mode: 'count', timeoutMs: -5 });
    expect(clamped.concurrency).toBe(1);
    expect(clamped.maxTasks).toBe(1);
    expect(clamped.timeoutMs).toBe(100);
    expect(clampPlan({ concurrency: 2, mode: 'duration', seconds: 999, timeoutMs: 1000 }).deadlineMs).toBe(120_000);
  });

  test('classifyError 分档', () => {
    expect(classifyError(undefined, false)).toBe('network');
    expect(classifyError(undefined, true)).toBe('timeout');
    expect(classifyError(404, false)).toBe('http-4xx');
    expect(classifyError(500, false)).toBe('http-5xx');
    expect(classifyError(302, false)).toBe('other');
  });
});
