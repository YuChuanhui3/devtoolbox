import { describe, expect, test } from 'vitest';
import {
  MAX_SCRIPT_CHARS,
  MAX_SCRIPT_LOGS,
  MAX_SCRIPT_SENDS,
  MAX_SCRIPT_SEND_URL_CHARS,
  MAX_SCRIPT_TESTS,
  applyEnvWrites,
  applyRequestPatch,
  clampDeadline,
  errorLine,
  pmExpect,
  runScript,
  runScriptSession,
  shrinkResponseBody,
  DEFAULT_SCRIPT_DEADLINE_MS,
  MAX_SCRIPT_DEADLINE_MS,
  MIN_SCRIPT_DEADLINE_MS,
} from './scriptEngine';
import type { ScriptPayload, ScriptRequestInput, ScriptResponseInput, SendRequestSpec } from './scriptEngine';

const request: ScriptRequestInput = {
  method: 'GET',
  url: 'https://api.test/{{path}}',
  headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
  params: [{ key: 'page', value: '1', enabled: true }],
  bodyMode: 'none',
  bodyText: '',
};

const response: ScriptResponseInput = {
  code: 200,
  statusText: 'OK',
  responseTime: 42,
  headers: [['content-type', 'application/json'], ['x-request-id', 'abc']],
  body: '{"data":{"id":7,"tags":["a","b"]},"total":2}',
};

function payload(overrides: Partial<ScriptPayload> = {}): ScriptPayload {
  return {
    phase: 'test',
    script: '',
    request,
    response,
    vars: { base: 'https://api.test' },
    env: { token: 'seed' },
    ...overrides,
  };
}

function run(script: string, overrides: Partial<ScriptPayload> = {}) {
  return runScript(payload({ script, ...overrides }));
}

/** 断言链是 Proxy，静态类型说不清它在「取属性」还是「调用」；测试里统一按两者皆可看待。 */
type Chain = { [key: string]: ChainNode };
type ChainNode = Chain & ((...args: unknown[]) => Chain);
const chain = (value: unknown, res: ScriptResponseInput | null = null): ChainNode => pmExpect(value, res) as ChainNode;

describe('runScript 基本形状', () => {
  test('空脚本不算运行也不报错', () => {
    const result = run('   ');
    expect(result.ran).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.tests).toEqual([]);
  });

  test('超过长度上限直接拒绝执行', () => {
    const result = run(`// ${'x'.repeat(MAX_SCRIPT_CHARS)}`);
    expect(result.error).toContain(`${MAX_SCRIPT_CHARS} 字符`);
    expect(result.ran).toBe(false);
  });

  test('语法错误报出来并且不假装运行过', () => {
    const result = run('pm.test(("unfinished"');
    expect(result.ran).toBe(false);
    expect(result.error).toContain('脚本没能解析');
  });

  test('运行时抛错带上行号', () => {
    const result = run('console.log("a");\nconst n = undefined.x;');
    expect(result.error).toBe("Cannot read properties of undefined (reading 'x')");
    expect(result.errorLine).toBe(2);
  });

  test('pm.test 通过与失败各计一条，失败带原因', () => {
    const result = run(
      'pm.test("通过", () => pm.expect(1).to.equal(1));\n' +
        'pm.test("失败", () => pm.expect(1).to.equal(2));',
    );
    expect(result.ran).toBe(true);
    expect(result.tests).toEqual([
      { name: '通过', status: 'pass' },
      { name: '失败', status: 'fail', error: 'expected 1 to equal 2' },
    ]);
  });

  test('console 输出进环形日志并截断超长行', () => {
    const result = run('console.log("a", 1, { b: 2 });\nconsole.warn("w");');
    expect(result.logs).toEqual(['a 1 {"b":2}', 'w']);
  });
});

describe('expect 链', () => {
  const passing: Array<[string, () => void]> = [
    ['expect(200).to.equal(200)', () => void chain(200).to.equal(200)],
    ['expect(200).to.be.a("number")', () => void chain(200).to.be.a('number')],
    ['expect("abc").to.include("b")', () => void chain('abc').to.include('b')],
    ['expect([1, 2]).to.have.lengthOf(2)', () => void chain([1, 2]).to.have.lengthOf(2)],
    ['expect({ a: 1 }).to.eql({ a: 1 })', () => void chain({ a: 1 }).to.eql({ a: 1 })],
    ['expect(1).to.be.above(0)', () => void chain(1).to.be.above(0)],
    ['expect(1).to.be.within(1, 2)', () => void chain(1).to.be.within(1, 2)],
    ['expect("x").to.match(/x/)', () => void chain('x').to.match(/x/)],
    ['expect(null).to.be.null', () => void chain(null).to.be.null],
    ['expect(undefined).to.be.undefined', () => void chain(undefined).to.be.undefined],
    ['expect({}).to.be.empty', () => void chain({}).to.be.empty],
    ['expect("a").to.be.ok', () => void chain('a').to.be.ok],
    ['expect("a").to.not.equal("b")', () => void chain('a').to.not.equal('b')],
    ['expect("a").to.not.be.a("number")', () => void chain('a').to.not.be.a('number')],
    ['expect("abc").to.oneOf(["x", "abc"])', () => void chain('abc').to.oneOf(['x', 'abc'])],
    ['expect({ a: { b: 1 } }).to.have.property("a.b")', () => void chain({ a: { b: 1 } }).to.have.property('a.b')],
    ['expect({ a: { b: 1 } }).to.have.property("a.b", 1)', () => void chain({ a: { b: 1 } }).to.have.property('a.b', 1)],
  ];
  const failing: Array<[string, () => void]> = [
    ['expect({ a: 1 }).to.equal({ a: 1 })', () => void chain({ a: 1 }).to.equal({ a: 1 })],
    ['expect(1).to.equal(2)', () => void chain(1).to.equal(2)],
    ['expect(1).to.be.above(2)', () => void chain(1).to.be.above(2)],
    ['expect("a").to.not.be.ok', () => void chain('a').to.not.be.ok],
    ['expect([1]).to.include(2)', () => void chain([1]).to.include(2)],
    ['expect({ a: 1 }).to.have.property("b")', () => void chain({ a: 1 }).to.have.property('b')],
    ['expect(1).to.be.within(2, 3)', () => void chain(1).to.be.within(2, 3)],
  ];

  passing.forEach(([label, assert]) => {
    test(`${label} 通过`, assert);
  });

  failing.forEach(([label, assert]) => {
    test(`${label} 失败`, () => {
      expect(assert).toThrow(/expected/);
    });
  });

  test('status 只在有响应时可断言', () => {
    expect(() => chain(1).to.have.status(200)).toThrow('status 只能在测试阶段断言');
    expect(() => chain(1, response).to.have.status(200)).not.toThrow();
    expect(() => chain(1, response).to.have.status(404)).toThrow('expected 200 to status 404');
  });

  test('within 少给一个边界是用法错误，不是静默通过', () => {
    expect(() => chain(1).to.be.within(1)).toThrow('within 需要两个边界');
  });
});

describe('pmExpect 直接调用', () => {
  test('相等的 equal 不抛，不等抛 AssertionError 文案', () => {
    expect(() => chain(1).to.equal(1)).not.toThrow();
    expect(() => chain(1).to.equal(2)).toThrow('expected 1 to equal 2');
    expect(() => chain('x').to.not.equal('x')).toThrow('expected x not to equal x');
  });

  test('deep equal 走 eql / deep.equal', () => {
    expect(() => chain({ a: [1, 2] }).to.eql({ a: [1, 2] })).not.toThrow();
    expect(() => chain({ a: [1, 2] }).to.deep.equal({ a: [1, 2] })).not.toThrow();
    expect(() => chain({ a: 1 }).to.equal({ a: 1 })).toThrow();
  });

  test('不认识的断言直接报用法错误，不静默通过', () => {
    expect(() => chain(1).to.whatever(1)).toThrow('pm.expect 没有 .whatever 这个断言');
    expect(() => chain([1]).to.members([1])).toThrow('暂不支持');
    expect(() => chain(1)()).toThrow('后面要跟断言');
  });

  test('lengthOf 用在没有长度的东西上会说明', () => {
    expect(() => chain(1).to.have.lengthOf(1)).toThrow('没有长度可言');
  });
});

describe('pm.response', () => {
  test('读状态码、响应头与 json', () => {
    const result = run(
      'pm.test("状态", () => pm.expect(pm.response.code).to.equal(200));' +
        'pm.test("耗时", () => pm.expect(pm.response.responseTime).to.be.below(100));' +
        'pm.test("状态文字", () => pm.expect(pm.response.statusText).to.equal("OK"));' +
        'pm.test("头", () => pm.expect(pm.response.headers.get("X-Request-Id")).to.equal("abc"));' +
        'pm.test("头列表", () => {' +
        'pm.expect(pm.response.headers.has("content-type")).to.be.true;' +
        'pm.expect(pm.response.headers.all()).to.have.lengthOf(2);' +
        '});' +
        'pm.test("json", () => pm.expect(pm.response.json().total).to.equal(2));',
    );
    expect(result.tests).toHaveLength(6);
    expect(result.tests.map((item) => item.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
    const wrong = run('pm.test("状态", () => pm.expect(pm.response.code).to.equal(404));');
    expect(wrong.tests[0].status).toBe('fail');
  });

  test('Postman 式状态断言按状态码判定，不会因对象真值假通过', () => {
    expect(run('pm.test("ok", () => pm.response.to.be.ok);').tests[0].status).toBe('pass');
    const failed = run('pm.test("ok", () => pm.response.to.be.ok);', { response: { ...response, code: 503 } });
    expect(failed.tests[0]).toMatchObject({ status: 'fail', error: 'expected 503 to be ok' });
    const nf = run('pm.test("404", () => pm.response.to.be.notFound);', { response: { ...response, code: 503 } });
    expect(nf.tests[0].status).toBe('fail');
  });

  test('have.header / have.body / have.status', () => {
    const good = run(
      'pm.test("头", () => pm.response.to.have.header("Content-Type"));' +
        'pm.test("头值", () => pm.response.to.have.header("X-Request-Id", "abc"));' +
        'pm.test("有正文", () => pm.response.to.have.body());' +
        'pm.test("整块正文", () => pm.response.to.have.body(' + JSON.stringify(response.body) + '));' +
        'pm.test("正文正则", () => pm.response.to.have.body(/"total":2/));' +
        'pm.test("包含", () => pm.expect(pm.response.body).to.include("total"));' +
        'pm.test("状态", () => pm.response.to.have.status(200));',
    );
    expect(good.tests.map((item) => item.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
    const bad = run('pm.test("头", () => pm.response.to.have.header("X-Missing"));');
    expect(bad.tests[0].status).toBe('fail');
    const wrongValue = run('pm.test("头值", () => pm.response.to.have.header("X-Request-Id", "zzz"));');
    expect(wrongValue.tests[0].status).toBe('fail');
    const notExact = run('pm.test("整块正文", () => pm.response.to.have.body("total"));');
    expect(notExact.tests[0].error).toContain('to have body');
  });

  test('jsonBody 路径不存在时失败而不是抛错', () => {
    const hit = run('pm.test("j", () => pm.response.to.have.jsonBody("data.id", 7));');
    expect(hit.tests[0].status).toBe('pass');
    const miss = run('pm.test("j", () => pm.response.to.have.jsonBody("data.nope", 1));');
    expect(miss.tests[0].status).toBe('fail');
    const broken = run('pm.test("j", () => pm.response.to.have.jsonBody("a", 1));', {
      response: { ...response, body: 'not json' },
    });
    expect(broken.tests[0].error).toContain('响应体不是合法 JSON');
  });

  test('预请求阶段碰 pm.response 会说明原因', () => {
    const result = run('pm.response.to.have.status(200);', { phase: 'prerequest', response: null });
    expect(result.error).toContain('预请求阶段还没有 pm.response');
    const inTest = run('pm.test("碰一下", () => pm.response.json());', { response: null });
    expect(inTest.tests[0].error).toContain('预请求阶段还没有 pm.response');
  });
});

describe('变量与环境', () => {
  test('pm.variables.get 读合并作用域，内置 $ 变量可用', () => {
    const result = run(
      'pm.test("v", () => {' +
        'pm.expect(pm.variables.get("base")).to.equal("https://api.test");' +
        'pm.expect(pm.variables.get("ghost")).to.be.undefined;' +
        '});',
    );
    expect(result.tests.every((item) => item.status === 'pass')).toBe(true);
  });

  test('pm.variables.set 只进 varWrites，测试阶段拒绝', () => {
    const pre = run('pm.variables.set("path", "users");', { phase: 'prerequest' });
    expect(pre.varWrites).toEqual({ path: 'users' });
    const post = run('pm.variables.set("path", "users");');
    expect(post.error).toContain('测试阶段');
  });

  test('pm.environment.set/unset 有序收集，读得到自己刚写的值', () => {
    const result = run(
      'pm.environment.set("token", "fresh");' +
        'pm.test("读回", () => pm.expect(pm.environment.get("token")).to.equal("fresh"));' +
        'pm.environment.unset("ghost");',
    );
    expect(result.envWrites).toEqual([
      { op: 'set', key: 'token', value: 'fresh' },
      { op: 'unset', key: 'ghost' },
    ]);
    expect(result.tests[0].status).toBe('pass');
  });

  test('环境名不能为空也不许超长', () => {
    expect(run('pm.environment.set("", "v");').error).toContain('名字不能为空');
    expect(run(`pm.environment.set("${'k'.repeat(300)}", "v");`).error).toContain('超过');
  });

  test('applyEnvWrites：覆盖、置空、追加、删除', () => {
    const vars = [
      { id: '1', key: 'token', value: 'old', enabled: false },
      { id: '2', key: 'other', value: 'x', enabled: true },
    ];
    const after = applyEnvWrites(vars, [
      { op: 'set', key: 'token', value: 'new' },
      { op: 'set', key: 'fresh', value: '1' },
      { op: 'unset', key: 'other' },
    ]);
    expect(after).toEqual([
      { id: '1', key: 'token', value: 'new', enabled: true },
      { id: 'script-fresh', key: 'fresh', value: '1', enabled: true },
    ]);
    expect(vars[0].value).toBe('old');
    expect(applyEnvWrites(vars, [])).toBe(vars);
  });
});

describe('改请求（仅预请求阶段）', () => {
  test('method / url / body / header / param 都能改写并回传 patch', () => {
    const result = run(
      'pm.request.method = "post";' +
        'pm.request.url = "https://api.test/users";' +
        'pm.request.body = "{\\"a\\":1}";' +
        'pm.request.headers.upsert({ key: "X-Trace", value: "1" });' +
        'pm.request.headers.remove("Accept");' +
        'pm.request.params.set("page", "2");',
      { phase: 'prerequest' },
    );
    expect(result.patch.method).toBe('POST');
    expect(result.patch.url).toBe('https://api.test/users');
    expect(result.patch.bodyText).toBe('{"a":1}');
    expect(result.patch.headers).toEqual([{ key: 'X-Trace', value: '1', enabled: true }]);
    expect(result.patch.params).toEqual([{ key: 'page', value: '2', enabled: true }]);
  });

  test('读请求头与参数列表；大小写不敏感命中', () => {
    const result = run(
      'pm.test("req", () => {' +
        'pm.expect(pm.request.headers.get("accept")).to.equal("application/json");' +
        'pm.expect(pm.request.headers.count()).to.equal(1);' +
        'pm.expect(pm.request.params.has("page")).to.be.true;' +
        'pm.expect(pm.request.headers.toObject()).to.eql({ Accept: "application/json" });' +
        '});',
      { phase: 'prerequest' },
    );
    expect(result.tests[0].status).toBe('pass');
  });

  test('测试阶段改写请求是用法错误，不是失败断言', () => {
    expect(run('pm.request.url = "x";').error).toContain('测试阶段不能改写请求');
    expect(run('pm.request.headers.add({ key: "A", value: "1" });').error).toContain('测试阶段不能改写请求');
  });

  test('multipart 正文不接受脚本改写', () => {
    const result = run('pm.request.body = "x";', {
      phase: 'prerequest',
      request: { ...request, bodyMode: 'multipart' },
    });
    expect(result.error).toContain('multipart');
  });

  test('applyRequestPatch 不改时原样返回，改时不碰原对象', () => {
    const base = {
      method: 'GET',
      customMethod: 'QUERY',
      url: 'https://api.test',
      headers: [],
      params: [],
      body: { mode: 'json' as const, text: '{}' },
    };
    expect(applyRequestPatch(base, {})).toBe(base);
    const moved = applyRequestPatch(base, { method: 'POST', url: 'u', bodyText: '{"a":1}' });
    expect(moved).toMatchObject({ method: 'POST', customMethod: undefined, url: 'u', body: { mode: 'json', text: '{"a":1}' } });
    expect(base.body.text).toBe('{}');
    const gql = applyRequestPatch({ ...base, method: 'POST', body: { mode: 'graphql' as const, text: '', graphql: { query: 'old', variables: '{}' } } }, { bodyText: 'new' });
    expect(gql.body.graphql).toMatchObject({ query: 'new', variables: '{}' });
  });

  test('graphql 的脚本正文只换 query，variables 与操作名保留', () => {
    const gql = applyRequestPatch(
      {
        method: 'POST',
        url: 'u',
        headers: [],
        body: { mode: 'graphql' as const, text: '', graphql: { query: 'old', variables: '{"id":"1"}', operationName: 'Op' } },
      },
      { bodyText: 'query { me }' },
    );
    expect(gql.body.graphql).toEqual({ query: 'query { me }', variables: '{"id":"1"}', operationName: 'Op' });
    expect(gql.body.text).toBe('');
  });
});

describe('失控防护', () => {
  test('clampDeadline 收进 1–30 秒', () => {
    expect(clampDeadline(0)).toBe(MIN_SCRIPT_DEADLINE_MS);
    expect(clampDeadline(999999)).toBe(MAX_SCRIPT_DEADLINE_MS);
    expect(clampDeadline('abc')).toBe(DEFAULT_SCRIPT_DEADLINE_MS);
    expect(clampDeadline(7600.4)).toBe(7600);
  });

  // 每次取时间都前进一格，用来在没有真实等待的情况下逼近 deadline。
  const ticking = (step: number) => {
    let clock = 0;
    return () => (clock += step);
  };

  test('每个 pm.* 调用点都问一次还剩不剩时间', () => {
    const script = 'for (let i = 0; i < 150; i++) console.log(i);';
    const slow = runScript(payload({ script }), ticking(1));
    expect(slow.aborted).toBeUndefined();
    expect(slow.logs).toHaveLength(150);
    const fast = runScript(payload({ script }), ticking(1000));
    expect(fast.aborted).toBe(true);
    expect(fast.ran).toBe(true);
    expect(fast.logs.length).toBeLessThan(10);
  });

  test('aborted 时已收集的测试照样带回去', () => {
    const result = runScript(
      payload({
        script: 'pm.test("先过的", () => pm.expect(1).to.equal(1));\nfor (let i = 0; i < 10; i++) console.log(i);',
        deadlineMs: 5000,
      }),
      ticking(1000),
    );
    expect(result.aborted).toBe(true);
    expect(result.tests).toEqual([{ name: '先过的', status: 'pass' }]);
  });

  test('纯计算而不调 pm 的死循环只能靠宿主 terminate，引擎不假装能抢占', () => {
    // 这条只记录边界：没有 pm.* 调用点就没有可检查的时刻，见 sandbox.ts 的看门狗。
    const result = runScript(payload({ script: 'let n = 0;\nfor (let i = 0; i < 10; i++) n += i;' }));
    expect(result.ran).toBe(true);
    expect(result.aborted).toBeUndefined();
  });
});

describe('硬上限', () => {
  test(`测试条数封顶 ${MAX_SCRIPT_TESTS}`, () => {
    const result = runScript(payload({ script: 'for (let i = 0; i < 250; i++) pm.test("t" + i, () => {});' }));
    expect(result.tests).toHaveLength(MAX_SCRIPT_TESTS);
    expect(result.testsCapped).toBe(true);
  });

  test(`日志条数封顶 ${MAX_SCRIPT_LOGS}：留下的是最后那些`, () => {
    const result = runScript(payload({ script: 'for (let i = 0; i < 300; i++) console.log(i);' }));
    expect(result.logs).toHaveLength(MAX_SCRIPT_LOGS);
    expect(result.logsCapped).toBe(true);
    // 循环里调试脚本要看的是最近的输出，留头不留尾等于把现场擦掉。
    expect(result.logs[0]).toBe('100');
    expect(result.logs[MAX_SCRIPT_LOGS - 1]).toBe('299');
  });

  test('pm.test 不传回调时报usage错误', () => {
    expect(run('pm.test("没函数");').error).toContain('需要回调函数');
  });
});

describe('pm.test.skip', () => {
  test('跳过不跑断言，既不算通过也不算失败', () => {
    const result = run('pm.test.skip("还没做分页");');
    expect(result.tests).toEqual([{ name: '还没做分页', status: 'skip' }]);
    expect(result.skips).toBe(1);
    expect(result.ran).toBe(true);
  });

  test('带原因的跳过把原因挂在同一条上', () => {
    const result = run('pm.test.skip("令牌刷新", "没有可用的过期端点");');
    expect(result.tests[0].error).toBe('没有可用的过期端点');
  });

  test('跳过名不能为空', () => {
    expect(run('pm.test.skip("   ");').error).toContain('名字不能为空');
  });

  test('跳过同样占断言条数上限', () => {
    const result = runScript(payload({ script: `for (let i = 0; i < ${MAX_SCRIPT_TESTS + 5}; i++) pm.test.skip("t" + i);` }));
    expect(result.tests).toHaveLength(MAX_SCRIPT_TESTS);
    expect(result.skips).toBe(MAX_SCRIPT_TESTS);
    expect(result.testsCapped).toBe(true);
  });
});

describe('pm.sendRequest 与 runScriptSession', () => {
  test('子请求交给注入的发送器，结果原样回到回调', async () => {
    const specs: SendRequestSpec[] = [];
    const result = await runScriptSession(
      payload({
        script: 'pm.sendRequest("{{base}}/tokens", (error, response) => {'
          + 'pm.test("子请求 201", () => pm.expect(error).to.equal(null));'
          + 'pm.test("正文", () => pm.expect(response.text()).to.equal("tok"));'
          + 'pm.environment.set("issued", response.code + "");'
          + '});',
      }),
      async (spec) => {
        specs.push(spec);
        return { ok: true, response: { code: 201, body: 'tok', headers: [['x-trace', 't']] } };
      },
    );
    expect(specs).toEqual([{ url: 'https://api.test/tokens', method: 'GET', headers: [] }]);
    expect(result.sends).toBe(1);
    expect(result.tests.map((item) => item.status)).toEqual(['pass', 'pass']);
    expect(result.envWrites).toEqual([{ op: 'set', key: 'issued', value: '201' }]);
    expect(result.sendResults).toEqual([{ ok: true, method: 'GET', url: 'https://api.test/tokens', code: 201 }]);
  });

  test('对象写法：方法、请求头、正文都做变量插值', async () => {
    const specs: SendRequestSpec[] = [];
    await runScriptSession(
      payload({
        vars: { base: 'https://api.test', path: '/v2/items' },
        script: 'pm.sendRequest({ url: "{{base}}{{path}}", method: "post", header: { Authorization: "Bearer seeded", "X-Page": "1" }, body: "{\\"q\\":\\"{{path}}\\"}" }, () => {});',
      }),
      async (spec) => {
        specs.push(spec);
        return { ok: true, response: { code: 200, body: '' } };
      },
    );
    expect(specs[0].method).toBe('POST');
    expect(specs[0].url).toBe('https://api.test/v2/items');
    expect(specs[0].headers).toEqual([['Authorization', 'Bearer seeded'], ['X-Page', '1']]);
    expect(specs[0].body).toBe('{"q":"/v2/items"}');
  });

  test('发失败的子请求是一种结果，不是异常：回调照样收到原因', async () => {
    const result = await runScriptSession(
      payload({ script: 'pm.sendRequest("https://api.test/x", (error, response) => { pm.test("拿到了错误", () => pm.expect(error.message).to.include("CORS")); pm.test("没有响应", () => pm.expect(response).to.equal(null)); });' }),
      async () => ({ ok: false, error: '浏览器 CORS 拦住了这个跨域请求' }),
    );
    expect(result.tests.map((item) => item.status)).toEqual(['pass', 'pass']);
    expect(result.sendResults?.[0]).toEqual({ ok: false, method: 'GET', url: 'https://api.test/x', error: '浏览器 CORS 拦住了这个跨域请求' });
  });

  test(`一次运行最多 ${MAX_SCRIPT_SENDS} 条，超出来的不发送但回调被告知`, async () => {
    let sent = 0;
    const result = await runScriptSession(
      payload({ script: 'for (let i = 0; i < 8; i++) pm.sendRequest("https://api.test/" + i, () => {});' }),
      async () => {
        sent += 1;
        return { ok: true, response: { code: 200, body: '' } };
      },
    );
    expect(sent).toBe(MAX_SCRIPT_SENDS);
    expect(result.sends).toBe(MAX_SCRIPT_SENDS);
    expect(result.sendsCapped).toBe(true);
    expect(result.sendResults).toHaveLength(8);
    expect(result.sendResults?.[MAX_SCRIPT_SENDS].error).toContain('没有发出去');
  });

  test('deadline 到点后不再把响应交给回调：后面的语句不补跑', async () => {
    let clock = 0;
    const result = await runScriptSession(
      payload({
        deadlineMs: 1000,
        script: 'pm.sendRequest("https://api.test/a", () => { pm.environment.set("late", "yes"); });',
      }),
      async () => {
        clock = 5000;
        return { ok: true, response: { code: 200, body: '' } };
      },
      () => clock,
    );
    expect(result.sends).toBe(1);
    expect(result.envWrites).toEqual([]);
    expect(result.aborted).toBe(true);
    expect(result.sendResults?.[0]).toEqual({ ok: true, method: 'GET', url: 'https://api.test/a', code: 200 });
  });

  test('回调互相触发排不完时，按轮次上限收口并说明', async () => {
    const result = await runScriptSession(
      payload({ script: 'function loop(i) { pm.sendRequest("https://api.test/" + i, () => loop(i + 1)); } loop(0);' }),
      async () => ({ ok: true, response: { code: 200, body: '' } }),
    );
    expect(result.sends).toBe(MAX_SCRIPT_SENDS);
    expect(result.sendsCapped).toBe(true);
    const last = result.sendResults?.[result.sendResults.length - 1];
    expect(last?.ok).toBe(false);
    expect(last?.error).toContain('轮次上限');
  });

  test('回调里抛错会中止后面的轮次，并说清错在哪', async () => {
    let sent = 0;
    const result = await runScriptSession(
      payload({
        script: 'pm.sendRequest("https://api.test/a", () => { pm.nope(); });'
          + 'pm.sendRequest("https://api.test/b", () => { pm.sendRequest("https://api.test/c", () => {}); });',
      }),
      async () => {
        sent += 1;
        return { ok: true, response: { code: 200, body: '' } };
      },
    );
    // 已经排进同一轮的两条真的发了（网络已经动过），回调里新排的那条不再发。
    expect(sent).toBe(2);
    expect(result.sends).toBe(3);
    expect(result.error).toContain('回调里出了错');
    expect(result.sendResults?.[2].error).toContain('回调里先出了错');
  });

  test('同步的 runScript 没有发送通道：如实告诉回调，不静默吞掉', () => {
    const result = run('pm.sendRequest("https://api.test/x", (error, response) => { pm.test("被告知没有通道", () => pm.expect(error.message).to.include("没有启用")); pm.test("确实没响应", () => pm.expect(response).to.equal(null)); });');
    expect(result.sends).toBe(1);
    expect(result.tests.map((item) => item.status)).toEqual(['pass', 'pass']);
    expect(result.sendResults?.[0].error).toContain('没有启用子请求发送通道');
  });

  test('url 要带协议、正文不能挂在 GET 上、超长度就说超长度', () => {
    expect(run('pm.sendRequest("api.test/x", () => {});').error).toContain('要带协议');
    expect(run('pm.sendRequest("", () => {});').error).toContain('需要一个 url');
    expect(run('pm.sendRequest({ url: "https://api.test/x", body: "hi" }, () => {});').error).toContain('GET 不能带正文');
    const fatBody = 'pm.test("拼超长正文", () => { let s = ""; for (let i = 0; i < 70; i++) s += "y".repeat(1000); pm.sendRequest({ url: "https://api.test/x", method: "POST", body: s }, () => {}); });';
    expect(run(fatBody).tests[0].error).toContain('正文超过');
    expect(run(`pm.sendRequest("https://api.test/${'z'.repeat(MAX_SCRIPT_SEND_URL_CHARS)}", () => {});`).error).toContain('url 超过');
  });
});

describe('能力不给就用不了', () => {
  const blocked = ['fetch("/x")', 'new WebSocket("wss://x")', 'localStorage.getItem("a")', 'document.cookie', 'self.location'];
  blocked.forEach((expression) => {
    test(`${expression} 抛错而不是偷偷生效`, () => {
      const result = run(`pm.test("blocked", () => ${expression});`);
      expect(result.tests[0].status).toBe('fail');
      expect(result.tests[0].error).toMatch(/is not (defined|a function|a constructor)|undefined/);
    });
  });
});

describe('shrinkResponseBody', () => {
  test('超长正文截断并标记', () => {
    const big = { ...response, body: 'x'.repeat(600_000) };
    const shrunk = shrinkResponseBody(big);
    expect(shrunk.body).toHaveLength(512_000);
    expect(shrunk.bodyTruncated).toBe(true);
    expect(shrinkResponseBody(response)).toBe(response);
  });
});

describe('errorLine', () => {
  test('换成编辑器里的行号，并且取最里层那一帧', () => {
    // 栈里的行号 = 脚本行号 + 3（new Function 垫两行 + 我们的 "use strict" 一行）
    expect(errorLine('TypeError: x\n    at eval (eval at compile, <anonymous>:7:15)\n    at run (<anonymous>:99:2)')).toBe(4);
    expect(errorLine('TypeError: x\n    at <anonymous>:3:1')).toBeUndefined();
    expect(errorLine('TypeError: x')).toBeUndefined();
    expect(errorLine(undefined)).toBeUndefined();
  });
});
