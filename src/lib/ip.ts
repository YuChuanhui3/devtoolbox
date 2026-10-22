import { ToolError } from './errors';

export type IpScope = 'any' | 'public' | 'private';

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isValidIpv4(value: string): boolean {
  const match = IPV4_RE.exec(value.trim());
  if (!match) return false;
  return match.slice(1).every((part) => {
    if (part.length > 1 && part.startsWith('0')) return false;
    return Number(part) <= 255;
  });
}

/** 展开 IPv6 为 8 组 4 位十六进制（含 :: 压缩与内嵌 IPv4），非法时返回 null。 */
export function expandIpv6(value: string): string[] | null {
  let ip = value.trim().toLowerCase();
  if (!ip) return null;
  const zone = ip.indexOf('%');
  if (zone >= 0) ip = ip.slice(0, zone);
  if (/[^\da-f:.]/.test(ip)) return null;

  const embeddedV4 = /(\d{1,3}\.){3}\d{1,3}$/.exec(ip)?.[0];
  if (embeddedV4) {
    if (!isValidIpv4(embeddedV4)) return null;
    const parts = embeddedV4.split('.').map(Number);
    const high = ((parts[0] << 8) | parts[1]).toString(16);
    const low = ((parts[2] << 8) | parts[3]).toString(16);
    ip = ip.slice(0, ip.length - embeddedV4.length) + `${high}:${low}`;
  }

  if (ip.includes(',')) return null;
  const doubleCount = ip.split('::').length - 1;
  if (doubleCount > 1) return null;

  let groups: string[];
  if (doubleCount === 1) {
    const [head, tail] = ip.split('::');
    const headGroups = head ? head.split(':') : [];
    const tailGroups = tail ? tail.split(':') : [];
    if (headGroups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
    if (tailGroups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
    const missing = 8 - headGroups.length - tailGroups.length;
    if (missing < 1) return null;
    groups = [...headGroups, ...Array(missing).fill('0'), ...tailGroups];
  } else {
    groups = ip.split(':');
  }

  if (groups.length !== 8) return null;
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, '0'));
}

export function isValidIpv6(value: string): boolean {
  return expandIpv6(value) !== null;
}

export function isValidIp(value: string): boolean {
  return isValidIpv4(value) || isValidIpv6(value);
}

export function ipFamily(value: string): 4 | 6 | null {
  if (isValidIpv4(value)) return 4;
  if (isValidIpv6(value)) return 6;
  return null;
}

export function ipv4ToNumber(ip: string): number {
  const match = IPV4_RE.exec(ip.trim());
  if (!match || !isValidIpv4(ip))
    throw new ToolError({ zh: `不是合法的 IPv4 地址：${ip}`, en: `Not a valid IPv4 address: ${ip}` });
  const octets = match.slice(1).map(Number);
  return ((octets[0] * 2 ** 24) + (octets[1] * 2 ** 16) + (octets[2] * 2 ** 8) + octets[3]) >>> 0;
}

export function numberToIpv4(num: number): string {
  if (!Number.isInteger(num) || num < 0 || num > 0xffffffff) {
    throw new ToolError({
      zh: '数字超出 IPv4 范围（0 ~ 4294967295）',
      en: 'Number out of the IPv4 range (0 ~ 4294967295)',
    });
  }
  return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join('.');
}

export function ipv6ToBigInt(ip: string): bigint {
  const groups = expandIpv6(ip);
  if (!groups) throw new ToolError({ zh: `不是合法的 IPv6 地址：${ip}`, en: `Not a valid IPv6 address: ${ip}` });
  let value = 0n;
  for (const group of groups) value = (value << 16n) | BigInt(parseInt(group, 16));
  return value;
}

export function bigIntToIpv6(value: bigint): string {
  if (value < 0n || value > (1n << 128n) - 1n) {
    throw new ToolError({
      zh: '数字超出 IPv6 范围（0 ~ 2^128-1）',
      en: 'Number out of the IPv6 range (0 ~ 2^128-1)',
    });
  }
  const groups: string[] = [];
  let rest = value;
  for (let i = 0; i < 8; i += 1) {
    groups.unshift((rest & 0xffffn).toString(16).padStart(4, '0'));
    rest >>= 16n;
  }
  return groups.join(':');
}

export function ipToNumberString(ip: string): { decimal: string; hex: string; family: 4 | 6 } {
  const family = ipFamily(ip);
  if (family === 4) {
    const num = ipv4ToNumber(ip);
    return { decimal: String(num), hex: `0x${num.toString(16).padStart(8, '0')}`, family };
  }
  if (family === 6) {
    const big = ipv6ToBigInt(ip);
    return { decimal: big.toString(10), hex: `0x${big.toString(16)}`, family };
  }
  throw new ToolError({ zh: `不是合法的 IP 地址：${ip}`, en: `Not a valid IP address: ${ip}` });
}

export function numberStringToIp(decimal: string, family: 4 | 6): string {
  const trimmed = decimal.trim();
  if (!/^\d+$/.test(trimmed))
    throw new ToolError({ zh: '请输入非负十进制整数', en: 'Enter a non-negative decimal integer' });
  if (family === 4) return numberToIpv4(Number(trimmed));
  return bigIntToIpv6(BigInt(trimmed));
}

const PRIVATE_V4_PREFIXES = [
  [10, 0, 0, 0, 10, 255, 255, 255],
  [127, 0, 0, 0, 127, 255, 255, 255],
  [100, 64, 0, 0, 100, 127, 255, 255],
  [169, 254, 0, 0, 169, 254, 255, 255],
  [172, 16, 0, 0, 172, 31, 255, 255],
  [192, 0, 0, 0, 192, 0, 0, 255],
  [192, 0, 2, 0, 192, 0, 2, 255],
  [192, 168, 0, 0, 192, 168, 255, 255],
  [198, 18, 0, 0, 198, 19, 255, 255],
  [198, 51, 100, 0, 198, 51, 100, 255],
  [203, 0, 113, 0, 203, 0, 113, 255],
  [224, 0, 0, 0, 255, 255, 255, 255],
];

function inReservedRange(octets: number[]): boolean {
  return PRIVATE_V4_PREFIXES.some(
    (range) => octets.every((value, i) => value >= range[i] && value <= range[i + 4]),
  );
}

export function isPrivateIpv4(ip: string): boolean {
  if (!isValidIpv4(ip)) return false;
  return inReservedRange(ip.split('.').map(Number));
}

function randInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

export interface RandomIpOptions {
  scope?: IpScope;
  random?: () => number;
}

/** 随机生成一个 IPv4。private 取自常见内网段；public 避开保留段。 */
export function randomIpv4({ scope = 'any', random = Math.random }: RandomIpOptions = {}): string {
  if (scope === 'private') {
    const ranges = [
      PRIVATE_V4_PREFIXES[0],
      PRIVATE_V4_PREFIXES[1],
      PRIVATE_V4_PREFIXES[4],
      PRIVATE_V4_PREFIXES[7],
    ];
    const range = ranges[randInt(0, ranges.length - 1, random)];
    return range
      .slice(0, 4)
      .map((low, i) => randInt(low, range[i + 4], random))
      .join('.');
  }
  if (scope === 'public') {
    for (let i = 0; i < 64; i += 1) {
      const octets = [randInt(1, 223, random), randInt(0, 255, random), randInt(0, 255, random), randInt(1, 254, random)];
      if (!inReservedRange(octets)) return octets.join('.');
    }
    return '8.8.8.8';
  }
  return [randInt(0, 255, random), randInt(0, 255, random), randInt(0, 255, random), randInt(0, 255, random)].join('.');
}

export function randomIpv6({ random = Math.random }: { random?: () => number } = {}): string {
  return Array.from({ length: 8 }, () => randInt(0, 0xffff, random).toString(16).padStart(4, '0')).join(':');
}
