import { lazy, Suspense } from 'react';
import { ArrowLeftRight, FileCode2, ImageDown } from 'lucide-react';
import { ToolkitTabs } from '@/components/tool/ToolkitTabs';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { useI18n } from '@/i18n/I18nProvider';

const Compress = lazy(() => import('./ImageCompressTool'));
const Convert = lazy(() => import('./ImageConvertTool'));
const Base64 = lazy(() => import('./ImageBase64Tool'));
type Mode = 'compress' | 'convert' | 'base64';

export default function ImageToolkitTool() {
  const { t } = useI18n();
  const [mode, setMode] = useToolkitMode<Mode>(['compress', 'convert', 'base64'], 'compress');
  return (
    <div className="space-y-4">
      <ToolkitTabs<Mode>
        value={mode}
        onChange={setMode}
        ariaLabel={t({ zh: '图片工作台模式', en: 'Image workbench mode' })}
        options={[
          { value: 'compress', label: t({ zh: '压缩与缩放', en: 'Compress & resize' }), icon: <ImageDown className="h-3.5 w-3.5" aria-hidden="true" /> },
          { value: 'convert', label: t({ zh: '格式转换', en: 'Convert' }), icon: <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" /> },
          { value: 'base64', label: t({ zh: 'Base64 互转', en: 'Base64' }), icon: <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" /> },
        ]}
      />
      <p className="text-xs text-ink-3">{t({ zh: '全部在本地处理。各页签独立保留上传文件、参数和结果。', en: 'Processed locally. Each tab retains its own files, settings, and results.' })}</p>
      <Suspense fallback={<p role="status">{t({ zh: '正在加载图片工具…', en: 'Loading image tool…' })}</p>}>
        <LazyPanel active={mode === 'compress'}><Compress /></LazyPanel>
        <LazyPanel active={mode === 'convert'}><Convert /></LazyPanel>
        <LazyPanel active={mode === 'base64'}><Base64 active={mode === 'base64'} /></LazyPanel>
      </Suspense>
    </div>
  );
}
