import { ToolError } from './errors';

export type BadgeStyle = 'flat' | 'flat-square' | 'plastic' | 'for-the-badge' | 'social';

export const BADGE_STYLES: { id: BadgeStyle; label: string }[] = [
  { id: 'flat', label: 'flat' },
  { id: 'flat-square', label: 'flat-square' },
  { id: 'plastic', label: 'plastic' },
  { id: 'for-the-badge', label: 'for-the-badge' },
  { id: 'social', label: 'social' },
];

export const BADGE_COLORS: Record<string, string> = {
  brightgreen: '#4c1',
  green: '#97ca00',
  yellowgreen: '#a4a61d',
  yellow: '#dfb31d',
  orange: '#fe7d37',
  red: '#e05d44',
  blue: '#007ec6',
  'light-grey': '#ccc',
  'light-gray': '#ccc',
  grey: '#555',
  gray: '#555',
  'blueviolet': '#8a2be2',
  critical: '#e05d44',
  informative: '#0088cc',
  success: '#6c3',
  important: '#ff69b4',
  inactive: '#999',
  pink: '#e066a8',
  'paleturquoise': '#2fbfbf',
};

export interface BadgeOptions {
  label: string;
  message: string;
  /** shields 颜色名或 #hex */
  color: string;
  style: BadgeStyle;
  logo?: string;
  link?: string;
}

export function resolveBadgeColor(color: string): string {
  const trimmed = color.trim().toLowerCase();
  if (!trimmed) return '#4c1';
  if (BADGE_COLORS[trimmed]) return BADGE_COLORS[trimmed];
  const hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(hex)) return hex;
  throw new ToolError({
    zh: `未知的颜色：${color}，可用颜色名或十六进制（如 4c1）`,
    en: `Unknown color: ${color}; use a color name or a hex value (such as 4c1)`,
  });
}

function estimateWidth(text: string, fontSize: number, bold: boolean, letterSpacing = 0): number {
  const per = fontSize * (bold ? 0.62 : 0.58);
  return Math.max(fontSize, text.length * per + text.length * letterSpacing) + 10;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildBadgeSvg({ label, message, color, style, logo }: BadgeOptions): string {
  const fill = resolveBadgeColor(color);
  const fontSize = style === 'for-the-badge' ? 10 : 11;
  const bold = style === 'for-the-badge';
  const spacing = style === 'for-the-badge' ? 1 : 0;
  const labelText = style === 'for-the-badge' ? label.toUpperCase() : label;
  const messageText = style === 'for-the-badge' ? message.toUpperCase() : message;
  const logoPad = logo ? fontSize + 6 : 0;
  const labelWidth = label ? estimateWidth(labelText, fontSize, bold, spacing) + logoPad : 0;
  const messageWidth = estimateWidth(messageText, fontSize, bold, spacing);
  const height = style === 'plastic' ? 18 : style === 'for-the-badge' ? 28 : 20;
  const rx = style === 'flat' || style === 'social' ? 3 : 0;
  const width = Math.max(labelWidth + messageWidth, 40);

  const text = (
    x: number,
    anchor: 'start' | 'middle',
    content: string,
    textFill: string,
  ) =>
    `<text x="${x}" y="${height / 2 + fontSize * 0.36}" font-family="Verdana,Geneva,DejaVu,sans-serif" font-size="${fontSize}px" font-weight="${bold ? 700 : 400}" letter-spacing="${spacing}" text-anchor="${anchor}" fill="${textFill}" fill-opacity="1">${escapeXml(content)}</text>`;

  const labelCenter = labelWidth / 2;
  const messageCenter = labelWidth + messageWidth / 2;

  const labelPart = label
    ? `<rect x="0" y="0" width="${labelWidth}" height="${height}" fill="#555"/>` +
      (logo
        ? `<text x="6" y="${height / 2 + fontSize * 0.36}" font-size="${fontSize}px" fill="#fff" font-family="monospace">${escapeXml(`[${logo}]`)}</text>`
        : '')
    : '';

  const gradient =
    style === 'plastic'
      ? `<defs><linearGradient id="e" x2="0" y2="100%"><stop offset="0" stop-color="#ccc" stop-opacity=".4"/><stop offset="1" stop-opacity=".4"/></linearGradient></defs><rect width="${width}" height="${height}" rx="${rx}" fill="url(#e)"/>`
      : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="${escapeXml(`${label}: ${message}`)}">` +
    `<clipPath id="r"><rect width="${width}" height="${height}" rx="${rx}"/></clipPath>` +
    `<g clip-path="url(#r)">` +
    labelPart +
    `<rect x="${labelWidth}" y="0" width="${messageWidth}" height="${height}" fill="${fill}"/>` +
    gradient +
    `</g>` +
    (rx > 0
      ? `<rect width="${width}" height="${height}" rx="${rx}" fill="none" stroke="#000" stroke-opacity=".1"/>`
      : '') +
    `<g>` +
    (label ? text(labelCenter, 'middle', labelText, '#fff') : '') +
    text(messageCenter, 'middle', messageText, '#fff') +
    `</g></svg>`
  );
}

function shieldsEscape(value: string): string {
  return value.replace(/-/g, '--').replace(/_/g, '__');
}

export function buildBadgeUrl(opts: BadgeOptions): string {
  const segment =
    [opts.label, opts.message, opts.color.trim()].map(shieldsEscape).join('-') || 'badge';
  const params = new URLSearchParams();
  if (opts.style !== 'flat') params.set('style', opts.style);
  if (opts.logo) params.set('logo', opts.logo);
  if (opts.link) {
    params.append('link', opts.link);
    params.append('link', opts.link);
  }
  const qs = params.toString();
  return `https://img.shields.io/badge/${segment}${qs ? `?${qs}` : ''}`;
}

export function badgeMarkdown(opts: BadgeOptions): string {
  const image = `![${opts.label}: ${opts.message}](${buildBadgeUrl(opts)})`;
  return opts.link ? `[${image}](${opts.link})` : image;
}

export function badgeHtml(opts: BadgeOptions): string {
  const image = `<img src="${buildBadgeUrl(opts)}" alt="${escapeXml(`${opts.label}: ${opts.message}`)}" />`;
  return opts.link ? `<a href="${escapeXml(opts.link)}">${image}</a>` : image;
}
