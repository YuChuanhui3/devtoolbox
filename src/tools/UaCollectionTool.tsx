import { ReferenceListTool } from '@/components/tool/ReferenceListTool';
import { USER_AGENTS_DATASET } from '@/data/userAgents';

export default function UaCollectionTool() {
  return <ReferenceListTool dataset={USER_AGENTS_DATASET} />;
}
