import { describe, expect, test } from 'vitest';
import { badgeHtml, badgeMarkdown, buildBadgeSvg, buildBadgeUrl, resolveBadgeColor } from './badge';

const base = { label: 'build', message: 'passing', color: 'brightgreen', style: 'flat' as const };

describe('badge', () => {
  test('resolveBadgeColor names and hex', () => {
    expect(resolveBadgeColor('brightgreen')).toBe('#4c1');
    expect(resolveBadgeColor('4CAF50')).toBe('#4caf50');
    expect(resolveBadgeColor('#4c1')).toBe('#4c1');
    expect(resolveBadgeColor('')).toBe('#4c1');
    expect(() => resolveBadgeColor('magenta-ish')).toThrow('未知的颜色');
  });

  test('buildBadgeSvg contains label and message', () => {
    const svg = buildBadgeSvg(base);
    expect(svg).toContain('<svg');
    expect(svg).toContain('build');
    expect(svg).toContain('passing');
    expect(svg).toContain('#4c1');
  });

  test('for-the-badge uppercases', () => {
    const svg = buildBadgeSvg({ ...base, style: 'for-the-badge' });
    expect(svg).toContain('BUILD');
  });

  test('buildBadgeUrl escaping and params', () => {
    expect(buildBadgeUrl({ ...base, color: 'yellowgreen' })).toBe(
      'https://img.shields.io/badge/build-passing-yellowgreen',
    );
    const url = buildBadgeUrl({ label: 'a-b', message: 'c_d', color: 'blue', style: 'flat-square', link: 'https://x.cn' });
    expect(url).toContain('a--b-c__d-blue');
    expect(url).toContain('style=flat-square');
    expect(url).toContain('link=https%3A%2F%2Fx.cn');
  });

  test('markdown and html wrappers', () => {
    expect(badgeMarkdown(base)).toBe('![build: passing](https://img.shields.io/badge/build-passing-brightgreen)');
    expect(badgeHtml({ ...base, link: 'https://x.cn' })).toContain('<a href="https://x.cn"><img src=');
  });
});
