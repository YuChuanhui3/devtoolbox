import { ReferenceListTool } from '@/components/tool/ReferenceListTool';
import { PORTS_DATASET } from '@/data/ports';

export default function PortsTool() {
  return <ReferenceListTool dataset={PORTS_DATASET} />;
}
