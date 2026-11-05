import type { Localized } from '@/i18n/locale';
import type { FetchMode, TimedResponse } from '@/lib/net';
import { requestMethod } from './send';
import { mergeVarScopes } from './vars';
import type { ScriptPayload, ScriptPhase, ScriptRequestInput, ScriptResponseInput } from './scriptEngine';
import type { WbRequest, WbVar } from './types';

/**
 * 把界面上的请求/响应折成脚本能看到的那份快照。
 * 这里不跑脚本，也不碰沙箱；纯数据搬运，方便单测说清「脚本到底看到了什么」。
 */

/** 请求体给脚本看的那一栏：GraphQL 看的是 query，其余看 text。 */
export function scriptRequestOf(req: WbRequest): ScriptRequestInput {
  return {
    method: requestMethod(req),
    url: req.url,
    headers: req.headers.map((row) => ({ ...row })),
    params: (req.params ?? []).map((row) => ({ ...row })),
    bodyMode: req.body.mode,
    bodyText: req.body.mode === 'graphql' ? (req.body.graphql?.query ?? '') : req.body.text,
  };
}

/**
 * fetch 拿不到状态行里的原因短语（浏览器不暴露），`statusText` 只能是空串；
 * 脚本里别依赖它，界面也是这样标注的。
 */
export function scriptResponseOf(response: TimedResponse): ScriptResponseInput {
  return {
    code: response.status,
    statusText: '',
    responseTime: Math.round(response.ms),
    headers: response.headers.map(([key, value]) => [key, value] as [string, string]),
    body: response.text,
  };
}

export function buildScriptPayload(input: {
  phase: ScriptPhase;
  script: string;
  request: WbRequest;
  /** 集合 + 环境（含继承）合并后的插值作用域。 */
  scope: Record<string, string>;
  /** 继承链并好的一张表：`pm.environment.*` 从这里起算。 */
  envVars: WbVar[];
  response?: TimedResponse | null;
  deadlineMs: number;
  /** 子请求通道：界面用哪个取数模式，脚本里的 `pm.sendRequest` 就用哪个。 */
  sendChannel?: { mode: FetchMode; timeoutMs?: number };
}): ScriptPayload {
  return {
    phase: input.phase,
    script: input.script,
    requestName: input.request.name,
    request: scriptRequestOf(input.request),
    response: input.response ? scriptResponseOf(input.response) : null,
    vars: input.scope,
    env: mergeVarScopes(input.envVars),
    deadlineMs: input.deadlineMs,
    ...(input.sendChannel ? { sendChannel: input.sendChannel } : {}),
  };
}

/** `pm.environment.*` 的落点：没有启用环境时给得出原因，而不是静默丢掉。 */
export function envWriteNotice(writes: number, envName: string | null): Localized | null {
  if (writes === 0) return null;
  if (!envName) {
    return {
      zh: `脚本写了 ${writes} 处环境变量，但没有启用环境，这些写入没有落地`,
      en: `The script wrote ${writes} environment variable(s), but no environment is active, so they went nowhere`,
    };
  }
  return {
    zh: `脚本已把 ${writes} 处改动写入环境「${envName}」`,
    en: `The script wrote ${writes} change(s) into environment "${envName}"`,
  };
}

export type OutcomeLike = { kind: string; message?: string; deadlineMs?: number };

/** 沙箱三种没跑成的说法：每种都要能让人知道下一步该做什么。 */
export function outcomeNotice(outcome: OutcomeLike): Localized {
  const seconds = Math.round((outcome.deadlineMs ?? 0) / 1000);
  if (outcome.kind === 'killed') {
    return {
      zh: `脚本没在 ${seconds} 秒内结束，沙箱线程已被终止`,
      en: `The script did not finish within ${seconds}s, so its sandbox thread was terminated`,
    };
  }
  if (outcome.kind === 'unsupported') {
    return {
      zh: `这个浏览器起不了脚本沙箱，脚本没有执行${outcome.message ? `：${outcome.message}` : ''}`,
      en: `This browser could not start the script sandbox, so the script did not run${outcome.message ? `: ${outcome.message}` : ''}`,
    };
  }
  return {
    zh: `沙箱出问题了，脚本没有正常跑完${outcome.message ? `：${outcome.message}` : ''}`,
    en: `The sandbox failed before the script could finish${outcome.message ? `: ${outcome.message}` : ''}`,
  };
}

export const BODY_TRUNCATED_NOTICE: Localized = {
  zh: '响应体太长，脚本只看到开头一段；针对整份正文的断言可能因此失败',
  en: 'The body was too long, so the script only saw the beginning; assertions over the whole body may fail because of that',
};
