import { Gauge } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/i18n/I18nProvider';

export function StressPanel({ active: _active }: { active: boolean }) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={<Gauge className="h-6 w-6" aria-hidden="true" />}
      title={t({ zh: '接口压测', en: 'Load testing' })}
      description={t({ zh: '即将上线：对集合中的请求做并发压测，输出 RPS、P50/P90/P95/P99 延迟分位、错误率与时序曲线。', en: 'Coming soon: run concurrent load tests on collection requests with RPS, P50/P90/P95/P99 latency percentiles, error rate, and time-series charts.' })}
    />
  );
}
