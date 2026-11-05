/**
 * EventSource 风格的分帧解析（纯函数，不碰网络）。
 *
 * 为什么写成增量式：服务端推流时 chunk 的边界落在哪儿完全不由我们决定，
 * 一帧可能被切成两半、`\r\n` 可能被切开、注释行和 `event:` 也可能跨 chunk。
 * 所以状态里同时留着「半行」和「攒到一半的帧」，喂进来多少就能立刻吐出多少完整帧。
 *
 * 语义按 WHATWG HTML 的 event stream 来源：
 * - 行分隔符 `\r\n` / `\r` / `\n` 等价，空行为一帧的边界；
 * - 冒号开头的行是注释，整行丢弃（心跳就是这么发的）；
 * - 字段名只认第一个冒号之前的部分，值去掉**一个**前导空格；没有冒号则值为空串；
 * - 多个 `data:` 用 `\n` 连接；只出现过 `event:` 而没有 `data:` 的帧不派发。
 */

/** 一帧解析出来的内容；`event` 缺省为 `message`。 */
export interface SseEvent {
  event: string;
  data: string;
  /** 帧内 `id:` 的值；省略表示这一帧没带 id（此时 `lastEventId` 不变）。 */
  id?: string;
  /** 流结束时没等到空行边界的最后一帧；仍然给出来，但要标清楚。 */
  incomplete?: boolean;
}

interface SseFrameDraft {
  event?: string;
  lines: string[];
  /** 出现过至少一行 `data:` —— 规范里这就是「派发」的前提。 */
  hasData: boolean;
  id?: string;
  idSeen: boolean;
}

export interface SseState {
  /** 尚未凑成整行的残余文本。 */
  buffer: string;
  frame: SseFrameDraft;
  /** 最后一次成功派发时携带的 id，用于「断线续传」类 UI 提示。 */
  lastEventId?: string;
  retry?: number;
  /** 被丢弃的问题帧数：`id:` 含 NUL、`retry:` 非数字等，UI 需要如实说明而不是静默。 */
  dropped: number;
}

const newFrame = (): SseFrameDraft => ({ lines: [], hasData: false, idSeen: false });

export function createSseState(): SseState {
  return { buffer: '', frame: newFrame(), dropped: 0 };
}

export interface SseFeedResult {
  state: SseState;
  events: SseEvent[];
}

function dispatch(state: SseState, events: SseEvent[], incomplete = false): void {
  const frame = state.frame;
  state.frame = newFrame();
  if (!frame.hasData) return;
  const data = frame.lines.join('\n');
  const event: SseEvent = { event: frame.event || 'message', data };
  if (incomplete) event.incomplete = true;
  if (frame.idSeen) {
    if (frame.id && !frame.id.includes('\u0000')) {
      state.lastEventId = frame.id;
      event.id = frame.id;
    } else {
      state.dropped += 1;
    }
  }
  events.push(event);
}

function applyField(state: SseState, line: string): void {
  if (line.startsWith(':')) return;
  const colon = line.indexOf(':');
  const name = colon < 0 ? line : line.slice(0, colon);
  let value = colon < 0 ? '' : line.slice(colon + 1);
  if (value.startsWith(' ')) value = value.slice(1);
  if (name === 'event') state.frame.event = value;
  else if (name === 'data') {
    state.frame.hasData = true;
    state.frame.lines.push(value);
  } else if (name === 'id') {
    state.frame.idSeen = true;
    state.frame.id = value;
  } else if (name === 'retry') {
    if (/^\d+$/.test(value)) state.retry = Number(value);
    else state.dropped += 1;
  }
  // 未知字段按规范静默忽略：服务端私有字段不该让解析器报错。
}

/**
 * 喂入一段文本，返回新增的完整帧与新状态。
 * 传入的 state 会被就地更新后原样返回，调用方只需接返回值。
 */
export function feedSse(state: SseState, chunk: string): SseFeedResult {
  const events: SseEvent[] = [];
  let text = state.buffer + chunk;
  let heldCr = '';
  // 末尾的 \r 可能是 \r\n 的前半，留下等下一次喂进来再判定。
  if (text.endsWith('\r')) {
    heldCr = '\r';
    text = text.slice(0, -1);
  }
  const lines = text.split(/\r\n|\r|\n/);
  // 半行在前、待定的 \r 在后，下次才能把 \r\n 重新拼回一个分隔符。
  state.buffer = (lines.pop() ?? '') + heldCr;
  for (const line of lines) {
    if (line === '') dispatch(state, events);
    else applyField(state, line);
  }
  return { state, events };
}

/** 一次性解析完整文本：末尾不会再有字节进来，所以顺手 flush。 */
export function parseSse(text: string): SseEvent[] {
  const fed = feedSse(createSseState(), text);
  return [...fed.events, ...flushSse(fed.state).events];
}

/**
 * 流结束时的收尾。事件边界是空行，所以最后一帧往往没等到自己的空行：
 * 内容已经收全就派发出去并标成 `incomplete`（不给用户凭空少一条），
 * 只有真的攒不出 `data:` 才算丢弃 —— 丢弃必须报告，否则「少一帧」看起来像 bug。
 *
 * 缓冲区里只剩一个 `\r` 时不算残缺：那本来就是空行的分隔符，只是当时无法判断它
 * 是不是 `\r\n` 的前半；现在没有后半了，帧因此是完整的。
 */
export function flushSse(state: SseState): { events: SseEvent[]; discarded: boolean } {
  const events: SseEvent[] = [];
  const tail = state.buffer;
  state.buffer = '';
  const onlySeparator = tail === '\r';
  const line = onlySeparator ? '' : tail.replace(/\r$/, '');
  if (line) applyField(state, line);
  const pending = state.frame.hasData || Boolean(state.frame.event) || Boolean(line);
  if (state.frame.hasData) dispatch(state, events, !onlySeparator);
  else state.frame = newFrame();
  return { events, discarded: pending && events.length === 0 };
}
