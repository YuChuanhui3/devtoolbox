import { describe, expect, test, vi } from 'vitest';
import {
  MAX_SCRIPT_MESSAGE_CHARS,
  SANDBOX_GRACE_MS,
  fitScriptPayload,
  runScriptInSandbox,
  type SandboxWorker,
  type ScriptOutcome,
} from './sandbox';
import { runScript, runScriptSession, type ScriptPayload, type ScriptResponseInput, type SendRequester } from './scriptEngine';

const response: ScriptResponseInput = { code: 200, statusText: 'OK', responseTime: 10, headers: [], body: '{"ok":true}' };

const basePayload: ScriptPayload = {
  phase: 'test',
  script: 'pm.test("状态", () => pm.expect(pm.response.code).to.equal(200));',
  request: { method: 'GET', url: 'https://api.test/x', headers: [], params: [], bodyMode: 'none', bodyText: '' },
  response,
  vars: {},
  env: {},
};

/** 真 Worker 里跑的就是 runScriptSession；用同一个入口当替身，协议部分才算真测到。 */
class EngineWorker implements SandboxWorker {
  posted: Array<{ id: number; payload: ScriptPayload }> = [];
  terminated = 0;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;

  constructor(private readonly send: SendRequester = async () => ({ ok: false, error: '替身不发子请求' })) {}

  postMessage(message: { id: number; payload: ScriptPayload }) {
    this.posted.push(message);
    const { id, payload } = message;
    void runScriptSession(payload, this.send).then((result) => this.onmessage?.({ data: { id, ok: true, result } }));
  }

  terminate() {
    this.terminated += 1;
  }
}

/** 什么都不回，用来验证看门狗真的会 terminate。 */
class SilentWorker implements SandboxWorker {
  terminated = 0;
  onmessage = null;
  onerror: ((event: { message?: string }) => void) | null = null;

  postMessage() {}

  terminate() {
    this.terminated += 1;
  }
}

describe('runScriptInSandbox', () => {
  test('把脚本跑完并原样带回测试与日志', async () => {
    const worker = new EngineWorker();
    const outcome = await runScriptInSandbox(basePayload, { createWorker: () => worker });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.result.tests).toEqual([{ name: '状态', status: 'pass' }]);
    expect(outcome.deadlineMs).toBe(5000);
    // 一次运行一个线程，跑完就回收
    expect(worker.terminated).toBe(1);
    expect(worker.posted).toHaveLength(1);
  });

  test('deadline 会下发给 worker，脚本里的 L2 检查才有依据', async () => {
    const worker = new EngineWorker();
    await runScriptInSandbox({ ...basePayload, deadlineMs: 90000 }, { createWorker: () => worker });
    expect(worker.posted[0].payload.deadlineMs).toBe(30000);
  });

  test('结果只认自己那一次的 id，迟到的回信不会被当成这次的', async () => {
    let released: ((event: { data: unknown }) => void) | null = null;
    const worker: SandboxWorker = {
      postMessage(message) {
        const id = (message as { id: number }).id;
        released = (event) => worker.onmessage?.(event);
        // 先回一个别的 id，再回正确的
        worker.onmessage?.({ data: { id: id + 99, ok: true, result: null } });
        setTimeout(() => released?.({ data: { id, ok: true, result: runScript(basePayload) } }), 1);
      },
      terminate() {},
      onmessage: null,
      onerror: null,
    };
    const outcome = await runScriptInSandbox(basePayload, { createWorker: () => worker });
    expect(outcome.kind).toBe('ok');
  });

  test('看门狗到点就终止沙箱并如实报 killed', async () => {
    vi.useFakeTimers();
    const worker = new SilentWorker();
    const promise = runScriptInSandbox({ ...basePayload, deadlineMs: 1000 }, { createWorker: () => worker });
    await vi.advanceTimersByTimeAsync(1000 + SANDBOX_GRACE_MS);
    const outcome = await promise;
    vi.useRealTimers();
    expect(outcome).toEqual({ kind: 'killed', deadlineMs: 1000 });
    expect(worker.terminated).toBe(1);
  });

  test('合作式超时不会被看门狗抢：脚本先回结果', async () => {
    const worker = new EngineWorker();
    const outcome = await runScriptInSandbox(
      { ...basePayload, script: 'for (let i = 0; i < 500; i++) console.log(i);', deadlineMs: 1000 },
      { createWorker: () => worker },
    );
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.result.aborted).toBeUndefined();
    expect(outcome.result.logs).toHaveLength(200);
  });

  test('子请求穿过沙箱往返：宿主发的，结果回到脚本', async () => {
    const worker = new EngineWorker(async () => ({ ok: true, response: { code: 204, body: '' } }));
    const outcome = await runScriptInSandbox(
      {
        ...basePayload,
        script: 'pm.sendRequest("https://api.test/ping", (error, response) => { pm.test("子请求 204", () => pm.expect(response.code).to.equal(204)); });',
      },
      { createWorker: () => worker },
    );
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.result.sends).toBe(1);
    expect(outcome.result.tests).toEqual([{ name: '子请求 204', status: 'pass' }]);
    expect(outcome.result.sendResults).toEqual([{ ok: true, method: 'GET', url: 'https://api.test/ping', code: 204 }]);
  });

  test('worker 报错走 crashed，不会让宿主干等', async () => {
    const worker = new SilentWorker();
    const promise = runScriptInSandbox(basePayload, { createWorker: () => worker });
    worker.onerror?.({ message: 'Script terminated by timeout.' });
    const outcome = await promise;
    expect(outcome).toMatchObject({ kind: 'crashed', message: 'Script terminated by timeout.' });
    expect(worker.terminated).toBe(1);
  });

  test('onerror 没带原因时也要说清是哪一类', async () => {
    const worker = new SilentWorker();
    const promise = runScriptInSandbox(basePayload, { createWorker: () => worker });
    worker.onerror?.({});
    const outcome = await promise;
    expect(outcome.kind).toBe('crashed');
    if (outcome.kind !== 'crashed') return;
    expect(outcome.message).toContain('内存');
  });

  test('起不了 worker 就是没跑，而不是跑失败', async () => {
    const outcome = await runScriptInSandbox(basePayload, {
      createWorker: () => {
        throw new Error('Worker is not defined');
      },
    });
    expect(outcome).toEqual({ kind: 'unsupported', message: 'Worker is not defined' });
  });

  test('postMessage 直接失败时说明是数据太大', async () => {
    const worker: SandboxWorker = {
      postMessage() {
        throw new TypeError('data cloneable');
      },
      terminate() {},
      onmessage: null,
      onerror: null,
    };
    const outcome = await runScriptInSandbox(basePayload, { createWorker: () => worker });
    expect(outcome.kind).toBe('crashed');
    if (outcome.kind !== 'crashed') return;
    expect(outcome.message).toContain('发不进沙箱');
  });

  test('worker 回了个没结果的对象也算 crashed，不静默当通过', async () => {
    const worker: SandboxWorker = {
      postMessage(message) {
        const id = (message as { id: number }).id;
        worker.onmessage?.({ data: { id, ok: false, error: '引擎内部炸了' } });
      },
      terminate() {},
      onmessage: null,
      onerror: null,
    };
    const outcome = await runScriptInSandbox(basePayload, { createWorker: () => worker });
    expect(outcome).toMatchObject({ kind: 'crashed', message: '引擎内部炸了' });
  });

  test('正文被削过就回报 bodyTruncated，界面才能说明脚本看到的不是全部', async () => {
    const worker = new EngineWorker();
    const outcome = await runScriptInSandbox(
      { ...basePayload, response: { ...response, body: 'z'.repeat(600_000) } },
      { createWorker: () => worker },
    );
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.bodyTruncated).toBe(true);
    expect(worker.posted[0].payload.response?.body).toHaveLength(512_000);
  });

  test('接力的两次运行各拿自己的 id，结果不会互相顶掉', async () => {
    const workers = [new EngineWorker(), new EngineWorker()];
    let cursor = 0;
    const a = await runScriptInSandbox({ ...basePayload, script: 'pm.test("A", () => {});' }, {
      createWorker: () => workers[cursor++],
    });
    const b = await runScriptInSandbox({ ...basePayload, script: 'pm.test("B", () => {});' }, {
      createWorker: () => workers[cursor++],
    });
    expect((a as Extract<ScriptOutcome, { kind: 'ok' }>).result.tests[0].name).toBe('A');
    expect((b as Extract<ScriptOutcome, { kind: 'ok' }>).result.tests[0].name).toBe('B');
    expect(workers[1].posted[0].id).toBeGreaterThan(workers[0].posted[0].id);
  });

  test('两次并发运行各自建线程，结果不串', async () => {
    const workers = [new EngineWorker(), new EngineWorker()];
    let cursor = 0;
    const [a, b] = await Promise.all([
      runScriptInSandbox({ ...basePayload, script: 'pm.test("第一个", () => {});' }, {
        createWorker: () => workers[cursor++],
      }),
      runScriptInSandbox({ ...basePayload, script: 'pm.test("第二个", () => {});' }, {
        createWorker: () => workers[cursor++],
      }),
    ]);
    expect((a as Extract<ScriptOutcome, { kind: 'ok' }>).result.tests[0].name).toBe('第一个');
    expect((b as Extract<ScriptOutcome, { kind: 'ok' }>).result.tests[0].name).toBe('第二个');
    expect(workers.every((worker) => worker.posted.length === 1)).toBe(true);
  });
});

describe('fitScriptPayload', () => {
  test('默认 deadline 补齐，正文超限先截到 512K', () => {
    const fitted = fitScriptPayload({ ...basePayload, response: { ...response, body: 'y'.repeat(600_000) } });
    expect(fitted.deadlineMs).toBe(5000);
    expect(fitted.response?.body).toHaveLength(512_000);
    expect(fitted.response?.bodyTruncated).toBe(true);
  });

  test('整体还是太大时继续削正文，直到发得出去', () => {
    const fitted = fitScriptPayload({
      ...basePayload,
      env: { blob: 'e'.repeat(700_000) },
      response: { ...response, body: 'b'.repeat(400_000) },
    });
    expect(JSON.stringify(fitted).length).toBeLessThanOrEqual(MAX_SCRIPT_MESSAGE_CHARS);
    expect(fitted.response?.bodyTruncated).toBe(true);
    expect(fitted.response!.body.length).toBeLessThan(400_000);
  });

  test('没有响应体时无事可做', () => {
    const fitted = fitScriptPayload({ ...basePayload, response: null });
    expect(fitted.response).toBeNull();
  });
});
