import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/Segmented';
import { Textarea } from '@/components/ui/Textarea';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { IMPORT_FORMATS, importWorkbenchFile, type ImportFormat, type ImportedBundle } from '@/lib/apiworkbench/importers';

type Source = ImportFormat | 'auto';

export interface CollectionImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (bundle: ImportedBundle) => void;
}

/**
 * 集合导入的统一入口：Postman / Hoppscotch / HAR 三种文件都从这里进。
 * 默认「自动识别」，因为让用户先去想自己的文件是哪种格式没有意义——文件形状本身就带着答案；
 * 认不出或猜错（比如一份只有 `name` 的 Hoppscotch 环境）时才需要手动指定。
 */
export function CollectionImportModal({ open, onClose, onImported }: CollectionImportModalProps) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source>('auto');
  const [text, setText] = useState('');
  const [error, setError] = useState<Localized | null>(null);

  const doImport = (raw: string) => {
    try {
      const bundle = importWorkbenchFile(raw, source);
      if (bundle.collections.length === 0 && bundle.environments.length === 0) {
        setError({ zh: '文件里既没有集合也没有环境', en: 'The file has neither a collection nor an environment' });
        return;
      }
      setText('');
      setError(null);
      onImported(bundle);
    } catch (caught) {
      setError(toToolError(caught).localized);
    }
  };

  const format = IMPORT_FORMATS.find((item) => item.id === source);

  return (
    <Modal
      open={open}
      onClose={onClose}
      align="top"
      maxWidth={560}
      title={t({ zh: '导入集合', en: 'Import collections' })}
      description={t({
        zh: '把别处导出的 JSON 粘进来或选文件。curl 命令请用在请求编辑器里的「导入 curl」。',
        en: 'Paste or pick a JSON exported from elsewhere. For a curl command use Import curl in the request editor.',
      })}
      bodyClassName="space-y-3"
    >
      <Segmented<Source>
        size="sm"
        value={source}
        onChange={setSource}
        ariaLabel={t({ zh: '文件格式', en: 'File format' })}
        options={[
          { value: 'auto', label: t({ zh: '自动识别', en: 'Detect' }) },
          ...IMPORT_FORMATS.map((item) => ({ value: item.id, label: t(item.label) })),
        ]}
      />
      <p className="text-[11px] leading-4 text-ink-3">
        {format
          ? t(format.source)
          : t({
              zh: '按文件形状判断：`log.entries` 是 HAR，带 `info.item` 的是 Postman，`folders`/`requests` 或环境数组是 Hoppscotch。',
              en: 'Read from the shape: `log.entries` is HAR, `info.item` is Postman, `folders`/`requests` or an array of environments is Hoppscotch.',
            })}
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        mono
        className="text-xs"
        placeholder='{ "info": { "name": "My API" }, "item": [ … ] }'
        aria-label={t({ zh: '导出的 JSON', en: 'Exported JSON' })}
      />
      {error ? <ToolAlert tone="error" title={error} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
          <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '选择 .json / .har 文件', en: 'Pick .json / .har file' })}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t({ zh: '取消', en: 'Cancel' })}
          </Button>
          <Button variant="primary" size="sm" onClick={() => doImport(text)} disabled={!text.trim()}>
            {t({ zh: '导入', en: 'Import' })}
          </Button>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.har,application/json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) doImport(await file.text());
        }}
      />
    </Modal>
  );
}
