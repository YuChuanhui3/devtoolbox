import { ToolError } from '@/lib/errors';
import { fetchJson } from '@/lib/net';

export interface IpWhoResult {
  success: boolean;
  ip?: string;
  type?: string;
  continent?: string;
  country?: string;
  country_code?: string;
  region?: string;
  region_code?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  is_eu?: boolean;
  postal?: string;
  calling_code?: string;
  call_id?: string;
  quarters?: string;
  country_flag?: string;
  country_capital?: string;
  country_tld?: string;
  continents?: Record<string, string>;
  flag?: { img: string; png: string };
  connection?: { asn?: number; org?: string; isp?: string; domain?: string };
  timezone?: { id?: string; utc?: string; gmt?: string; current_time?: string };
  message?: string;
  code?: string;
}

export async function queryIpWho(ip: string): Promise<IpWhoResult> {
  const trimmed = ip.trim();
  const url = trimmed && trimmed !== 'me' ? `https://ipwho.is/${encodeURIComponent(trimmed)}` : 'https://ipwho.is/';
  const data = await fetchJson<IpWhoResult>(url, undefined, 10000);
  if (data.success === false) {
    throw new ToolError(
      {
        zh: `查询失败：${data.message || data.code || '未知原因'}`,
        en: `Lookup failed: ${data.message || data.code || 'unknown reason'}`,
      },
      {
        zh: '请确认 IP/域名格式正确；内网地址无法定位。',
        en: 'Check the IP/domain format; private network addresses cannot be located.',
      },
    );
  }
  return data;
}
