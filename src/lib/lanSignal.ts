import { ToolError } from './errors';

export const LAN_SIGNAL_PATH = '/__lan-signal';
export const LAN_INFO_PATH = '/api/lan-info';

/** FastSend 式 6 位数字取件码：接收端手输即可接入同一个房间。 */
export function makePickupCode(): string {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(100000 + (value[0] % 900000));
}

export function isPickupCode(text: string): boolean {
  return /^\d{6}$/.test(text.trim());
}

/** 房间口令字母表去掉 0/O/1/I 等易混字符；6 位码 + 4 位口令，公开 relay 上盲猜才可行。 */
const PASS_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeRoomPass(): string {
  const value = new Uint8Array(4);
  crypto.getRandomValues(value);
  return Array.from(value, (byte) => PASS_ALPHABET[byte % PASS_ALPHABET.length]).join('');
}

export function normalizeRoomPass(text: string): string {
  return text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

export function isRoomPass(text: string): boolean {
  return /^[A-Z0-9]{4}$/.test(normalizeRoomPass(text));
}

export const SIGNAL_STORAGE_KEY = 'filedrop-signal-base';

/** 空的信令地址表示跟随页面 origin（start:lan 的局域网用法）。 */
export function getSignalBase(): string {
  try {
    return window.localStorage.getItem(SIGNAL_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setSignalBase(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    window.localStorage.removeItem(SIGNAL_STORAGE_KEY);
    return;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ToolError(
      { zh: '信令地址格式不正确', en: 'The signaling address is not a valid URL' },
      { zh: '请填写完整地址，例如 https://relay.example.workers.dev。', en: 'Enter a full URL such as https://relay.example.workers.dev.' },
    );
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
    throw new ToolError({ zh: '信令地址只支持 http/https/ws/wss', en: 'The signaling address must be http/https/ws/wss' });
  }
  if (window.location.protocol === 'https:' && url.protocol !== 'https:' && url.protocol !== 'wss:') {
    throw new ToolError(
      { zh: '当前页面是 HTTPS，信令必须走 wss', en: 'This page is HTTPS, so signaling must be wss' },
      { zh: 'ws:// 会被浏览器按混合内容拦截；请给自建服务配 TLS，或直接部署 Cloudflare relay（自带 wss）。', en: 'ws:// is blocked as mixed content. Add TLS to your self-hosted server, or deploy the Cloudflare relay, which is wss by default.' },
    );
  }
  window.localStorage.setItem(SIGNAL_STORAGE_KEY, url.origin);
}

export interface SignalTargets {
  /** 二维码深链指向的应用地址（对方在浏览器里打开的页面）。 */
  pageBase: string;
  /** WebSocket 信令地址；中继模式下与 pageBase 不同。 */
  signalBase: string;
}

export async function resolveSignalTargets(href: string = window.location.href): Promise<SignalTargets> {
  const configured = getSignalBase();
  if (configured) return { pageBase: new URL(href).origin, signalBase: configured };
  const lan = await resolveLanBase(href);
  return { pageBase: lan, signalBase: lan };
}

export function buildJoinUrl(base: string, room: string, pass?: string, signalBase?: string): string {
  const url = new URL('/tools/transfer-toolkit', base);
  url.searchParams.set('pair', room);
  if (pass) url.searchParams.set('pp', pass);
  if (signalBase && signalBase !== base) url.searchParams.set('sig', signalBase);
  return url.toString();
}

export function lanSocketUrl(base: string): string {
  const url = new URL(LAN_SIGNAL_PATH, base);
  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  return url.toString();
}

function localHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

/** localhost 的链接手机打不开；内网服务会返回网卡地址，用它替换二维码里的主机名。 */
export async function resolveLanBase(href: string = window.location.href): Promise<string> {
  const current = new URL(href);
  if (!localHostname(current.hostname)) return current.origin;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(LAN_INFO_PATH, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('LAN info unavailable');
    const info = (await response.json()) as { addresses?: unknown };
    const address = Array.isArray(info.addresses)
      ? info.addresses.find((value): value is string => typeof value === 'string' && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value))
      : undefined;
    if (!address) throw new Error('No LAN address');
    current.hostname = address;
    return current.origin;
  } catch {
    throw new ToolError(
      { zh: '请先用电脑的局域网 IP 打开本页', en: 'Open this page using the computer\'s LAN IP first' },
      { zh: '手机无法通过 localhost 访问电脑。', en: 'The phone cannot reach the computer through localhost.' },
    );
  } finally {
    window.clearTimeout(timer);
  }
}

export function openLanSocket(base: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(lanSocketUrl(base));
    const timer = window.setTimeout(() => {
      socket.close();
      reject(new Error('LAN signaling timeout'));
    }, 2500);
    socket.addEventListener('open', () => {
      window.clearTimeout(timer);
      resolve(socket);
    }, { once: true });
    socket.addEventListener('error', () => {
      window.clearTimeout(timer);
      reject(new Error('LAN signaling unavailable'));
    }, { once: true });
  });
}
