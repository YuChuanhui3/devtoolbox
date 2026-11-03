/**
 * 传输测速：3 秒滑窗瞬时速度 + 全程平均 + 剩余时间。
 * 参照 FastSend——把「已收到但还没落盘」的在途字节计入，速度显示比朴素实现平稳准确。
 */
interface Sample {
  t: number;
  bytes: number;
  inflight: number;
}

const WINDOW_MS = 3000;
const MIN_SPAN_MS = 500;
const MAX_SAMPLES = 256;

export class RateTracker {
  private samples: Sample[] = [];

  reset(): void {
    this.samples = [];
  }

  /** cumulativeBytes 为已落盘/已发出的累计字节，inflightBytes 为在途未处理字节。 */
  sample(cumulativeBytes: number, inflightBytes: number, nowMs: number): void {
    this.samples.push({ t: nowMs, bytes: cumulativeBytes, inflight: inflightBytes });
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    }
  }

  instant(): number {
    const end = this.samples[this.samples.length - 1];
    if (!end) return 0;
    const within = this.samples.find((s) => s.t >= end.t - WINDOW_MS) ?? end;
    const start = end.t - within.t < MIN_SPAN_MS
      ? (this.samples.find((s) => end.t - s.t >= MIN_SPAN_MS) ?? within)
      : within;
    const span = end.t - start.t;
    if (span < MIN_SPAN_MS) return 0;
    return Math.max(0, (end.bytes + end.inflight - start.bytes) / span * 1000);
  }

  average(nowMs: number): number {
    const end = this.samples[this.samples.length - 1];
    const start = this.samples[0];
    if (!end || !start) return 0;
    const span = (nowMs > end.t ? nowMs : end.t) - start.t;
    if (span <= 0) return 0;
    return Math.max(0, (end.bytes + end.inflight) / span * 1000);
  }

  /** 保守估计：取瞬时与平均里较慢的一个；没有可用速率时返回 Infinity。 */
  eta(bytesRemaining: number, nowMs: number): number {
    if (bytesRemaining <= 0) return 0;
    const rates = [this.instant(), this.average(nowMs)].filter((r) => r > 0);
    if (rates.length === 0) return Number.POSITIVE_INFINITY;
    return bytesRemaining / Math.min(...rates) * 1000;
  }
}
