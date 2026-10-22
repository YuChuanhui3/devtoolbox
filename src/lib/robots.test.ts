import { describe, expect, test } from 'vitest';
import { parseRobots, renderRobots, type RobotsConfig } from './robots';

const config: RobotsConfig = {
  groups: [
    {
      userAgents: ['*', 'Baiduspider'],
      rules: [
        { type: 'disallow', path: '/admin' },
        { type: 'allow', path: '/admin/public' },
      ],
      crawlDelay: 2,
    },
    { userAgents: ['Googlebot'], rules: [{ type: 'disallow', path: '' }], crawlDelay: null },
  ],
  sitemaps: ['https://example.com/sitemap.xml'],
};

describe('robots', () => {
  test('renderRobots output', () => {
    const text = renderRobots(config);
    expect(text).toBe(
      [
        'User-agent: *',
        'User-agent: Baiduspider',
        'Crawl-delay: 2',
        'Disallow: /admin',
        'Allow: /admin/public',
        '',
        'User-agent: Googlebot',
        'Disallow:',
        '',
        'Sitemap: https://example.com/sitemap.xml',
        '',
      ].join('\n'),
    );
  });

  test('render skips empty groups', () => {
    expect(renderRobots({ groups: [{ userAgents: ['  '], rules: [], crawlDelay: null }], sitemaps: [] })).toBe('\n');
  });

  test('parse round trip', () => {
    const parsed = parseRobots(renderRobots(config));
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0].userAgents).toEqual(['*', 'Baiduspider']);
    expect(parsed.groups[0].crawlDelay).toBe(2);
    expect(parsed.groups[1].rules).toEqual([{ type: 'disallow', path: '' }]);
    expect(parsed.sitemaps).toEqual(['https://example.com/sitemap.xml']);
  });

  test('parse ignores comments and unknown keys', () => {
    const parsed = parseRobots('# comment\nUser-agent: *\nDisallow: /x # trailing\nHost: bad');
    expect(parsed.groups[0].rules[0].path).toBe('/x');
  });
});
