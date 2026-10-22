import { useEffect, useState } from 'react';
import { Pause, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Panel } from '@/components/ui/Panel';
import { Checkbox } from '@/components/ui/Checkbox';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';

const INTERVALS: { value: string; label: L10n }[] = [
  { value: '5', label: { zh: '5 秒', en: '5 sec' } },
  { value: '10', label: { zh: '10 秒', en: '10 sec' } },
  { value: '30', label: { zh: '30 秒', en: '30 sec' } },
  { value: '60', label: { zh: '1 分钟', en: '1 min' } },
  { value: '300', label: { zh: '5 分钟', en: '5 min' } },
];

export default function PageRefreshTool() {
  const { t } = useI18n();
  const [url, setUrl] = useState('https://example.com');
  const [seconds, setSeconds] = useState('10');
  const [running, setRunning] = useState(false);
  const [includeCacheBust, setIncludeCacheBust] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [tick, setTick] = useState(0);

  const resolved = url.trim();
  const safe = resolved && (resolved.startsWith('http://') || resolved.startsWith('https://')) ? resolved : '';

  useEffect(() => {
    if (!running || !safe) return;
    const intervalMs = Math.max(1, Number(seconds) || 10) * 1000;
    const timer = window.setInterval(() => {
      setTick((t) => t + 1);
      setFrameKey((k) => k + 1);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [running, safe, seconds]);

  const src = safe && includeCacheBust ? `${safe}${safe.includes('?') ? '&' : '?'}_t=${frameKey}` : safe;

  return (
    <div className="space-y-4">
      <ToolAlert
        tone="info"
        title={t({ zh: '部分站点禁止被嵌入 iframe', en: 'Some sites disallow iframe embedding' })}
        hint={t({ zh: '目标站点返回 X-Frame-Options: DENY/SAMEORIGIN 或 CSP frame-ancestors 限制时，预览区将保持空白，这属于对方站点的安全策略。', en: 'If the target sends X-Frame-Options: DENY/SAMEORIGIN or a CSP frame-ancestors restriction, the preview stays blank. That is the target site\'s security policy, not an error here.' })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://www.example.com"
          mono
          className="h-9 min-w-64 flex-1 text-xs"
          aria-label={t({ zh: '目标网址', en: 'Target URL' })}
        />
        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          {t({ zh: '每', en: 'Every' })}
          <Select
            value={seconds}
            onChange={(event) => setSeconds(event.target.value)}
            aria-label={t({ zh: '刷新间隔', en: 'Refresh interval' })}
            className="h-9 text-xs"
            wrapperClassName="w-24"
          >
            {INTERVALS.map((item) => (
              <option key={item.value} value={item.value}>
                {t(item.label)}
              </option>
            ))}
          </Select>
        </label>
        <Button variant={running ? 'secondary' : 'primary'} onClick={() => setRunning((v) => !v)} disabled={!safe}>
          {running ? (
            <>
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              {t({ zh: '暂停', en: 'Pause' })}
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {t({ zh: '开始刷新', en: 'Start refreshing' })}
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setFrameKey((k) => k + 1)}
          disabled={!safe}
          aria-label={t({ zh: '立即刷新', en: 'Refresh now' })}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '立即刷新', en: 'Refresh now' })}
        </Button>
      </div>

      <Checkbox
        checked={includeCacheBust}
        onChange={setIncludeCacheBust}
        label={t({ zh: '绕过缓存刷新（在 URL 追加时间戳参数）', en: 'Bypass cache (append a timestamp parameter to the URL)' })}
        className="text-xs"
      />

      {safe ? (
        <Panel
          title={t({ zh: '页面预览', en: 'Page preview' })}
          subtitle={running ? t({ zh: `运行中 · 已刷新 ${tick} 次`, en: `Running · refreshed ${tick} time(s)` }) : t({ zh: '已停止', en: 'Stopped' })}
          bodyClassName="p-0"
        >
          <iframe
            key={frameKey}
            src={src}
            title={t({ zh: '自动刷新预览', en: 'Auto-refresh preview' })}
            className="block h-[560px] w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </Panel>
      ) : (
        <Panel title={t({ zh: '页面预览', en: 'Page preview' })} bodyClassName="p-0">
          <div className="flex h-[320px] items-center justify-center text-xs text-ink-3">
            {t({ zh: '输入 http/https 地址后开始刷新', en: 'Enter an http/https URL to start refreshing' })}
          </div>
        </Panel>
      )}

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '定时器与预览均运行在浏览器本地；切换到其他标签页时浏览器可能会降低刷新频率。', en: 'The timer and preview run locally in the browser. The browser may throttle refreshes when this tab is in the background.' })}
      </p>
    </div>
  );
}
