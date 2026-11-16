import type { Localized } from '@/i18n/locale';
import { collectMissing } from './vars';
import { applyRequestPatch, type EnvWrite, type ScriptPhase } from './scriptEngine';
import type { ScriptOutcome } from './sandbox';
import { buildRequest, requestInterpolatedFields, sendWbRequest, streamWbRequest, type BuiltRequest, type SendContext, type StreamedEvent, type WbResponse } from './send';
import type { WbRequest } from './types';

/** Execute one snapshot. Response observers run before tests so history survives test failures. */
export async function executeRequest({ request, context, streaming = false, signal, runScriptPhase, persistEnvWrites, setError, setHint, setScriptSkipped, onResponse, onEvent }: {
  request: WbRequest;
  context: SendContext;
  streaming?: boolean;
  signal?: AbortSignal;
  runScriptPhase: (phase: ScriptPhase, script: string, request: WbRequest, scope: Record<string, string>, response?: WbResponse) => Promise<ScriptOutcome>;
  persistEnvWrites: (writes: EnvWrite[]) => void;
  setError: (message: Localized) => void;
  setHint: (message: Localized) => void;
  setScriptSkipped: (message: Localized) => void;
  onResponse: (request: WbRequest, prepared: BuiltRequest, response: WbResponse) => void;
  onEvent: (event: StreamedEvent) => void;
}) {
  let working = request;
  let runScope = context.scope;
  const preScript = (request.preScript ?? '').trim();
  if (preScript) {
    const outcome = await runScriptPhase('prerequest', preScript, working, runScope);
    const pre = outcome.kind === 'ok' ? outcome.result : null;
    if (pre) {
      working = applyRequestPatch(working, pre.patch);
      runScope = { ...runScope, ...pre.varWrites };
      persistEnvWrites(pre.envWrites);
    }
    if (!pre || pre.error) {
      setError({ zh: '预请求脚本没跑通，请求没有发出', en: 'The pre-request script did not finish, so the request was not sent' });
      setHint({
        zh: '原因和行号见下方「脚本结果」。脚本没跑通就不发请求，免得拿一份改错了的请求去打线上。',
        en: 'The reason and line number are in Script results below. A failed pre-request script blocks the send, so a half-edited request never leaves.',
      });
      return;
    }
    const stillMissing = collectMissing(requestInterpolatedFields(working), runScope);
    if (stillMissing.length > 0) {
      setError({
        zh: `预请求脚本跑完了，变量仍然缺：${stillMissing.map((name) => `{{${name}}}`).join(' ')}`,
        en: `The pre-request script ran but these variables are still undefined: ${stillMissing.map((name) => `{{${name}}}`).join(' ')}`,
      });
      setHint({
        zh: '脚本里用 pm.variables.set 只影响这一次发送；要长期生效就 pm.environment.set 写进当前环境。',
        en: 'pm.variables.set only covers this send; use pm.environment.set to keep values in the active environment.',
      });
      return;
    }
  }
  const base = { ...context, scope: runScope };
  const prepared = buildRequest(working, base);
  const preparedContext = { ...base, prepared };
  const response = streaming
    ? await streamWbRequest(working, {
        ...preparedContext,
        signal,
        onEvent,
      })
    : await sendWbRequest(working, preparedContext);
  onResponse(working, prepared, response);
  const testScript = (working.testScript ?? '').trim();
  if (testScript && response.status > 0) {
    const outcome = await runScriptPhase('test', testScript, working, runScope, response);
    const post = outcome.kind === 'ok' ? outcome.result : null;
    if (post) persistEnvWrites(post.envWrites);
  } else if (testScript) {
    setScriptSkipped({
      zh: '测试脚本未执行：这次没有拿到可读的响应',
      en: 'The test script did not run: there was no readable response to test',
    });
  }
}
