import { FileText } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/i18n/I18nProvider';

export function OpenApiPanel({ active: _active }: { active: boolean }) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={<FileText className="h-6 w-6" aria-hidden="true" />}
      title={t({ zh: 'OpenAPI / Swagger 导入', en: 'OpenAPI / Swagger import' })}
      description={t({ zh: '即将上线：粘贴或抓取 OpenAPI 3.0 / Swagger 2.0 文档，浏览端点并一键生成集合请求与 Mock 路由。', en: 'Coming soon: paste or fetch an OpenAPI 3.0 / Swagger 2.0 document, browse endpoints, and generate collection requests and mock routes in one click.' })}
    />
  );
}
