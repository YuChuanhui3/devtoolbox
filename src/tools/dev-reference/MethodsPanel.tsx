import { ReferenceListTool } from '@/components/tool/ReferenceListTool';
import { HTTP_METHODS_DATASET } from '@/data/httpMethods';

/** active 仅为工具箱面板统一签名（速查表无热键需要门控）。 */
export function MethodsPanel({ active: _active }: { active: boolean }) {
  return <ReferenceListTool dataset={HTTP_METHODS_DATASET} />;
}
