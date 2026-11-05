import { useMemo, useRef, useState } from 'react';
import { Gauge, Square } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { DownloadButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { proxyFetch } from '@/lib/net';
import {
  bucketSeries,
  percentile,
  runLoadTest,
  MAX_CONCURRENCY,
  MAX_ITERATIONS,
  MAX_DURATION_S,
  CIRCUIT_BREAKER_FAILURES,
  LOAD_ERROR_CLASSES,
  type LoadTask,
  type LoadTestResult,
  type LoadProgress,
} from '@/lib/apiworkbench/loadtest';
import { walkRequests } from '@/lib/apiworkbench/tree';
import { interpolate } from '@/lib/apiworkbench/vars';
import type { WbRequest } from '@/lib/apiworkbench/types';
import { useWorkbench } from './WorkbenchContext';
import { StressChart } from './StressChart';

const STOP_LABEL: Record<LoadTestResult['stopReason'], Localized> = {
  count: { zh: '按计划完成', en: 'Plan completed' },
  duration: { zh: '按时长结束', en: 'Time limit reached' },
  cancel: { zh: '手动取消', en: 'Cancelled' },
  circuit: { zh: `连续 ${CIRCUIT_BREAKER_FAILURES} 次失败，已熔断`, en: `Circuit break: ${CIRCUIT_BREAKER_FAILURES} straight failures` },
  'task-error': { zh: '任务异常中止', en: 'Aborted by task error' },
};

function buildTask(req: WbRequest, scope: Record<string, string>, timeoutMs: number): LoadTask {
  const url = interpolate(req.url, scope).text;
  const headers: Record<string, string> = {};
  for (const row of req.headers) {
    if (row.enabled && row.key.trim()) headers[interpolate(row.key, scope).text] = interpolate(row.value, scope).text;
  }
  if (req.auth.type === 'basic') {
    const raw = `${interpolate(req.auth.username ?? '', scope).text}:${interpolate(req.auth.password ?? '', scope).text}`;
    headers.Authorization = `Basic ${typeof btoa === 'function' ? btoa(raw) : Buffer.from(raw, 'binary').toString('base64')}`;
  } else if (req.auth.type === 'bearer' && req.auth.token) {
    headers.Authorization = `Bearer ${interpolate(req.auth.token, scope).text}`;
  }
  const withBody = req.body.mode !== 'none' && req.body.text !== '' && req.method !== 'GET' && req.method !== 'HEAD';
  const body = withBody ? interpolate(req.body.text, scope).text : undefined;
  if (withBody && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = req.body.mode === 'json' ? 'application/json' : req.body.mode === 'form' ? 'application/x-www-form-urlencoded' : 'text/plain';
  }
  return {
    async run(signal) {
      const start = performance.now();
      const cancelled = new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason ?? new Error('cancelled')), { once: true });
      });
      // 取消时立刻回抛；后台那个 fetch 自然结束（浏览器仍受连接数约束）。
      const response = await Promise.race([
        proxyFetch(url, { mode: 'direct', method: req.method, headers, body, timeoutMs }),
        cancelled,
      ]);
      return { ok: response.ok, status: response.status, ms: Math.round(performance.now() - start) };
    },
  };
}

export function StressPanel({ active: _active }: { active: boolean }) {
  const { t } = useI18n();
  const { doc, scopeFor } = useWorkbench();
  const targets = useMemo(
    () => doc.collections.flatMap((collection) => walkRequests(collection.root).map((request) => ({ collection, request }))),
    [doc.collections],
  );
  const [targetId, setTargetId] = useState('');
  const [concurrency, setConcurrency] = useState('5');
  const [mode, setMode] = useState<'count' | 'duration'>('count');
  const [amount, setAmount] = useState('50');
  const [timeoutMs, setTimeoutMs] = useState('10000');
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<LoadProgress | null>(null);
  const [result, setResult] = useState<LoadTestResult | null>(null);
  const [error, setError] = useState<Localized | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const target = targets.find((item) => item.request.id === (targetId || targets[0]?.request.id)) ?? targets[0] ?? null;

  const start = async () => {
    if (!target) return;
    const scope = scopeFor(target.collection);
    const missing = interpolate(target.request.url, scope).missing;
    if (missing.length > 0) {
      setError(t({ zh: `URL 存在未定义变量：${missing.join('、')}`, en: `URL has undefined variables: ${missing.join(', ')}` }));
      return;
    }
    setError(null);
    setResult(null);
    setLive({ samples: [], completed: 0, failed: 0, inFlight: 0, elapsedMs: 0 });
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const plan = {
        concurrency: Number(concurrency) || 1,
        mode,
        iterations: Number(amount) || 1,
        seconds: Number(amount) || 1,
        timeoutMs: Number(timeoutMs) || 10_000,
      };
      const finished = await runLoadTest(plan, buildTask(target.request, scope, plan.timeoutMs), setLive, controller.signal);
      setResult(finished);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const stats = useMemo(() => {
    if (!result) return null;
    const okLatencies = result.samples.filter((s) => s.ok).map((s) => s.latencyMs).sort((a, b) => a - b);
    const all = result.samples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const seconds = Math.max(result.elapsedMs, 1000) / 1000;
    return {
      rps: Math.round((result.completed - result.failed) / seconds * 10) / 10,
      avg: all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0,
      min: all[0] ?? 0,
      max: all[all.length - 1] ?? 0,
      p50: percentile(okLatencies, 50),
      p90: percentile(okLatencies, 90),
      p95: percentile(okLatencies, 95),
      p99: percentile(okLatencies, 99),
      errorRate: result.completed ? Math.round((result.failed / result.completed) * 1000) / 10 : 0,
      series: bucketSeries(result.samples),
    };
  }, [result]);

  const csv = useMemo(() => {
    if (!result) return '';
    const lines = ['index,start_ms,latency_ms,ok,status,error_class'];
    for (const sample of result.samples) {
      lines.push(`${sample.index},${sample.startMs},${sample.latencyMs},${sample.ok ? 1 : 0},${sample.status ?? ''},${sample.errorClass ?? ''}`);
    }
    return lines.join('\n');
  }, [result]);

  return (
    <div className="space-y-4">
      <ToolAlert
        tone="warning"
        title={t({ zh: '浏览器压测只能看趋势，不能下容量结论', en: 'Browser load tests show trends, not capacity verdicts' })}
        hint={t({
          zh: '每域名 ~6 个并发连接、后台标签页会被限速、CORS 与 fetch 开销都会压低数字；仅直连模式，勿针对公共代理或第三方站点压测。',
          en: '~6 connections per domain, background-tab throttling, CORS, and fetch overhead all deflate the numbers. Direct mode only; do not stress public proxies or third-party sites.',
        })}
      />

      <Panel title={t({ zh: '压测计划', en: 'Test plan' })} bodyClassName="space-y-3">
        {targets.length === 0 ? (
          <p className="text-xs text-ink-3">
            {t({ zh: '还没有可压测的请求：先在请求页签保存一个请求（或从 OpenAPI 导入集合）。', en: 'No request to stress yet: save one in the Request tab (or import a collection from OpenAPI) first.' })}
          </p>
        ) : (
          <div className="grid min-w-0 gap-2.5 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <fieldset className="min-w-0 rounded-card border border-line bg-surface-2/40 px-2.5 pb-2.5 pt-1">
              <legend className="px-1 text-[11px] font-medium text-ink-3">
                {t({ zh: '目标', en: 'Target' })}
              </legend>
              <Select
                size="sm"
                wrapperClassName="w-full"
                value={target?.request.id ?? ''}
                onChange={(e) => setTargetId(e.target.value)}
                aria-label={t({ zh: '压测目标', en: 'Target request' })}
              >
                {targets.map((item) => (
                  <option key={item.request.id} value={item.request.id}>
                    {`${item.collection.name} · ${item.request.name || item.request.url}`}
                  </option>
                ))}
              </Select>
            </fieldset>

            <fieldset className="rounded-card border border-line bg-surface-2/40 px-2.5 pb-2.5 pt-1">
              <legend className="px-1 text-[11px] font-medium text-ink-3">
                {t({ zh: '并发与计划', en: 'Concurrency and plan' })}
              </legend>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-3">
                  {t({ zh: '并发', en: 'Concurrency' })}
                  <Input
                    size="sm"
                    type="number"
                    min={1}
                    max={MAX_CONCURRENCY}
                    value={concurrency}
                    onChange={(e) => setConcurrency(e.target.value)}
                    className="w-20"
                  />
                </label>
                <Segmented
                  size="sm"
                  value={mode}
                  onChange={setMode}
                  ariaLabel={t({ zh: '终止方式', en: 'Stop condition' })}
                  options={[
                    { value: 'count', label: t({ zh: '按次数', en: 'By count' }) },
                    { value: 'duration', label: t({ zh: '按时长', en: 'By time' }) },
                  ]}
                />
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-3">
                  {mode === 'count' ? t({ zh: '次数', en: 'Requests' }) : t({ zh: '秒数', en: 'Seconds' })}
                  <Input
                    size="sm"
                    type="number"
                    min={1}
                    max={mode === 'count' ? MAX_ITERATIONS : MAX_DURATION_S}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-20"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="rounded-card border border-line bg-surface-2/40 px-2.5 pb-2.5 pt-1">
              <legend className="px-1 text-[11px] font-medium text-ink-3">
                {t({ zh: '超时与终止', en: 'Timeout and control' })}
              </legend>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-3">
                  {t({ zh: '超时 ms', en: 'Timeout ms' })}
                  <Input size="sm" type="number" min={100} value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} className="w-20" />
                </label>
                {running ? (
                  <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>
                    <Square className="h-3.5 w-3.5" aria-hidden="true" />
                    {t({ zh: '停止', en: 'Stop' })}
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => void start()} disabled={!target}>
                    <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                    {t({ zh: '开始压测', en: 'Start' })}
                  </Button>
                )}
              </div>
            </fieldset>
          </div>
        )}
        {running && live ? (
          <p className="text-xs text-ink-2">
            {t({
              zh: `进行中：完成 ${live.completed} · 失败 ${live.failed} · 在途 ${live.inFlight} · ${Math.round(live.elapsedMs / 100) / 10}s`,
              en: `Running: ${live.completed} done · ${live.failed} failed · ${live.inFlight} in flight · ${(live.elapsedMs / 1000).toFixed(1)}s`,
            })}
          </p>
        ) : null}
        {error ? <ToolAlert tone="error" title={error} /> : null}
      </Panel>

      {result && stats ? (
        <>
          <Panel
            title={
              <span className="flex items-center gap-2">
                {t({ zh: '统计', en: 'Statistics' })}
                <Badge tone={result.stopReason === 'count' || result.stopReason === 'duration' ? 'success' : 'warning'}>{t(STOP_LABEL[result.stopReason])}</Badge>
              </span>
            }
            subtitle={t({
              zh: `总耗时 ${(result.elapsedMs / 1000).toFixed(1)}s · P50/P90/P95/P99 仅统计成功请求`,
              en: `Elapsed ${(result.elapsedMs / 1000).toFixed(1)}s · percentiles cover successful requests only`,
            })}
            actions={
              <DownloadButton
                filename="loadtest.csv"
                content={csv}
                mime="text/csv;charset=utf-8"
                label={t({ zh: '导出样本 CSV', en: 'Export samples CSV' })}
              />
            }
          >
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: t({ zh: '完成 / 失败', en: 'Done / Failed' }), value: `${result.completed} / ${result.failed}` },
                { label: t({ zh: '错误率', en: 'Error rate' }), value: `${stats.errorRate}%` },
                { label: t({ zh: '成功 RPS', en: 'Success RPS' }), value: String(stats.rps) },
                { label: t({ zh: '平均 ms', en: 'Avg ms' }), value: String(stats.avg) },
                { label: 'P50 ms', value: String(stats.p50) },
                { label: 'P90 ms', value: String(stats.p90) },
                { label: 'P95 ms', value: String(stats.p95) },
                { label: 'P99 ms', value: String(stats.p99) },
                { label: t({ zh: 'min / max ms', en: 'min / max ms' }), value: `${stats.min} / ${stats.max}` },
              ].map((cell) => (
                <div key={t(cell.label)} className="rounded-card border border-line bg-surface-2/50 px-2.5 py-2">
                  <p className="text-[11px] text-ink-3">{t(cell.label)}</p>
                  <p className="pt-0.5 font-mono text-sm text-ink">{cell.value}</p>
                </div>
              ))}
            </div>
            {Object.keys(result.errorCounts).length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {LOAD_ERROR_CLASSES.filter((key) => result.errorCounts[key]).map((key) => (
                  <Badge key={key} tone="danger">
                    {key} × {result.errorCounts[key]}
                  </Badge>
                ))}
              </div>
            ) : null}
          </Panel>

          <Panel title={t({ zh: '时序（按秒）', en: 'Timeline (per second)' })}>
            <StressChart series={stats.series} />
          </Panel>
        </>
      ) : null}
    </div>
  );
}
