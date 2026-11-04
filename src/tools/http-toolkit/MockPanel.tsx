import { FlaskConical } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/i18n/I18nProvider';

export function MockPanel({ active: _active }: { active: boolean }) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={<FlaskConical className="h-6 w-6" aria-hidden="true" />}
      title={t({ zh: 'Mock 服务', en: 'Mock server' })}
      description={t({ zh: '即将上线：定义 mock 路由后，请求命中规则时直接返回本地生成的响应；还可导出快照部署为自己的 Cloudflare Worker 假后端。', en: 'Coming soon: define mock routes and matched requests return locally generated responses; export a snapshot to deploy your own Cloudflare Worker fake backend.' })}
    />
  );
}
