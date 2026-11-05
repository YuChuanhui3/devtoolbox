import WbScriptWorker from '@/workers/wbScript.worker?worker&inline';
import { clampDeadline, shrinkResponseBody, type ScriptPayload, type ScriptResult } from './scriptEngine';

/**
 * 沙箱宿主：把脚本连同一个只读快照发给内联 Worker，跑完（或跑不完）就把账收回来。
 *
 * 两层防护在这里是分工明确的：引擎里的 deadline 检查（L2）拦得住会调 `pm.*` 的脚本，
 * 而 `while(1){}` 这种一步都不回宿主的，只能靠这里的看门狗 `terminate()`（L1）。
 * `terminate()` 抢占的是 CPU，不是内存——脚本把 worker 自己撑爆时走 onerror，
 * 那条同样只保证主线程不受影响。这里没有任何「脚本绝对无害」的承诺。
 */

/** 看门狗比引擎内部的 deadline 多等这一点，好让合作式超时先返回已收集的结果。 */
export const SANDBOX_GRACE_MS = 1_500;
/** postMessage 的结构化克隆有大小门槛，超了就是「数据太大」而不是「脚本有问题」。 */
export const MAX_SCRIPT_MESSAGE_CHARS = 1_000_000;

/** Worker 的最小面，测试用假对象替身即可。 */
export interface SandboxWorker {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

export type WorkerFactory = () => SandboxWorker;

export type ScriptOutcome =
  | { kind: 'ok'; result: ScriptResult; deadlineMs: number; bodyTruncated: boolean }
  /** 看门狗到点：脚本连一次回报都没有，已经 terminate。 */
  | { kind: 'killed'; deadlineMs: number }
  /** Worker 报错或被浏览器杀掉（内存撑爆属于这一类）。 */
  | { kind: 'crashed'; message: string; deadlineMs: number }
  /** 这个环境起不了 Worker（例如极老的浏览器），脚本压根没跑。 */
  | { kind: 'unsupported'; message: string };

export interface RunScriptOptions {
  /** 注入以便在没有 Worker 的环境里测协议。 */
  createWorker?: WorkerFactory;
  graceMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

/** 塞不进一条消息就把正文再削一刀，并明确告诉脚本它看到的是截断过的正文。 */
export function fitScriptPayload(payload: ScriptPayload): ScriptPayload {
  const base: ScriptPayload = {
    ...payload,
    deadlineMs: clampDeadline(payload.deadlineMs),
    response: payload.response ? shrinkResponseBody(payload.response) : payload.response ?? null,
  };
  const size = (candidate: ScriptPayload) => {
    try {
      return JSON.stringify(candidate).length;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };
  if (size(base) <= MAX_SCRIPT_MESSAGE_CHARS) return base;
  if (!base.response) {
    // 没有正文还超限，说明变量本身太大；照原样发出去，让 onerror/超时报错去说明。
    return base;
  }
  const original = base.response;
  const trimmed = (body: string): ScriptPayload => ({
    ...base,
    response: { ...original, body, bodyTruncated: true },
  });
  // 空正文都装不下就是变量的问题，削正文只会削出个空字符串。
  if (size(trimmed('')) > MAX_SCRIPT_MESSAGE_CHARS) return base;
  let cut = Math.min(original.body.length, MAX_SCRIPT_MESSAGE_CHARS - size(trimmed('')));
  // 正文里可能有需要转义的字符，长度不等于字节数；按折半收口，直到真的装得下。
  let candidate = trimmed(original.body.slice(0, cut));
  while (cut > 0 && size(candidate) > MAX_SCRIPT_MESSAGE_CHARS) {
    cut = Math.floor(cut / 2);
    candidate = trimmed(original.body.slice(0, cut));
  }
  return candidate;
}

let sequence = 0;

export function runScriptInSandbox(payload: ScriptPayload, options: RunScriptOptions = {}): Promise<ScriptOutcome> {
  const deadlineMs = clampDeadline(payload.deadlineMs);
  const ready = fitScriptPayload({ ...payload, deadlineMs });
  const graceMs = options.graceMs ?? SANDBOX_GRACE_MS;
  const schedule = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const cancelTimer = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let worker: SandboxWorker;
  try {
    worker = (options.createWorker ?? (() => new WbScriptWorker() as unknown as SandboxWorker))();
  } catch (caught) {
    return Promise.resolve({
      kind: 'unsupported',
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }

  const id = (sequence += 1);
  return new Promise<ScriptOutcome>((resolve) => {
    let settled = false;
    let timer: unknown;
    const finish = (outcome: ScriptOutcome) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) cancelTimer(timer);
      worker.onmessage = null;
      worker.onerror = null;
      // 一次运行一个线程：跑完就回收，别把脚本留下的堆一直占着。
      worker.terminate();
      resolve(outcome);
    };

    // 唯一的真正抢占手段：看门狗到点就杀线程（terminate 在 finish 里），主线程不受影响。
    timer = schedule(() => finish({ kind: 'killed', deadlineMs }), deadlineMs + graceMs);

    worker.onmessage = (event) => {
      const data = event.data as { id?: number; ok?: boolean; result?: ScriptResult; error?: string };
      if (data?.id !== id) return;
      if (data.ok && data.result) {
        finish({ kind: 'ok', result: data.result, deadlineMs, bodyTruncated: Boolean(ready.response?.bodyTruncated) });
        return;
      }
      finish({ kind: 'crashed', message: data.error ?? '沙箱没能返回结果', deadlineMs });
    };

    worker.onerror = (event) => {
      finish({
        kind: 'crashed',
        message: event?.message || '沙箱线程被浏览器终止（脚本可能吃了太多内存）',
        deadlineMs,
      });
    };

    try {
      worker.postMessage({ id, payload: ready });
    } catch (caught) {
      finish({
        kind: 'crashed',
        message: `这份请求的数据太大，发不进沙箱：${caught instanceof Error ? caught.message : String(caught)}`,
        deadlineMs,
      });
    }
  });
}
