/// <reference lib="webworker" />
import { proxyFetch } from '@/lib/net';
import {
  MAX_SCRIPT_SEND_TIMEOUT_MS,
  runScriptSession,
  type ScriptPayload,
  type ScriptResult,
  type SendRequester,
} from '@/lib/apiworkbench/scriptEngine';

interface WorkerRequest {
  id: number;
  payload: ScriptPayload;
}

interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: ScriptResult;
  error?: string;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

/**
 * 子请求在沙箱线程里发：走的是界面上选的那条通道，直连就受 CORS 约束。
 * 超时取「这次运行剩下的时间」和上限里较小的那个，免得一个卡住的请求把看门狗等过去。
 */
function makeSender(payload: ScriptPayload): SendRequester {
  return async (spec, budgetMs) => {
    try {
      const response = await proxyFetch(spec.url, {
        method: spec.method,
        headers: spec.headers.length ? Object.fromEntries(spec.headers) : undefined,
        body: spec.body,
        mode: payload.sendChannel?.mode ?? 'direct',
        timeoutMs: Math.max(1, Math.min(budgetMs, MAX_SCRIPT_SEND_TIMEOUT_MS)),
      });
      return {
        ok: true,
        response: {
          code: response.status,
          statusText: '',
          headers: response.headers,
          body: response.text,
          responseTime: response.ms,
        },
      };
    } catch (caught) {
      return { ok: false, error: caught instanceof Error ? caught.message : String(caught) };
    }
  };
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, payload } = event.data;
  void runScriptSession(payload, makeSender(payload))
    .then((result) => scope.postMessage({ id, ok: true, result } satisfies WorkerResponse))
    .catch((caught: unknown) => {
      // 引擎自己不该往外抛；真发生了就说清楚，别让宿主干等看门狗。
      scope.postMessage({
        id,
        ok: false,
        error: caught instanceof Error ? caught.message : String(caught),
      } satisfies WorkerResponse);
    });
};
