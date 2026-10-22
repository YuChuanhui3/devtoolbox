import { countJsonNodes, generateEntityCode, type CodeGenRequest, type CodeGenResponse } from '@/lib/codegen';
import { toToolError } from '@/lib/errors';
import { parseJson } from '@/lib/json';

interface WorkerScope {
  onmessage: ((event: MessageEvent<CodeGenRequest>) => void) | null;
  postMessage: (message: CodeGenResponse) => void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { id, json, options } = event.data;
  const startedAt = performance.now();
  let nodeCount = 0;

  try {
    const value = parseJson(json);
    nodeCount = countJsonNodes(value);
    const code = generateEntityCode(value, options);
    const response: CodeGenResponse = {
      id,
      ok: true,
      code,
      nodeCount,
      durationMs: Math.round(performance.now() - startedAt),
    };
    scope.postMessage(response);
  } catch (error) {
    const toolError = toToolError(error);
    const response: CodeGenResponse = {
      id,
      ok: false,
      error: {
        message: toolError.localized,
        hint: toolError.hint,
        line: toolError.location?.line,
        column: toolError.location?.column,
      },
      nodeCount,
      durationMs: Math.round(performance.now() - startedAt),
    };
    scope.postMessage(response);
  }
};
