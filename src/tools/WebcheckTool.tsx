import { useState } from 'react';
import { Radar } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { allOriginsGet, dnsResolve, fetchJson, proxyFetch } from '@/lib/net';
import { toToolError } from '@/lib/errors';

type CheckState = 'idle' | 'running' | 'ok' | 'fail';

interface CheckResult {
  state: CheckState;
  detail: Localized;
  ms?: number;
}

interface CheckItem {
  key: string;
  title: L10n;
  note: L10n;
  run: () => Promise<{ detail: Localized; ms: number }>;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - start) };
}

const CHECKS: CheckItem[] = [
  {
    key: 'ipv4',
    title: { zh: 'IPv4 出口地址', en: 'IPv4 egress address' },
    note: { zh: 'api.ipify.org', en: 'api.ipify.org' },
    run: async () => {
      const { value, ms } = await timed(() => fetchJson<{ ip: string }>('https://api.ipify.org?format=json', undefined, 8000));
      return { detail: value.ip, ms };
    },
  },
  {
    key: 'ipv6',
    title: { zh: 'IPv6 出口地址', en: 'IPv6 egress address' },
    note: { zh: 'api6.ipify.org，网络无 IPv6 时失败属正常', en: 'api6.ipify.org; failing without IPv6 connectivity is normal' },
    run: async () => {
      const { value, ms } = await timed(() => fetchJson<{ ip: string }>('https://api6.ipify.org?format=json', undefined, 8000));
      return { detail: value.ip, ms };
    },
  },
  {
    key: 'doh',
    title: { zh: 'Cloudflare DoH 解析', en: 'Cloudflare DoH resolution' },
    note: { zh: 'cloudflare-dns.com 解析 example.com A 记录', en: 'Resolves the example.com A record via cloudflare-dns.com' },
    run: async () => {
      const { value, ms } = await timed(() => dnsResolve('example.com', 'A'));
      const first = value.Answer?.[0]?.data ?? { zh: '无记录', en: 'No record' };
      return { detail: first, ms };
    },
  },
  {
    key: 'corsproxy',
    title: { zh: 'corsproxy.io 代理', en: 'corsproxy.io proxy' },
    note: { zh: '抓取 example.com 验证可用性', en: 'Fetches example.com to verify availability' },
    run: async () => {
      const { value, ms } = await timed(() => proxyFetch('https://example.com', { mode: 'corsproxy', timeoutMs: 10000 }));
      return { detail: `HTTP ${value.status}`, ms };
    },
  },
  {
    key: 'allorigins',
    title: { zh: 'allorigins.win 代理', en: 'allorigins.win proxy' },
    note: { zh: '抓取 example.com 验证可用性', en: 'Fetches example.com to verify availability' },
    run: async () => {
      const { value, ms } = await timed(() => allOriginsGet('https://example.com', 10000));
      return { detail: `HTTP ${value.status.http_code}`, ms };
    },
  },
];

function StatusBadge({ state }: { state: CheckState }) {
  const { t } = useI18n();
  if (state === 'running') return <Badge tone="accent">{t({ zh: '检测中', en: 'Checking' })}</Badge>;
  if (state === 'ok') return <Badge tone="success">{t({ zh: '通过', en: 'Pass' })}</Badge>;
  if (state === 'fail') return <Badge tone="danger">{t({ zh: '失败', en: 'Fail' })}</Badge>;
  return <Badge tone="neutral">{t({ zh: '待检测', en: 'Pending' })}</Badge>;
}

interface RowMeta {
  key: string;
  title: L10n;
  note: L10n;
}

const ROWS: RowMeta[] = [
  ...CHECKS.map(({ key, title, note }) => ({ key, title, note })),
  { key: 'target', title: { zh: '目标站点可达性', en: 'Target site reachability' }, note: { zh: '通过 corsproxy.io 访问上方填写的地址', en: 'Reaches the address entered above via corsproxy.io' } },
];

export default function WebcheckTool() {
  const { t } = useI18n();
  const [target, setTarget] = useState('https://www.baidu.com');
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [running, setRunning] = useState(false);

  const set = (key: string, value: CheckResult) =>
    setResults((prev) => ({ ...prev, [key]: value }));

  const runAll = async () => {
    setRunning(true);
    const items: CheckItem[] = [
      ...CHECKS,
      {
        key: 'target',
        title: { zh: '目标站点可达性', en: 'Target site reachability' },
        note: { zh: `通过 corsproxy.io 访问 ${target}`, en: `Reaches ${target} via corsproxy.io` },
        run: async () => {
          const url = target.trim() || 'https://example.com';
          const resolved = url.startsWith('http') ? url : `https://${url}`;
          const { value, ms } = await timed(() => proxyFetch(resolved, { mode: 'corsproxy', timeoutMs: 15000 }));
          return { detail: `HTTP ${value.status} · ${value.bytes} B`, ms };
        },
      },
    ];
    for (const item of items) set(item.key, { state: 'running', detail: '' });

    await Promise.allSettled(
      items.map(async (item) => {
        try {
          const done = await item.run();
          set(item.key, { state: 'ok', detail: done.detail, ms: done.ms });
        } catch (caught) {
          set(item.key, { state: 'fail', detail: toToolError(caught).localized });
        }
      }),
    );
    setRunning(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="https://www.example.com"
          mono
          className="h-9 min-w-64 flex-1 text-xs"
          aria-label={t({ zh: '检测目标站点', en: 'Target site to check' })}
        />
        <Button variant="primary" onClick={() => void runAll()} disabled={running}>
          <Radar className="h-3.5 w-3.5" aria-hidden="true" />
          {running ? t({ zh: '检测中…', en: 'Checking…' }) : t({ zh: '开始全面检测', en: 'Run all checks' })}
        </Button>
      </div>

      <Panel title={t({ zh: '网络体检', en: 'Network health check' })} subtitle={t({ zh: '并发执行全部检测项，逐项统计耗时', en: 'All checks run concurrently with per-item timings' })} bodyClassName="p-0">
        {ROWS.map((item) => {
          const result = results[item.key];
          const state = result?.state ?? 'idle';
          return (
            <div key={item.key} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <div className="w-40 shrink-0">
                <div className="text-sm text-ink">{t(item.title)}</div>
                <div className="mt-0.5 text-[11px] text-ink-3">{t(item.note)}</div>
              </div>
              <div className="min-w-0 flex-1 text-right">
                <span
                  className={
                    state === 'fail'
                      ? 'break-all text-xs text-danger'
                      : 'break-all font-mono text-[12px] text-ink'
                  }
                >
                  {state === 'idle' ? '—' : state === 'running' ? '…' : result?.detail ? t(result.detail) : '—'}
                </span>
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-[11px] text-ink-3">
                {result?.ms !== undefined && state === 'ok' ? `${result.ms} ms` : ''}
              </span>
              <span className="w-16 shrink-0 text-right">
                <StatusBadge state={state} />
              </span>
            </div>
          );
        })}
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '检测结果反映浏览器所在网络的真实出口；使用 VPN、代理或 IPv6 双栈环境时结果可能不同。公共代理限流会导致对应项偶发失败。', en: 'Results reflect the real egress of this browser\'s network. VPNs, proxies, or dual-stack IPv6 may change them. Public proxy rate limits can cause occasional failures.' })}
      </p>
    </div>
  );
}
