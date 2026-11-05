import { beforeEach, describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import type { ScriptResult } from '@/lib/apiworkbench/scriptEngine';
import type { ScriptOutcome } from '@/lib/apiworkbench/sandbox';
import { TestsPanel, type ScriptRun } from './TestsPanel';

beforeEach(() => {
  useAppStore.setState({ locale: 'zh' });
});

function scriptResult(overrides: Partial<ScriptResult> = {}): ScriptResult {
  return {
    ran: true,
    tests: [
      { name: '状态是 200', status: 'pass' },
      { name: '有 id', status: 'fail', error: 'expected undefined to exist' },
    ],
    logs: ['第 1 行输出'],
    envWrites: [],
    varWrites: {},
    patch: {},
    skips: 0,
    sends: 0,
    durationMs: 3,
    ...overrides,
  };
}

function ok(result: ScriptResult, bodyTruncated = false): ScriptOutcome {
  return { kind: 'ok', result, deadlineMs: 5000, bodyTruncated };
}

function renderPanel(runs: ScriptRun[], envName: string | null = '本地', skipped?: string) {
  render(
    <I18nProvider>
      <ToastProvider>
        <TestsPanel runs={runs} envName={envName} skipped={skipped ? { zh: skipped, en: skipped } : null} />
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('TestsPanel', () => {
  test('通过与失败各自列出来，失败带原因', () => {
    renderPanel([{ phase: 'test', outcome: ok(scriptResult()) }]);
    expect(screen.getByText('通过 1')).toBeInTheDocument();
    expect(screen.getByText('失败 1')).toBeInTheDocument();
    expect(screen.getByText('状态是 200')).toBeInTheDocument();
    expect(screen.getByText('expected undefined to exist')).toBeInTheDocument();
  });

  test('脚本抛错时指向行号', () => {
    renderPanel([{ phase: 'prerequest', outcome: ok(scriptResult({ error: 'pm.nope is not a function', errorLine: 7 })) }]);
    expect(screen.getByText('脚本中止：第 7 行')).toBeInTheDocument();
    expect(screen.getByText('pm.nope is not a function')).toBeInTheDocument();
    expect(screen.getByText('预请求脚本')).toBeInTheDocument();
  });

  test('看门狗到点说「已被终止」，不假装跑完', () => {
    renderPanel([{ phase: 'test', outcome: { kind: 'killed', deadlineMs: 5000 } }]);
    expect(screen.getByText(/沙箱线程已被终止/)).toBeInTheDocument();
    expect(screen.queryAllByText('状态是 200')).toHaveLength(0);
  });

  test('合作式超时保留已登记的断言并说明', () => {
    renderPanel([{ phase: 'test', outcome: ok(scriptResult({ aborted: true })) }]);
    expect(screen.getByText('超时中断')).toBeInTheDocument();
    expect(screen.getByText(/沙箱已被终止/)).toBeInTheDocument();
  });

  test('正文截断单独说明，不混进失败原因', () => {
    renderPanel([{ phase: 'test', outcome: ok(scriptResult(), true) }]);
    expect(screen.getByText('正文截断')).toBeInTheDocument();
    expect(screen.getByText(/脚本只看到开头一段/)).toBeInTheDocument();
  });

  test('没有启用环境时，环境写入会说清没落地', () => {
    renderPanel([{ phase: 'test', outcome: ok(scriptResult({ envWrites: [{ op: 'set', key: 'token', value: 'x' }] })) }], null);
    expect(screen.getByText(/没有启用环境，这些写入没有落地/)).toBeInTheDocument();
  });

  test('请求失败时测试脚本没跑，也要占一条说明', () => {
    renderPanel([], '本地', '测试脚本未执行：请求没能发出');
    expect(screen.getByText('测试脚本未执行：请求没能发出')).toBeInTheDocument();
  });

  test('脚本输出放进折叠区，摘要带行数', () => {
    renderPanel([{ phase: 'test', outcome: ok(scriptResult()) }]);
    const summary = screen.getByText('脚本输出 1 行');
    expect(summary.closest('details')).not.toBeNull();
    expect(screen.getByText('第 1 行输出')).toBeInTheDocument();
  });

  test('跳过既不算通过也不算失败，原因是灰字不是红字', () => {
    renderPanel([{
      phase: 'test',
      outcome: ok(scriptResult({
        tests: [{ name: '分页下一页', status: 'skip', error: '还没有分页端点' }],
        skips: 1,
      })),
    }]);
    expect(screen.getByText('SKIP')).toBeInTheDocument();
    expect(screen.getByText('跳过 1')).toBeInTheDocument();
    expect(screen.queryByText(/^通过 \d/)).not.toBeInTheDocument();
    expect(screen.getByText('还没有分页端点')).toBeInTheDocument();
  });

  test('子请求列出方法、URL 与结果，超上限要说没发出去', () => {
    renderPanel([{
      phase: 'test',
      outcome: ok(scriptResult({
        sends: 1,
        sendsCapped: true,
        sendResults: [
          { ok: true, method: 'GET', url: 'https://example.com/tokens', code: 201 },
          { ok: false, method: 'POST', url: 'https://example.com/x', error: '一次运行最多允许 5 个 pm.sendRequest，这条没有发出去' },
        ],
      })),
    }]);
    expect(screen.getByText('子请求 1')).toBeInTheDocument();
    expect(screen.getByText('201')).toBeInTheDocument();
    expect(screen.getByText('GET https://example.com/tokens')).toBeInTheDocument();
    expect(screen.getByText(/后面的 pm.sendRequest 没有发出去/)).toBeInTheDocument();
  });

  test('日志到上限的说法是「只留最后 N 行」，与环形缓冲一致', () => {
    renderPanel([{ phase: 'test', outcome: ok(scriptResult({ logsCapped: true })) }]);
    expect(screen.getByText(/只留最后 200 行/)).toBeInTheDocument();
  });
});
