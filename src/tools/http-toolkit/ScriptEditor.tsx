import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import {
  DEFAULT_SCRIPT_DEADLINE_MS,
  MAX_SCRIPT_CHARS,
  MAX_SCRIPT_DEADLINE_MS,
  MAX_SCRIPT_LOGS,
  MAX_SCRIPT_SENDS,
  MAX_SCRIPT_SEND_TIMEOUT_MS,
  MIN_SCRIPT_DEADLINE_MS,
} from '@/lib/apiworkbench/scriptEngine';
import type { WbRequest } from '@/lib/apiworkbench/types';

type PhaseTab = 'prerequest' | 'test';

/** 选择器里给几个常用值，其余靠 clamp；引擎接受的区间本身就是 1–30 秒。 */
const DEADLINES = [
  { ms: MIN_SCRIPT_DEADLINE_MS, zh: '1 秒', en: '1s' },
  { ms: 3_000, zh: '3 秒', en: '3s' },
  { ms: DEFAULT_SCRIPT_DEADLINE_MS, zh: '5 秒', en: '5s' },
  { ms: 10_000, zh: '10 秒', en: '10s' },
  { ms: 20_000, zh: '20 秒', en: '20s' },
  { ms: MAX_SCRIPT_DEADLINE_MS, zh: '30 秒', en: '30s' },
];

const SNIPPET: Record<PhaseTab, { zh: string; en: string }> = {
  prerequest: {
    zh: 'pm.variables.set("ts", String(Date.now()));\npm.request.url += "?ts=" + pm.variables.get("ts");',
    en: 'pm.variables.set("ts", String(Date.now()));\npm.request.url += "?ts=" + pm.variables.get("ts");',
  },
  test: {
    zh: 'pm.test("状态是 200", () => pm.response.to.have.status(200));\npm.test("有 id", () => pm.expect(pm.response.json().id).to.exist);',
    en: 'pm.test("status is 200", () => pm.response.to.have.status(200));\npm.test("has id", () => pm.expect(pm.response.json().id).to.exist);',
  },
};

interface Props {
  request: WbRequest;
  controlledPhase?: PhaseTab;
  /** 沙箱看门狗时长，一次会话内共用，不进存档。 */
  deadlineMs: number;
  onDeadlineChange: (ms: number) => void;
  onChange: (patch: Partial<WbRequest>) => void;
}

export function ScriptEditor({ request, deadlineMs, onDeadlineChange, onChange, controlledPhase }: Props) {
  const { locale, t } = useI18n();
  const [localPhase, setPhase] = useState<PhaseTab>('test');
  const phase = controlledPhase ?? localPhase;
  const script = phase === 'prerequest' ? (request.preScript ?? '') : (request.testScript ?? '');
  const over = script.length > MAX_SCRIPT_CHARS;
  const setScript = (value: string) => onChange(phase === 'prerequest' ? { preScript: value } : { testScript: value });

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!controlledPhase ? <Segmented<PhaseTab>
          size="sm"
          value={phase}
          onChange={setPhase}
          ariaLabel={t({ zh: '脚本阶段', en: 'Script phase' })}
          options={[
            { value: 'prerequest', label: t({ zh: '预请求脚本', en: 'Pre-request' }) },
            { value: 'test', label: t({ zh: '测试脚本', en: 'Tests' }) },
          ]}
        /> : null}
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          {t({ zh: '失控上限', en: 'Runaway limit' })}
          <Select
            size="sm"
            value={String(deadlineMs)}
            onChange={(e) => onDeadlineChange(Number(e.target.value))}
            aria-label={t({ zh: '脚本失控上限', en: 'Script deadline' })}
            wrapperClassName="w-24"
          >
            {DEADLINES.map((item) => (
              <option key={item.ms} value={item.ms}>{t({ zh: item.zh, en: item.en })}</option>
            ))}
          </Select>
        </label>
        <Badge tone={over ? 'danger' : 'neutral'}>{t({ zh: `${script.length} / ${MAX_SCRIPT_CHARS} 字符`, en: `${script.length} / ${MAX_SCRIPT_CHARS} chars` })}</Badge>
        {script ? (
          <button
            type="button"
            className="text-xs text-ink-3 underline decoration-dotted underline-offset-4 hover:text-ink"
            onClick={() => setScript('')}
          >
            {t({ zh: '清空', en: 'Clear' })}
          </button>
        ) : (
          <button
            type="button"
            className="text-xs text-ink-3 underline decoration-dotted underline-offset-4 hover:text-ink"
            onClick={() => setScript(SNIPPET[phase][locale])}
          >
            {t({ zh: '插入示例', en: 'Insert example' })}
          </button>
        )}
      </div>

      <Textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        rows={10}
        mono
        spellCheck={false}
        className="text-xs"
        placeholder={t(SNIPPET[phase])}
        aria-label={t(phase === 'prerequest' ? { zh: '预请求脚本', en: 'Pre-request script' } : { zh: '测试脚本', en: 'Test script' })}
      />

      {over ? (
        <ToolAlert
          tone="error"
          title={t({ zh: `脚本超过 ${MAX_SCRIPT_CHARS} 字符，不会被执行`, en: `This script is over ${MAX_SCRIPT_CHARS} characters and will not run` })}
          hint={t({ zh: '存档时也会截到这个长度。把公共逻辑抽成短一点的断言，或拆到多个请求里。', en: 'Saving truncates to the same length. Shorten the assertions or split the work across requests.' })}
        />
      ) : null}

      <ToolAlert
        tone="info"
        title={t({
          zh: '脚本能用什么、不能用什么',
          en: 'What a script can and cannot do',
        })}
        hint={t({
          zh: '沙箱是独立线程，没有 DOM，也没有 fetch、WebSocket、localStorage；`pm.*` 之外的浏览器对象一概拿不到。失控脚本的兜底是终止它的沙箱线程，页面其余部分不受影响——但线程吃满内存时仍可能被浏览器直接杀掉。',
          en: 'The sandbox is a separate thread with no DOM and no fetch, WebSocket, or localStorage; nothing beyond `pm.*` is reachable. A runaway script is stopped by terminating that thread, which leaves the rest of the page alone — but if the thread exhausts its memory the browser may kill it outright.',
        })}
      />
      <p className="text-[11px] leading-4 text-ink-3">
        {t({
          zh: '能用的面：pm.request（url / method / headers / params / body，headers 与 params 用 all、get、has、add、upsert、remove、disable）、pm.response（code、statusText、responseTime、headers、body、json()）、pm.variables.get/set、pm.environment.get/unset/set、pm.expect、pm.test 与 pm.test.skip、pm.sendRequest、console.log。',
          en: 'The surface you get: pm.request (url / method / headers / params / body; headers and params offer all, get, has, add, upsert, remove, disable), pm.response (code, statusText, responseTime, headers, body, json()), pm.variables.get/set, pm.environment.get/unset/set, pm.expect, pm.test and pm.test.skip, pm.sendRequest, console.log.',
        })}
      </p>
      <p className="text-[11px] leading-4 text-ink-3">
        {t({
          zh: `pm.sendRequest 走界面上当前选的取数通道（直连就受 CORS 约束），一次运行最多 ${MAX_SCRIPT_SENDS} 条、每条最多等 ${Math.round(MAX_SCRIPT_SEND_TIMEOUT_MS / 1000)} 秒，且只在这条脚本的运行里有效；回调形状是 (error, response)。console.log 到 ${MAX_SCRIPT_LOGS} 行后只保留最后 ${MAX_SCRIPT_LOGS} 行。`,
          en: `pm.sendRequest uses the fetch mode selected in the panel (direct stays subject to CORS), up to ${MAX_SCRIPT_SENDS} per run, each waiting at most ${Math.round(MAX_SCRIPT_SEND_TIMEOUT_MS / 1000)}s, and only for this run; the callback is (error, response). console.log keeps only the last ${MAX_SCRIPT_LOGS} lines once it reaches that many.`,
        })}
      </p>
      <p className="text-[11px] leading-4 text-ink-3">
        {t({
          zh: '预请求脚本可以改 URL、方法、请求头、参数与正文，改完才做变量插值；测试脚本读的是发出去的那份请求和拿到的响应。`pm.environment.set` 会写进当前环境并存到本机（明文），响应体过长时脚本只看到开头一段。',
          en: 'The pre-request script may change the URL, method, headers, params and body — interpolation happens after. The test script reads the request that actually went out and the response that came back. `pm.environment.set` writes into the active environment and is stored on this machine in plaintext; an over-long body is handed to the script truncated.',
        })}
      </p>
    </div>
  );
}
