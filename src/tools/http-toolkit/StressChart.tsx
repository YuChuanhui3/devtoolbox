import { useMemo } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { LoadSeriesPoint } from '@/lib/apiworkbench/loadtest';

const W = 560;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 20, left: 12 };

function niceMax(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export function StressChart({ series }: { series: LoadSeriesPoint[] }) {
  const { t } = useI18n();
  const { rpsPath, p95Path, rpsMax, p95Max, ticks } = useMemo(() => {
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const rpsMax = niceMax(Math.max(...series.map((p) => p.rps), 1));
    const p95Max = niceMax(Math.max(...series.map((p) => p.p95), 1));
    const x = (index: number) => PAD.left + (series.length <= 1 ? innerW / 2 : (index / (series.length - 1)) * innerW);
    const y = (value: number, max: number) => PAD.top + innerH - (value / max) * innerH;
    const toPath = (pick: (p: LoadSeriesPoint) => number, max: number) =>
      series.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(pick(point), max).toFixed(1)}`).join(' ');
    const step = Math.max(1, Math.ceil(series.length / 8));
    const ticks = series
      .map((point, index) => ({ index, atSecond: point.atSecond }))
      .filter((_, index) => index % step === 0 || index === series.length - 1);
    return { rpsPath: toPath((p) => p.rps, rpsMax), p95Path: toPath((p) => p.p95, p95Max), rpsMax, p95Max, ticks };
  }, [series]);

  if (series.length === 0) {
    return <p className="text-center text-xs text-ink-3">{t({ zh: '运行后在这里看到 RPS 与 P95 时序曲线。', en: 'The RPS and P95 timelines appear here after a run.' })}</p>;
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t({ zh: '压测时序图', en: 'Load test timeline' })} className="h-auto w-full">
        <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="currentColor" className="text-line" strokeWidth="1" />
        <path d={rpsPath} fill="none" stroke="var(--accent)" strokeWidth="2" />
        <path d={p95Path} fill="none" stroke="var(--warn)" strokeWidth="2" strokeDasharray="4 3" />
        {ticks.map((tick) => (
          <text key={tick.index} x={PAD.left + (series.length <= 1 ? (W - PAD.left - PAD.right) / 2 : (tick.index / (series.length - 1)) * (W - PAD.left - PAD.right))} y={H - 6} textAnchor="middle" className="fill-ink-3" fontSize="10">
            {tick.atSecond}s
          </text>
        ))}
      </svg>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 rounded-full bg-accent" aria-hidden="true" />
          {t({ zh: `RPS（峰值 ${rpsMax}）`, en: `RPS (peak ${rpsMax})` })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 rounded-full bg-warn" aria-hidden="true" />
          {t({ zh: `P95 ms（刻度 ${p95Max}）`, en: `P95 ms (scale ${p95Max})` })}
        </span>
      </p>
    </div>
  );
}
