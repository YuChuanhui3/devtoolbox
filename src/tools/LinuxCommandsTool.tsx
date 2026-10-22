import { ReferenceListTool } from '@/components/tool/ReferenceListTool';
import { LINUX_COMMANDS_DATASET } from '@/data/linuxCommands';

export default function LinuxCommandsTool() {
  return <ReferenceListTool dataset={LINUX_COMMANDS_DATASET} />;
}
