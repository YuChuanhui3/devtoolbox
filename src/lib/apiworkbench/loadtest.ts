export type LoadTestStopReason = 'count' | 'duration' | 'cancel' | 'circuit' | 'task-error';

export const LOAD_ERROR_CLASSES = ['timeout', 'network', 'http-4xx', 'http-5xx', 'other'] as const;
export type LoadErrorClass = (typeof LOAD_ERROR_CLASSES)[number];

export class LoadTestCancelled extends Error {}

export interface LoadSample {
  index: number;
  /** 自开跑时间的启动毫秒。 */
  startMs: number;
  /** 单请求耗时。 */
  latencyMs: number;
  ok: boolean;
  status?: number;
  errorClass?: LoadErrorClass;
}

export interface LoadTestPlan {
  concurrency: number;
  mode: 'count' | 'duration';
  /** count 模式的总次数。 */
  iterations?: number;
  /** duration 模式的秒数。 */
  seconds?: number;
  timeoutMs: number;
}

export interface LoadTask {
  run(signal: AbortSignal): Promise<{ ok: boolean; status?: number; ms: number }>;
}

export interface LoadProgress {
  samples: LoadSample[];
  completed: number;
  failed: number;
  inFlight: number;
  elapsedMs: number;
}

export interface LoadTestResult {
  samples: LoadSample[];
  elapsedMs: number;
  completed: number;
  failed: number;
  stopReason: LoadTestStopReason;
  errorCounts: Partial<Record<LoadErrorClass, number>>;
}

export const MAX_CONCURRENCY = 20;
export const MAX_ITERATIONS = 10_000;
export const MAX_DURATION_S = 120;
export const MAX_SAMPLES = 50_000;
/** 至少跑满这么多次才允许熔断。 */
export const CIRCUIT_BREAKER_FAILURES = 20;

export function clampPlan(plan: LoadTestPlan): {
  concurrency: number;
  maxTasks: number;
  deadlineMs: number;
  timeoutMs: number;
} {
  const concurrency = Math.min(Math.max(1, Math.round(plan.concurrency) || 1), MAX_CONCURRENCY);
  const iterations = Math.min(Math.max(1, Math.round(plan.iterations ?? 0) || 1), MAX_ITERATIONS);
  const seconds = Math.min(Math.max(1, Math.round(plan.seconds ?? 0) || 1), MAX_DURATION_S);
  return {
    concurrency,
    maxTasks: plan.mode === 'count' ? iterations : Math.min(MAX_SAMPLES, seconds * concurrency * 50 + concurrency),
    deadlineMs: plan.mode === 'count' ? Number.POSITIVE_INFINITY : seconds * 1000,
    timeoutMs: Math.max(100, Math.round(plan.timeoutMs) || 15_000),
  };
}

export function classifyError(status: number | undefined, timedOut: boolean): LoadErrorClass {
  if (timedOut) return 'timeout';
  if (status === undefined) return 'network';
  if (status >= 500) return 'http-5xx';
  if (status >= 400) return 'http-4xx';
  return 'other';
}

/** p ∈ [0,100]，对已排序数组取最近秩分位；空数组返回 0。 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const clamped = Math.min(Math.max(p, 0), 100);
  const index = Math.round((clamped / 100) * (sorted.length - 1));
  return sorted[index];
}

export interface LoadSeriesPoint {
  /** 完成时刻落入的整秒（自开跑起，1、2、3…）。 */
  atSecond: number;
  rps: number;
  p95: number;
}

/** 按完成时刻的整秒分桶；桶内延迟各自排序取 P95。 */
export function bucketSeries(samples: LoadSample[]): LoadSeriesPoint[] {
  const buckets = new Map<number, { ok: number; failed: number; latencies: number[] }>();
  for (const sample of samples) {
    const at = Math.max(1, Math.ceil((sample.startMs + sample.latencyMs) / 1000));
    const bucket = buckets.get(at) ?? { ok: 0, failed: 0, latencies: [] };
    if (sample.ok) bucket.ok += 1;
    else bucket.failed += 1;
    bucket.latencies.push(sample.latencyMs);
    buckets.set(at, bucket);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([atSecond, bucket]) => ({
      atSecond,
      rps: bucket.ok,
      p95: percentile(bucket.latencies.slice().sort((a, b) => a - b), 95),
    }));
}

const PROGRESS_INTERVAL_MS = 200;

/**
 * N 个 async worker 从共享 counter 取任务；count/duration 两种终止、abort 与熔断都保留已完成样本。
 * now/sleep 注入仅供单测，默认走真实时钟。
 */
export async function runLoadTest(
  plan: LoadTestPlan,
  task: LoadTask,
  onProgress: (progress: LoadProgress) => void,
  signal: AbortSignal,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<LoadTestResult> {
  const settings = clampPlan(plan);
  const started = now();
  const samples: LoadSample[] = [];
  const inFlight = new Set<AbortController>();
  let counter = 0;
  let completed = 0;
  let failed = 0;
  let running = 0;
  let stopReason: LoadTestStopReason = plan.mode === 'count' ? 'count' : 'duration';
  let lastReport = -1;
  let sinceBreaker = 0;

  const emit = (force = false) => {
    const elapsed = now() - started;
    if (!force && lastReport >= 0 && elapsed - lastReport < PROGRESS_INTERVAL_MS) return;
    lastReport = elapsed;
    onProgress({ samples, completed, failed, inFlight: running, elapsedMs: elapsed });
  };

  const worker = async () => {
    for (;;) {
      if (signal.aborted) {
        stopReason = 'cancel';
        return;
      }
      if (counter >= settings.maxTasks) return;
      if (now() - started >= settings.deadlineMs) return;
      const index = counter;
      counter += 1;
      running += 1;
      emit();

      const perRequest = new AbortController();
      inFlight.add(perRequest);
      const onOuterAbort = () => perRequest.abort(new LoadTestCancelled());
      signal.addEventListener('abort', onOuterAbort, { once: true });
      const timer = setTimeout(() => perRequest.abort(new Error('timeout')), settings.timeoutMs);
      const startMs = Math.max(0, now() - started);
      try {
        const outcome = await task.run(perRequest.signal);
        const latencyMs = Math.max(0, Math.round(outcome.ms));
        if (samples.length < MAX_SAMPLES) {
          const timedOut = perRequest.signal.aborted && perRequest.signal.reason instanceof Error && !(perRequest.signal.reason instanceof LoadTestCancelled);
          samples.push({
            index,
            startMs,
            latencyMs,
            ok: outcome.ok && !timedOut,
            ...(outcome.status !== undefined ? { status: outcome.status } : {}),
            ...(!outcome.ok || timedOut ? { errorClass: classifyError(outcome.status, timedOut) } : {}),
          });
        }
        completed += 1;
        if (!outcome.ok) {
          failed += 1;
          sinceBreaker += 1;
        } else {
          sinceBreaker = 0;
        }
        if (failed >= CIRCUIT_BREAKER_FAILURES && completed === failed) {
          stopReason = 'circuit';
          return;
        }
      } catch (error) {
        if (signal.aborted) {
          stopReason = 'cancel';
          return;
        }
        stopReason = 'task-error';
        return;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', onOuterAbort);
        inFlight.delete(perRequest);
        running -= 1;
      }
      // 每个 tick 至少让出一个宏任务节拍，避免零延迟任务把事件循环钉死。
      await sleep(0);
    }
  };

  await Promise.all(Array.from({ length: settings.concurrency }, () => worker()));
  // 自然到期/熔断时，掐掉仍在飞的请求，帮监听 signal 的任务尽快收口。
  for (const controller of inFlight) controller.abort(new LoadTestCancelled());
  emit(true);
  const elapsedMs = Math.max(1, now() - started);
  const errorCounts: Partial<Record<LoadErrorClass, number>> = {};
  for (const sample of samples) {
    if (sample.ok || !sample.errorClass) continue;
    errorCounts[sample.errorClass] = (errorCounts[sample.errorClass] ?? 0) + 1;
  }
  return { samples, elapsedMs, completed, failed, stopReason, errorCounts };
}
