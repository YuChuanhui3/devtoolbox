import { ReferenceListTool } from '@/components/tool/ReferenceListTool';
import { LINUX_COMMANDS_DATASET } from '@/data/linuxCommands';

/** active 仅为工具箱面板统一签名（速查表无热键需要门控）。 */
export function LinuxPanel({ active: _active }: { active: boolean }) {
  return <ReferenceListTool dataset={LINUX_COMMANDS_DATASET} />;
}
