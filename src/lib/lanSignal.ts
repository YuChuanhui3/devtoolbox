import { ToolError } from './errors';

export const LAN_SIGNAL_PATH = '/__lan-signal';
export const LAN_INFO_PATH = '/api/lan-info';

export function makePairCode(): string {
  // 每个 Uint32 转 36 进制不足 7 位，循环补齐后才能稳定切出 18 位
  let out = '';
  const values = new Uint32Array(3);
  while (out.length < 18) {
    crypto.getRandomValues(values);
    out += Array.from(values, (value) => value.toString(36)).join('');
  }
  return out.slice(0, 18);
}

export function buildJoinUrl(base: string, room: string): string {
  const url = new URL('/tools/transfer-toolkit', base);
  url.searchParams.set('pair', room);
  return url.toString();
}

export function lanSocketUrl(base: string): string {
  const url = new URL(LAN_SIGNAL_PATH, base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
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
