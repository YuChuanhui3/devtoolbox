import { ReferenceListTool } from '@/components/tool/ReferenceListTool';
import { PORTS_DATASET } from '@/data/ports';

/** active 仅为工具箱面板统一签名（速查表无热键需要门控）。 */
export function PortsPanel({ active: _active }: { active: boolean }) {
  return <ReferenceListTool dataset={PORTS_DATASET} />;
}
