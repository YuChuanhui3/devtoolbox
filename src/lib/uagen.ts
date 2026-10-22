import { ToolError } from './errors';

export type UaBrowser = 'Chrome' | 'Edge' | 'Firefox' | 'Safari';
export type UaOs = 'Windows 11' | 'Windows 10' | 'macOS' | 'Ubuntu' | 'Android' | 'iOS';

export const UA_BROWSERS: UaBrowser[] = ['Chrome', 'Edge', 'Firefox', 'Safari'];
export const UA_OS_LIST: UaOs[] = ['Windows 11', 'Windows 10', 'macOS', 'Ubuntu', 'Android', 'iOS'];

const DESKTOP_PLATFORMS: Record<Exclude<UaOs, 'Android' | 'iOS'>, string> = {
  'Windows 11': 'Windows NT 10.0; Win64; x64',
  'Windows 10': 'Windows NT 10.0; Win64; x64',
  macOS: 'Macintosh; Intel Mac OS X 10_15_7',
  Ubuntu: 'X11; Linux x86_64',
};

const ANDROID_DEVICES = ['Pixel 8', 'Pixel 9', 'SM-S928B', 'SM-G991B', 'REDMI K80', 'PHZ110'];
const ANDROID_APIS = ['13', '14', '15'];
const IOS_VERSIONS = ['17_0', '17_5', '18_0', '18_3'];

export interface RandomUaOptions {
  browser?: UaBrowser;
  os?: UaOs;
  random?: () => number;
}

function pick<T>(list: T[], random: () => number): T {
  return list[Math.floor(random() * list.length) % list.length];
}

function chromeMajor(random: () => number): number {
  return 120 + Math.floor(random() * 22); // 120 ~ 141
}

function firefoxVersion(random: () => number): number {
  return 125 + Math.floor(random() * 18); // 125 ~ 142
}

function safariVersion(random: () => number): string {
  return `1${pick([6, 7, 8], random)}.${Math.floor(random() * 4)}`;
}

function mobileChrome(random: () => number): string {
  const api = pick(ANDROID_APIS, random);
  const device = pick(ANDROID_DEVICES, random);
  return `Mozilla/5.0 (Linux; Android ${api}; ${device}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor(random)}.0.0.0 Mobile Safari/537.36`;
}

function mobileSafari(random: () => number): string {
  const v = pick(IOS_VERSIONS, random);
  return `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v.replace(/_/g, '.')} Mobile/15E148 Safari/604.1`;
}

export function randomUserAgent({ browser, os, random = Math.random }: RandomUaOptions = {}): string {
  const browsers: UaBrowser[] = browser ? [browser] : UA_BROWSERS;
  const oses: UaOs[] = os ? [os] : UA_OS_LIST;
  const chosen = pick(browsers, random);
  const chosenOs = pick(oses, random);

  const wantsMobile = chosenOs === 'Android' || chosenOs === 'iOS';
  if (wantsMobile && chosen !== 'Chrome' && chosen !== 'Safari') {
    // Firefox 有 Android 版，iOS 上其余浏览器均为 WebKit 外壳
    if (chosen === 'Firefox' && chosenOs === 'Android') {
      return `Mozilla/5.0 (Android ${pick(ANDROID_APIS, random)}; Mobile; rv:${firefoxVersion(random)}.0) Gecko/${firefoxVersion(random)}.0 Firefox/${firefoxVersion(random)}.0`;
    }
    if (chosen === 'Edge' && chosenOs === 'Android') {
      return `${mobileChrome(random)} EdgA/${chromeMajor(random)}.0.0.0`;
    }
    return mobileSafari(random);
  }

  if (chosenOs === 'Android') return mobileChrome(random);
  if (chosenOs === 'iOS') return mobileSafari(random);

  const platform = DESKTOP_PLATFORMS[chosenOs as Exclude<UaOs, 'Android' | 'iOS'>];
  switch (chosen) {
    case 'Chrome':
      return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor(random)}.0.0.0 Safari/537.36`;
    case 'Edge': {
      const major = chromeMajor(random);
      return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.${Math.floor(random() * 2000)}.${Math.floor(random() * 60)}`;
    }
    case 'Firefox': {
      const version = firefoxVersion(random);
      return `Mozilla/5.0 (${platform}; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
    }
    case 'Safari':
      return `Mozilla/5.0 (${platform}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${safariVersion(random)} Safari/605.1.15`;
    default:
      throw new ToolError({ zh: `不支持的浏览器：${chosen}`, en: `Unsupported browser: ${chosen}` });
  }
}
