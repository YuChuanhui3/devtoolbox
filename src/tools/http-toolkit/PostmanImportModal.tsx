import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { importPostman } from '@/lib/apiworkbench/transfer';
import { walkRequests } from '@/lib/apiworkbench/tree';
import type { WbCollection } from '@/lib/apiworkbench/types';

export interface PostmanImportResult {
  collection: WbCollection;
  ignored: string[];
  requestCount: number;
}

export function PostmanImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (result: PostmanImportResult) => void }) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<Localized | null>(null);

  const doImport = (raw: string) => {
    try {
      const { collection, ignored } = importPostman(raw);
      setText('');
      setError(null);
      onImported({ collection, ignored, requestCount: walkRequests(collection.root).length });
    } catch (caught) {
      setError(toToolError(caught).localized);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      align="top"
      maxWidth={560}
      title={t({ zh: '导入 Postman 集合', en: 'Import Postman collection' })}
      description={t({
        zh: 'Postman 客户端「Collections → 集合 → Export」导出的 v2.1/v2.0 JSON 文件。',
        en: 'The v2.1/v2.0 JSON exported from Postman via Collections → Export.',
      })}
      bodyClassName="space-y-3"
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        mono
        className="text-xs"
        placeholder='{ "info": { "name": "My API", "schema": "…v2.1.0…" }, "item": [ … ] }'
        aria-label={t({ zh: 'Postman JSON', en: 'Postman JSON' })}
      />
      {error ? <ToolAlert tone="error" title={error} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
          <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '选择 .json 文件', en: 'Pick .json file' })}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t({ zh: '取消', en: 'Cancel' })}
          </Button>
          <Button variant="primary" size="sm" onClick={() => doImport(text)} disabled={!text.trim()}>
            {t({ zh: '导入为新集合', en: 'Import as new collection' })}
          </Button>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
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
