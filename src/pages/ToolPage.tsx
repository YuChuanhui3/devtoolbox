import { Suspense, useEffect, type ComponentType, type LazyExoticComponent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Blocks } from 'lucide-react';
import { TOOL_COMPONENTS } from '@/tools/registry';
import { getTool, toolPath } from '@/data/tools';
import { useAppStore } from '@/store/appStore';
import { ToolHeader } from '@/components/tool/ToolHeader';
import { RelatedTools } from '@/components/tool/RelatedTools';
import { ToolProvider } from '@/components/tool/ToolContext';
import { DraftRestoreBanner } from '@/components/tool/DraftRestoreBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/i18n/I18nProvider';
import { useSeo } from '@/hooks/useSeo';
import { trackToolView } from '@/lib/analytics';

function ToolSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="skeleton h-16 rounded-card" />
        <div className="skeleton h-16 rounded-card" />
        <div className="skeleton h-16 rounded-card" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton h-72 rounded-card" />
        <div className="skeleton h-72 rounded-card" />
      </div>
    </div>
  );
}

export function ToolPage() {
  const { toolId = '' } = useParams();
  const tool = getTool(toolId);
  const addRecent = useAppStore((state) => state.addRecent);
  const { t } = useI18n();

  const seoTitle = tool ? { zh: tool.name, en: tool.nameEn ?? tool.name } : undefined;
  const seoDescription = tool
    ? { zh: tool.description, en: tool.descriptionEn ?? tool.description }
    : undefined;
  useSeo(seoTitle, seoDescription);

  useEffect(() => {
    if (!tool) return;
    addRecent(tool.id);
    if (useAppStore.getState().analyticsEnabled) trackToolView(tool.id);
  }, [tool, addRecent]);

  if (!tool) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <EmptyState
          icon={<Blocks className="h-6 w-6" aria-hidden="true" />}
          title={t({ zh: '工具不存在', en: 'Tool not found' })}
          description={t({
            zh: '该工具可能已调整链接或尚未上线，请从全部工具中重新选择。',
            en: 'This tool may have moved or is not available yet. Pick again from All Tools.',
          })}
          action={
            <Link
              to="/tools"
              className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-white shadow-[0_6px_18px_rgba(33,150,243,0.28)] [background-image:var(--btn-grad)] transition-transform duration-300 hover:-translate-y-0.5"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t({ zh: '返回全部工具', en: 'Back to all tools' })}
            </Link>
          }
        />
      </div>
    );
  }

  if (tool.id !== toolId) {
    return <Navigate to={toolPath(tool.id)} replace />;
  }

  const ToolComponent = TOOL_COMPONENTS[tool.id] as
    | LazyExoticComponent<ComponentType>
    | undefined;

  return (
    <ToolProvider key={tool.id} tool={tool}>
      <div className="space-y-6">
        <ToolHeader tool={tool} />

        <DraftRestoreBanner />

        {ToolComponent ? (
          <Suspense fallback={<ToolSkeleton />}>
            <ToolComponent />
          </Suspense>
        ) : (
          <EmptyState
            title={t({ zh: '该工具正在开发中', en: 'This tool is under development' })}
            description={t({
              zh: '我们正在接入这个工具，敬请期待。你可以先浏览同分类下的其他工具。',
              en: 'We are wiring this tool up. Meanwhile, browse other tools in the same category.',
            })}
          />
        )}

        <RelatedTools tool={tool} />
      </div>
    </ToolProvider>
  );
}
