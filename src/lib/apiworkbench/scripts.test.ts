import { describe, expect, test } from 'vitest';
import {
  BODY_TRUNCATED_NOTICE,
  buildScriptPayload,
  envWriteNotice,
  outcomeNotice,
  scriptRequestOf,
  scriptResponseOf,
} from './scripts';
import { blankRequest } from './tree';
import type { Localized } from '@/i18n/locale';
import type { TimedResponse } from '@/lib/net';
import type { WbEnvironment } from './types';

/** `Localized` 允许就是一串现成文字，测试里统一只取中文那半。 */
const zh = (text: Localized): string => (typeof text === 'string' ? text : text.zh);

const response: TimedResponse = {
  status: 201,
  ok: true,
  headers: [['content-type', 'application/json']],
  text: '{"id":1}',
  bytes: 9,
  ms: 132.7,
};

const env: WbEnvironment = {
  id: 'e1',
  name: '本地',
  variables: [
    { id: '1', key: 'token', value: 'seed', enabled: true },
    { id: '2', key: 'off', value: 'x', enabled: false },
  ],
};

describe('scriptRequestOf', () => {
  test('自定义动词优先，params 缺省补空数组', () => {
    const req = { ...blankRequest(), method: 'GET' as const, customMethod: 'QUERY', params: undefined };
    const view = scriptRequestOf(req);
    expect(view.method).toBe('QUERY');
    expect(view.params).toEqual([]);
  });

  test('行是复制的，脚本改不动界面上的数据', () => {
    const req = { ...blankRequest(), headers: [{ key: 'A', value: '1', enabled: true }] };
    const view = scriptRequestOf(req);
    view.headers[0].value = '2';
    expect(req.headers[0].value).toBe('1');
  });

  test('GraphQL 给脚本看的是 query，不是打包后的 JSON', () => {
    const req = {
      ...blankRequest(),
      body: { mode: 'graphql' as const, text: '{"query":...}', graphql: { query: 'query { me }', variables: '{}' } },
    };
    expect(scriptRequestOf(req).bodyText).toBe('query { me }');
  });
});

describe('scriptResponseOf', () => {
  test('耗时取整、状态文字留空并说明原因', () => {
    const view = scriptResponseOf(response);
    expect(view).toEqual({
      code: 201,
      statusText: '',
      responseTime: 133,
      headers: [['content-type', 'application/json']],
      body: '{"id":1}',
    });
  });
});

describe('buildScriptPayload', () => {
  test('env 只收启用的变量，vars 用调用方给的合并作用域', () => {
    const payload = buildScriptPayload({
      phase: 'test',
      script: 'pm.test("x", () => {});',
      request: { ...blankRequest(), name: '登录' },
      scope: { base: 'https://api.test' },
      envVars: env.variables,
      response,
      deadlineMs: 8000,
    });
    expect(payload.env).toEqual({ token: 'seed' });
    expect(payload.vars).toEqual({ base: 'https://api.test' });
    expect(payload.requestName).toBe('登录');
    expect(payload.response?.code).toBe(201);
    expect(payload.deadlineMs).toBe(8000);
  });

  test('预请求阶段没有响应，也没有环境时给空表', () => {
    const payload = buildScriptPayload({
      phase: 'prerequest',
      script: '',
      request: blankRequest(),
      scope: {},
      envVars: [],
      deadlineMs: 5000,
    });
    expect(payload.response).toBeNull();
    expect(payload.env).toEqual({});
  });
});

describe('给界面看的说法', () => {
  test('环境写入要么落地要么说清没落地', () => {
    expect(envWriteNotice(0, env.name)).toBeNull();
    expect(zh(envWriteNotice(2, env.name)!)).toContain('环境「本地」');
    expect(zh(envWriteNotice(1, null)!)).toContain('没有启用环境');
  });

  test('三种没跑成的结局各有各的说法', () => {
    expect(zh(outcomeNotice({ kind: 'killed', deadlineMs: 5000 }))).toContain('5 秒内结束');
    expect(zh(outcomeNotice({ kind: 'unsupported', message: 'no Worker' }))).toContain('起不了脚本沙箱');
    expect(zh(outcomeNotice({ kind: 'unsupported' }))).not.toContain('：');
    expect(zh(outcomeNotice({ kind: 'crashed', message: 'boom' }))).toContain('boom');
  });

  test('截断提示是一条独立的说明，不混进失败原因', () => {
    expect(zh(BODY_TRUNCATED_NOTICE)).toContain('脚本只看到开头一段');
  });
});
