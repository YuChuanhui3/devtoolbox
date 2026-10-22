import { ReferenceListTool } from '@/components/tool/ReferenceListTool';
import { MIME_DATASET } from '@/data/mimeTypes';

export default function MimeTool() {
  return <ReferenceListTool dataset={MIME_DATASET} />;
}
