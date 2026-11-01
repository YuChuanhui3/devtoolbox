import { ReferenceListTool } from '@/components/tool/ReferenceListTool';
import { HTTP_HEADERS_DATASET } from '@/data/httpHeaders';

/** active 仅为工具箱面板统一签名（速查表无热键需要门控）。 */
export function HeadersPanel({ active: _active }: { active: boolean }) {
  return <ReferenceListTool dataset={HTTP_HEADERS_DATASET} />;
}
