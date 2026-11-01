import { ReferenceListTool } from '@/components/tool/ReferenceListTool';
import { USER_AGENTS_DATASET } from '@/data/userAgents';

/** active 仅为工具箱面板统一签名（速查表无热键需要门控）。 */
export function UaCollectionPanel({ active: _active }: { active: boolean }) {
  return <ReferenceListTool dataset={USER_AGENTS_DATASET} />;
}
