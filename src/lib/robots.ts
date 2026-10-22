export interface RobotsRule {
  type: 'allow' | 'disallow';
  path: string;
}

export interface RobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
  crawlDelay: number | null;
}

export interface RobotsConfig {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export function renderRobots({ groups, sitemaps }: RobotsConfig): string {
  const lines: string[] = [];
  for (const group of groups) {
    const agents = group.userAgents.map((a) => a.trim()).filter(Boolean);
    if (agents.length === 0) continue;
    for (const agent of agents) lines.push(`User-agent: ${agent}`);
    if (group.crawlDelay && group.crawlDelay > 0) lines.push(`Crawl-delay: ${group.crawlDelay}`);
    const rules = group.rules.filter((r) => r.path.trim() !== '');
    if (rules.length === 0) lines.push('Disallow:');
    for (const rule of rules) {
      lines.push(`${rule.type === 'allow' ? 'Allow' : 'Disallow'}: ${rule.path.trim()}`);
    }
    lines.push('');
  }
  for (const sitemap of sitemaps) {
    if (sitemap.trim()) lines.push(`Sitemap: ${sitemap.trim()}`);
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

export function parseRobots(text: string): RobotsConfig {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const sep = line.indexOf(':');
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (key === 'user-agent') {
      if (!current || current.rules.length > 0 || current.crawlDelay) {
        current = { userAgents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.userAgents.push(value);
    } else if (key === 'disallow' && current) {
      current.rules.push({ type: 'disallow', path: value });
    } else if (key === 'allow' && current) {
      current.rules.push({ type: 'allow', path: value });
    } else if (key === 'crawl-delay' && current) {
      const n = Number(value);
      if (!Number.isNaN(n)) current.crawlDelay = n;
    } else if (key === 'sitemap') {
      sitemaps.push(value);
    }
  }
  return { groups, sitemaps };
}
