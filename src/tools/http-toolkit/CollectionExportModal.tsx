import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/i18n/I18nProvider';
import { downloadText, safeFilename } from '@/lib/download';
import { exportPostman } from '@/lib/apiworkbench/transfer';
import type { L10n } from '@/i18n/locale';
import type { WbCollection } from '@/lib/apiworkbench/types';

/** 这个格式装不下什么，导出前就得说清楚，不能让人拿回去才发现请求体没了。 */
const DROPS: L10n[] = [
  { zh: 'multipart 请求体（Postman 的 JSON 里文件字节本来也存不住）', en: 'multipart bodies (file bytes never survive a Postman JSON export)' },
  { zh: 'GraphQL 请求体（他们认 graphql mode，本项目只写 raw）', en: 'GraphQL bodies (only raw bodies are written)' },
  { zh: 'API Key 与 OAuth 2.0 认证（只带 Basic / Bearer）', en: 'API key and OAuth 2.0 auth (Basic / Bearer only)' },
];

const FILE_SUFFIX = '.postman_collection.json';

export interface CollectionExportModalProps {
  open: boolean;
  onClose: () => void;
  collection: WbCollection | null;
}

export function CollectionExportModal({ open, onClose, collection }: CollectionExportModalProps) {
  const { t } = useI18n();
  const toast = useToast();
  if (!collection) return null;

  const save = () => {
    const text = JSON.stringify(exportPostman(collection), null, 2);
    downloadText(
      safeFilename(`${collection.name || 'collection'}${FILE_SUFFIX}`, 'collection.json'),
      text,
      'application/json;charset=utf-8',
    );
    toast.success(t({ zh: '已开始下载', en: 'Download started' }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      align="top"
      maxWidth={520}
      title={t({ zh: `导出集合「${collection.name}」`, en: `Export collection "${collection.name}"` })}
      description={t({
        zh: '导出的 Postman v2.1 集合能在原客户端「Import」回来。装不下的东西列在下面，不是遗漏是诚实。',
        en: 'The exported Postman v2.1 collection can be imported back into the original client. What does not fit is listed below.',
      })}
      bodyClassName="space-y-3"
    >
      <ToolAlert
        tone="info"
        title={t({ zh: '这个格式带不走的', en: 'What this format cannot carry' })}
        hint={t({
          zh: DROPS.map((item) => `· ${item.zh}`).join('\n'),
          en: DROPS.map((item) => `· ${item.en}`).join('\n'),
        })}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t({ zh: '取消', en: 'Cancel' })}
        </Button>
        <Button variant="primary" size="sm" onClick={save}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '下载 JSON', en: 'Download JSON' })}
        </Button>
      </div>
    </Modal>
  );
}
