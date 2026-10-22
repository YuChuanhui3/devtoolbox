import { ReferenceListTool } from '@/components/tool/ReferenceListTool';
import { HTTP_METHODS_DATASET } from '@/data/httpMethods';

export default function HttpMethodsTool() {
  return <ReferenceListTool dataset={HTTP_METHODS_DATASET} />;
}
