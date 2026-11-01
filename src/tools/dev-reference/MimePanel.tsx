import { ReferenceListTool } from '@/components/tool/ReferenceListTool';
import { MIME_DATASET } from '@/data/mimeTypes';

/** active 仅为工具箱面板统一签名（速查表无热键需要门控）。 */
export function MimePanel({ active: _active }: { active: boolean }) {
  return <ReferenceListTool dataset={MIME_DATASET} />;
}
