export interface CookieItem {
  name: string;
  value: string;
}

export function decodeCookieValue(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** 解析 Cookie 头字符串：支持 `Cookie: k=v; k2=v2`、分号分隔或空格分隔的 name=value 列表。 */
export function parseCookieString(input: string): CookieItem[] {
  const text = input.trim();
  if (!text) return [];
  const normalized = text.replace(/^Cookie:\s*/i, '');
  const parts = normalized.includes(';') ? normalized.split(';') : normalized.split(/\s+/);
  const items: CookieItem[] = [];
  for (const part of parts) {
    const segment = part.trim();
    if (!segment || !segment.includes('=')) continue;
    const index = segment.indexOf('=');
    const name = segment.slice(0, index).trim();
    if (!name) continue;
    items.push({ name, value: decodeCookieValue(segment.slice(index + 1).trim()) });
  }
  return items;
}
