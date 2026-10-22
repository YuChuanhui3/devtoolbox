import { ReferenceListTool } from '@/components/tool/ReferenceListTool';
import { HTTP_HEADERS_DATASET } from '@/data/httpHeaders';

export default function HttpHeadersTool() {
  return <ReferenceListTool dataset={HTTP_HEADERS_DATASET} />;
}
