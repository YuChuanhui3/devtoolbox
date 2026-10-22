import { ToolError } from './errors';
import { ipv4ToNumber, isValidIpv4, numberToIpv4 } from './ip';

const V4_FULL_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function validateOctets(value: string, label: string): number[] {
  const match = V4_FULL_RE.exec(value.trim());
  if (!match)
    throw new ToolError({ zh: `${label}格式不正确：${value}`, en: `${label} has an invalid format: ${value}` });
  const octets = match.slice(1).map(Number);
  if (!octets.every((n) => n >= 0 && n <= 255)) {
    throw new ToolError({
      zh: `${label}的每段取值必须在 0 ~ 255 之间`,
      en: `Each part of ${label} must be between 0 and 255`,
    });
  }
  return octets;
}

export function prefixToMask(prefix: number): string {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new ToolError({ zh: '前缀长度必须在 0 ~ 32 之间', en: 'Prefix length must be between 0 and 32' });
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return numberToIpv4(mask);
}

export function maskToPrefix(mask: string): number {
  const octets = validateOctets(mask, '子网掩码');
  const value = (octets[0] * 2 ** 24 + octets[1] * 2 ** 16 + octets[2] * 2 ** 8 + octets[3]) >>> 0;
  let prefix = 0;
  for (let i = 31; i >= 0; i -= 1) {
    if ((value >>> i) & 1) prefix += 1;
  }
  const expected = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  if (expected !== value)
    throw new ToolError({ zh: `${mask} 不是合法的连续子网掩码`, en: `${mask} is not a valid contiguous subnet mask` });
  return prefix;
}

export interface SubnetInfo {
  cidr: string;
  ip: string;
  prefix: number;
  mask: string;
  wildcard: string;
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  usableHosts: number;
  totalAddresses: number;
  addressClass: 'A' | 'B' | 'C' | 'D' | 'E';
  private: boolean;
}

function toNumber(ip: string): number {
  return ipv4ToNumber(ip);
}

export function calcSubnet(ip: string, prefixOrMask: string | number): SubnetInfo {
  const prefix =
    typeof prefixOrMask === 'number' ? prefixOrMask : maskOrPrefix(prefixOrMask);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new ToolError({ zh: '前缀长度必须在 0 ~ 32 之间', en: 'Prefix length must be between 0 and 32' });
  }
  if (!isValidIpv4(ip))
    throw new ToolError({ zh: `不是合法的 IPv4 地址：${ip}`, en: `Not a valid IPv4 address: ${ip}` });

  const ipNum = toNumber(ip);
  const maskNum = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const wildcardNum = (~maskNum) >>> 0;
  const networkNum = (ipNum & maskNum) >>> 0;
  const broadcastNum = (networkNum | wildcardNum) >>> 0;
  const total = 2 ** (32 - prefix);

  let firstHost: string;
  let lastHost: string;
  let usableHosts: number;
  if (prefix === 32) {
    firstHost = numberToIpv4(ipNum);
    lastHost = numberToIpv4(ipNum);
    usableHosts = 1;
  } else if (prefix === 31) {
    firstHost = numberToIpv4(networkNum);
    lastHost = numberToIpv4(broadcastNum);
    usableHosts = 2;
  } else {
    firstHost = numberToIpv4(networkNum + 1);
    lastHost = numberToIpv4(broadcastNum - 1);
    usableHosts = total - 2;
  }

  const firstOctet = ipNum >>> 24;
  const addressClass = firstOctet < 128 ? 'A' : firstOctet < 192 ? 'B' : firstOctet < 224 ? 'C' : firstOctet < 240 ? 'D' : 'E';

  return {
    cidr: `${numberToIpv4(networkNum)}/${prefix}`,
    ip: numberToIpv4(ipNum),
    prefix,
    mask: numberToIpv4(maskNum),
    wildcard: numberToIpv4(wildcardNum),
    network: numberToIpv4(networkNum),
    broadcast: numberToIpv4(broadcastNum),
    firstHost,
    lastHost,
    usableHosts,
    totalAddresses: total,
    addressClass,
    private: PRIVATE_RANGES.some(([low, high]) => ipNum >= low && ipNum <= high),
  };
}

const PRIVATE_RANGES: [number, number][] = [
  [ipv4ToNumber('10.0.0.0'), ipv4ToNumber('10.255.255.255')],
  [ipv4ToNumber('172.16.0.0'), ipv4ToNumber('172.31.255.255')],
  [ipv4ToNumber('192.168.0.0'), ipv4ToNumber('192.168.255.255')],
];

function maskOrPrefix(value: string): number {
  const trimmed = value.trim().replace(/^\//, '');
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 0 || n > 32)
      throw new ToolError({ zh: '前缀长度必须在 0 ~ 32 之间', en: 'Prefix length must be between 0 and 32' });
    return n;
  }
  return maskToPrefix(trimmed);
}

/** 解析 "192.168.1.100/24"、"192.168.1.100 255.255.255.0" 等形式。 */
export function parseCidrInput(input: string, maskFallback?: string): { ip: string; prefix: number } {
  const trimmed = input.trim();
  if (!trimmed) throw new ToolError({ zh: '请输入 IP 地址', en: 'Enter an IP address' });
  const slash = trimmed.lastIndexOf('/');
  if (slash > 0) {
    const ip = trimmed.slice(0, slash);
    const prefix = maskOrPrefix(trimmed.slice(slash + 1));
    return { ip, prefix };
  }
  if (maskFallback && maskFallback.trim()) {
    return { ip: trimmed, prefix: maskToPrefix(maskFallback.trim()) };
  }
  return { ip: trimmed, prefix: 32 };
}
