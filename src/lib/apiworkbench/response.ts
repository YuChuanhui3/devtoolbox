/**
 * 响应体的「该用什么视图展示」判定与配套的显示限额。
 *
 * 全是纯函数：给一组响应头和正文长相就能定出视图类型，不需要真的发请求，
 * 所以图片、PDF、HTML 的分支都能在 node 里测。
 */

/** 大小写不敏感地取响应头。 */
export function headerValue(headers: [string, string][], name: string): string | undefined {
  const wanted = name.toLowerCase();
  return headers.find(([key]) => key.toLowerCase() === wanted)?.[1];
}

/** 只有 text/event-stream 才值得按帧解析；其它类型仍按纯文本流展示。 */
export function isEventStream(headers: [string, string][]): boolean {
  return /text\/event-stream/i.test(headerValue(headers, 'content-type') ?? '');
}

/** content-type 去掉 `; charset=...` 之类的参数。 */
export function baseMime(headers: [string, string][]): string {
  return (headerValue(headers, 'content-type') ?? '').split(';')[0].trim().toLowerCase();
}

export type ResponseViewKind = 'empty' | 'json' | 'html' | 'xml' | 'text' | 'image' | 'pdf' | 'binary';

/**
 * 定视图类型。顺序是刻意的：先看 content-type（服务端说了算），
 * 声明缺失或含糊时才嗅探正文——公共代理常把 content-type 抹成 text/plain，
 * 而 JSON 接口返回的仍然该是 JSON 树。
 */
export function responseViewKind(headers: [string, string][], text: string): ResponseViewKind {
  const mime = baseMime(headers);
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html';
  if (mime === 'application/xml' || mime === 'text/xml') return 'xml';
  if (mime === 'application/json' || mime.endsWith('+json') || mime === 'text/json') return 'json';
  // octet-stream 与压缩包/音视频这类，字节没留在手里时就只剩「别当文本渲染」。
  if (/^(application\/(octet-stream|zip|gzip|x-7z-compressed|vnd\.archive)|audio\/|video\/)/.test(mime)) return 'binary';
  return sniffBody(text);
}

/** 正文嗅探：只在 content-type 不可信时兜底。 */
function sniffBody(text: string): ResponseViewKind {
  if (!text.trim()) return 'empty';
  // 文本视图装不下控制字符：那是二进制的信号，不是「显示成乱码」的理由。
  if (/[\u0000-\u0008]/.test(text)) return 'binary';
  const trimmed = text.trim();
  if (trimmed[0] === '{' || trimmed[0] === '[') {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed !== null && typeof parsed === 'object') return 'json';
    } catch {
      /* 看着像 JSON 但解不出来，按原文显示 */
    }
  }
  if (/^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) return 'html';
  if (/^<\?xml/i.test(trimmed)) return 'xml';
  return 'text';
}

/**
 * 一次渲染多少字符。原先是硬切 20000 后写「已截断」，改成按块显示 +「继续加载」，
 * 这样「复制/下载得到完整内容」的承诺仍然成立，界面也不会一次性塞进几 MB DOM。
 */
export const RENDER_CHUNK_CHARS = 20_000;

export interface RenderSlice {
  shown: string;
  /** 还剩多少字符没显示。 */
  remaining: number;
  /** 当前显示到第几块（从 1 开始）。 */
  blocks: number;
  totalBlocks: number;
}

export function renderSlice(text: string, blocks = 1): RenderSlice {
  const taken = Math.max(1, Math.floor(blocks));
  const totalBlocks = Math.max(1, Math.ceil(text.length / RENDER_CHUNK_CHARS));
  const shown = text.slice(0, RENDER_CHUNK_CHARS * Math.min(taken, totalBlocks));
  return { shown, remaining: text.length - shown.length, blocks: Math.min(taken, totalBlocks), totalBlocks };
}

/**
 * 差异对比的尺寸闸门。两侧都小于这个数才比：行级 diff 是平方量级的，
 * 拿几 MB 的响应去比会把页面卡死，而「太大不比较」是可接受的诚实回答。
 */
export const MAX_DIFF_CHARS = 200_000;

export function canDiff(left: string, right: string): boolean {
  return left.length <= MAX_DIFF_CHARS && right.length <= MAX_DIFF_CHARS;
}

/** 下载文件名：优先 content-disposition 的 filename，其次 URL 末段，最后兜底。 */
export function suggestFilename(headers: [string, string][], url: string): string {
  const disposition = headerValue(headers, 'content-disposition') ?? '';
  const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const raw = named?.[1]?.trim();
  if (raw) {
    // filename*= 那一段是百分号编码的；解不开就说明服务端写得本来就不规范，原样给回去。
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  const path = url.split('?')[0].split('#')[0].replace(/\/+$/, '');
  const last = path.split('/').pop()?.trim();
  return last && last.length <= 60 ? last : 'response';
}
