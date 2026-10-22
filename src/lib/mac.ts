export type MacSeparator = ':' | '-' | '.' | 'none';

export interface MacOptions {
  count: number;
  separator: MacSeparator;
  uppercase: boolean;
  /** 置位 locally administered 位（第二低位），生成的地址不占用真实厂商 OUI。 */
  local: boolean;
  /** 置组播位（最低位）。 */
  multicast: boolean;
  /** 指定 OUI 前缀（3 字节），如 "AC:DE:48"；非法或为空则全随机。 */
  oui: string | null;
  random?: () => number;
}

const PAIR_RE = /^([\da-f]{2})([:.-])([\da-f]{2})\2([\da-f]{2})\2([\da-f]{2})\2([\da-f]{2})\2([\da-f]{2})$/i;
const TRIPLET_RE = /^[\da-f]{4}\.[\da-f]{4}\.[\da-f]{4}$/i;
const PLAIN_RE = /^[\da-f]{12}$/i;

export function isValidMac(value: string): boolean {
  const trimmed = value.trim();
  return PAIR_RE.test(trimmed) || TRIPLET_RE.test(trimmed) || PLAIN_RE.test(trimmed);
}

export function parseOuiPrefix(value: string | null): number[] | null {
  if (!value || !value.trim()) return null;
  const cleaned = value.trim().replace(/[:\-. ]+/g, '');
  if (!/^([0-9a-fA-F]{2}){3}$/.test(cleaned)) return null;
  const bytes = [0, 1, 2].map((i) => parseInt(cleaned.slice(i * 2, i * 2 + 2), 16));
  if (bytes.some((b) => b < 0 || b > 255)) return null;
  return bytes;
}

function formatBytes(bytes: number[], separator: MacSeparator, uppercase: boolean): string {
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0'));
  let result: string;
  if (separator === 'none') {
    result = hex.join('');
  } else if (separator === '.') {
    const flat = hex.join('');
    result = [flat.slice(0, 4), flat.slice(4, 8), flat.slice(8, 12)].join('.');
  } else {
    result = hex.join(separator);
  }
  return uppercase ? result.toUpperCase() : result.toLowerCase();
}

export function randomMac({
  separator = ':',
  uppercase = true,
  local = false,
  multicast = false,
  oui = null,
  random = Math.random,
}: Partial<MacOptions> = {}): string {
  const prefix = parseOuiPrefix(oui);
  const bytes: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    bytes.push(prefix && i < 3 ? prefix[i] : Math.floor(random() * 256));
  }
  bytes[0] = multicast ? bytes[0] | 0x01 : bytes[0] & 0xfe;
  bytes[0] = local ? bytes[0] | 0x02 : bytes[0] & 0xfd;
  return formatBytes(bytes, separator, uppercase);
}

export function generateMacs(options: Partial<MacOptions> = {}): string[] {
  const count = Math.min(Math.max(Math.floor(options.count ?? 1), 1), 500);
  return Array.from({ length: count }, () => randomMac(options));
}
