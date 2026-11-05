import { useMemo } from 'react';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from '@/components/tool/ToolActions';
import { Panel } from '@/components/ui/Panel';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { MAX_SCRIPT_LOGS, type ScriptPhase, type ScriptResult, type ScriptTest } from '@/lib/apiworkbench/scriptEngine';
import type { ScriptOutcome } from '@/lib/apiworkbench/sandbox';
import { BODY_TRUNCATED_NOTICE, envWriteNotice, outcomeNotice } from '@/lib/apiworkbench/scripts';

/** 一次沙箱运行的结果，连同它属于哪个阶段。 */
export interface ScriptRun {
  phase: ScriptPhase;
  outcome: ScriptOutcome;
}

const PHASE_LABEL: Record<ScriptPhase, Localized> = {
  prerequest: { zh: '预请求脚本', en: 'Pre-request script' },
  test: { zh: '测试脚本', en: 'Test script' },
};

function testLine(item: ScriptTest): string {
  if (item.status === 'pass') return `  PASS ${item.name}`;
  if (item.status === 'skip') return `  SKIP ${item.name}${item.error ? ` — ${item.error}` : ''}`;
  return `  FAIL ${item.name}${item.error ? ` — ${item.error}` : ''}`;
}

function sendLine(result: NonNullable<ScriptResult['sendResults']>[number]): string {
  const target = `${result.method} ${result.url}`;
  return result.ok ? `  SENT ${target} → ${result.code}` : `  SENT ${target} → ${result.error ?? 'failed'}`;
}

function runText(run: ScriptRun, t: (value: Localized) => string): string[] {
  const head = t(PHASE_LABEL[run.phase]);
  if (run.outcome.kind !== 'ok' || !run.outcome.result) return [head, `  ${t(outcomeNotice(run.outcome))}`];
  const result: ScriptResult = run.outcome.result;
  const lines = [head];
  if (result.error) lines.push(`  ${result.error}${result.errorLine ? ` (${t({ zh: `第 ${result.errorLine} 行`, en: `line ${result.errorLine}` })})` : ''}`);
  lines.push(...result.tests.map(testLine));
  if (result.sendResults?.length) lines.push(...result.sendResults.map(sendLine));
  if (result.logs.length) lines.push(...result.logs.map((line) => `  console: ${line}`));
  return lines;
}

export function TestsPanel({ runs, envName, skipped }: {
  runs: ScriptRun[];
  /** 脚本写环境时的落点名称；没有启用环境就传 null，面板会说清这些写入没落地。 */
  envName: string | null;
  /** 请求本身失败等情况：测试脚本没跑，也要在结果区说清楚。 */
  skipped?: Localized | null;
}) {
  const { t } = useI18n();
  const report = useMemo(() => runs.flatMap((run) => runText(run, t)).join('\n'), [runs, t]);
  const results = runs
    .map((run) => (run.outcome.kind === 'ok' && run.outcome.result ? { run, result: run.outcome.result } : null))
    .filter((item): item is { run: ScriptRun; result: ScriptResult } => item !== null);
  const allTests = results.flatMap((item) => item.result.tests);
  const failed = allTests.filter((item) => item.status === 'fail').length;
  const passed = allTests.filter((item) => item.status === 'pass').length;
  const skippedCount = allTests.filter((item) => item.status === 'skip').length;

  return (
    <Panel
      title={t({ zh: '脚本结果', en: 'Script results' })}
      actions={
        <span className="flex items-center gap-1.5">
          {passed ? <Badge tone="success">{t({ zh: `通过 ${passed}`, en: `${passed} passed` })}</Badge> : null}
          {failed ? <Badge tone="danger">{t({ zh: `失败 ${failed}`, en: `${failed} failed` })}</Badge> : null}
          {skippedCount ? <Badge tone="warning">{t({ zh: `跳过 ${skippedCount}`, en: `${skippedCount} skipped` })}</Badge> : null}
          <CopyButton text={report} label={{ zh: '复制结果', en: 'Copy results' }} />
        </span>
      }
      bodyClassName="space-y-4"
    >
      {skipped ? <ToolAlert tone="warning" title={skipped} /> : null}
      {runs.map((run) => {
        const result = run.outcome.kind === 'ok' ? run.outcome.result : null;
        const truncated = run.outcome.kind === 'ok' && run.outcome.bodyTruncated;
        const notice = result ? envWriteNotice(result.envWrites.length, envName) : null;
        return (
          <div key={run.phase} className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-ink">{t(PHASE_LABEL[run.phase])}</span>
              {result ? <Badge tone="neutral">{t({ zh: `${result.tests.length} 条断言`, en: `${result.tests.length} tests` })}</Badge> : null}
              {result && result.sends ? <Badge tone="neutral">{t({ zh: `子请求 ${result.sends}`, en: `${result.sends} sub-requests` })}</Badge> : null}
              {result ? <Badge tone="neutral">{result.durationMs} ms</Badge> : null}
              {result?.aborted ? <Badge tone="warning">{t({ zh: '超时中断', en: 'Deadline hit' })}</Badge> : null}
              {truncated ? <Badge tone="warning">{t({ zh: '正文截断', en: 'Body truncated' })}</Badge> : null}
            </div>

            {!result ? <ToolAlert tone="error" title={outcomeNotice(run.outcome)} /> : null}

            {result?.error ? (
              <ToolAlert
                tone="error"
                title={t({
                  zh: `脚本中止${result.errorLine ? `：第 ${result.errorLine} 行` : ''}`,
                  en: `The script aborted${result.errorLine ? ` at line ${result.errorLine}` : ''}`,
                })}
                hint={result.error}
              />
            ) : null}

            {result?.aborted ? (
              <p className="text-[11px] leading-4 text-ink-3">
                {t({
                  zh: '脚本在时间上限内没跑完，沙箱已被终止；下面只列它来得及登记的断言。',
                  en: 'The script ran past its time limit and its sandbox was terminated; only the assertions it reached are listed below.',
                })}
              </p>
            ) : null}

            {truncated ? <p className="text-[11px] leading-4 text-ink-3">{t(BODY_TRUNCATED_NOTICE)}</p> : null}

            {result?.testsCapped ? (
              <p className="text-[11px] leading-4 text-ink-3">
                {t({ zh: '断言数量达到上限，后面的 pm.test 没有再登记。', en: 'The test cap was reached, so later pm.test calls were not recorded.' })}
              </p>
            ) : null}

            {result?.sendsCapped ? (
              <p className="text-[11px] leading-4 text-ink-3">
                {t({
                  zh: '一次运行的子请求已达上限，后面的 pm.sendRequest 没有发出去。',
                  en: 'The per-run sub-request cap was reached, so later pm.sendRequest calls were not sent.',
                })}
              </p>
            ) : null}

            {result && result.tests.length ? (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {result.tests.map((item, index) => (
                  <li key={`${item.name}-${index}`} className="flex items-start gap-2 px-3 py-2">
                    <Badge tone={item.status === 'pass' ? 'success' : item.status === 'skip' ? 'warning' : 'danger'} className="mt-0.5 shrink-0">
                      {item.status === 'pass' ? 'PASS' : item.status === 'skip' ? 'SKIP' : 'FAIL'}
                    </Badge>
                    <div className="min-w-0">
                      <p className="break-words text-xs text-ink">{item.name}</p>
                      {item.error ? (
                        <p className={`mt-0.5 break-words font-mono text-[11px] ${item.status === 'fail' ? 'text-danger' : 'text-ink-3'}`}>{item.error}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {result?.sendResults?.length ? (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {result.sendResults.map((item, index) => (
                  <li key={`${item.method}-${item.url}-${index}`} className="flex items-start gap-2 px-3 py-2">
                    <Badge tone={item.ok ? 'success' : 'danger'} className="mt-0.5 shrink-0">
                      {item.ok ? item.code : 'ERR'}
                    </Badge>
                    <div className="min-w-0">
                      <p className="break-words font-mono text-[11px] text-ink-2">{item.method} {item.url}</p>
                      {!item.ok && item.error ? <p className="mt-0.5 break-words font-mono text-[11px] text-danger">{item.error}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {result && result.logs.length ? (
              <details className="overflow-hidden rounded-xl border border-line">
                <summary className="cursor-pointer bg-surface-2/50 px-3 py-1.5 text-xs font-medium text-ink-2">
                  {t({ zh: `脚本输出 ${result.logs.length} 行`, en: `${result.logs.length} console lines` })}
                  {result.logsCapped
                    ? t({ zh: `（已到上限，只留最后 ${MAX_SCRIPT_LOGS} 行）`, en: ` (capped, only the last ${MAX_SCRIPT_LOGS} lines are kept)` })
                    : ''}
                </summary>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words bg-surface p-3 font-mono text-[11px] leading-5 text-ink-2">
                  {result.logs.join('\n')}
                </pre>
              </details>
            ) : null}

            {notice ? <p className="text-[11px] leading-4 text-ink-3">{t(notice)}</p> : null}
          </div>
        );
      })}
    </Panel>
  );
}
