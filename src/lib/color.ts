export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX_PATTERN = /^#?([0-9a-f]{3,8})$/i;

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function parseAlpha(value: string | undefined): number {
  if (value === undefined) return 1;
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) {
    return Math.min(1, Math.max(0, Number.parseFloat(trimmed) / 100));
  }
  return Math.min(1, Math.max(0, Number.parseFloat(trimmed)));
}

function parseHex(input: string): RGBA | null {
  const match = input.trim().match(HEX_PATTERN);
  if (!match) return null;

  let hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (hex.length !== 6 && hex.length !== 8) return null;

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
  };
}

function parseRgb(input: string): RGBA | null {
  const match = input.trim().match(/^rgba?\((.*)\)$/i);
  if (!match) return null;

  const parts = match[1]
    .replace(/\//g, ' ')
    .split(/[, ]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;

  const channel = (value: string, max: number): number => {
    const trimmed = value.trim();
    if (trimmed.endsWith('%')) {
      return (Number.parseFloat(trimmed) / 100) * max;
    }
    return Number.parseFloat(trimmed);
  };

  const r = channel(parts[0], 255);
  const g = channel(parts[1], 255);
  const b = channel(parts[2], 255);
  const a = parseAlpha(parts[3]);

  if ([r, g, b, a].some((value) => Number.isNaN(value))) return null;
  return { r: clampChannel(r), g: clampChannel(g), b: clampChannel(b), a };
}

export function hslToRgb(hue: number, saturation: number, lightness: number, alpha = 1): RGBA {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.min(1, Math.max(0, saturation / 100));
  const l = Math.min(1, Math.max(0, lightness / 100));

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return {
    r: clampChannel((r + m) * 255),
    g: clampChannel((g + m) * 255),
    b: clampChannel((b + m) * 255),
    a: Math.min(1, Math.max(0, alpha)),
  };
}

function parseHsl(input: string): RGBA | null {
  const match = input.trim().match(/^hsla?\((.*)\)$/i);
  if (!match) return null;

  const parts = match[1]
    .replace(/\//g, ' ')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 3) return null;

  const hue = Number.parseFloat(parts[0].replace(/deg$/i, ''));
  const saturation = Number.parseFloat(parts[1]);
  const lightness = Number.parseFloat(parts[2]);
  const alpha = parseAlpha(parts[3]);

  if ([hue, saturation, lightness, alpha].some((value) => Number.isNaN(value))) return null;
  return hslToRgb(hue, saturation, lightness, alpha);
}

function parseWithCanvas(input: string): RGBA | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.fillStyle = '#010203';
    context.fillStyle = input;
    const normalized = context.fillStyle;
    if (normalized === '#010203' && input.trim().toLowerCase() !== '#010203') return null;

    if (normalized.startsWith('#')) return parseHex(normalized);
    return parseRgb(normalized);
  } catch {
    return null;
  }
}

export function parseColor(input: string): RGBA | null {
  const value = input.trim();
  if (!value) return null;
  return parseHex(value) ?? parseRgb(value) ?? parseHsl(value) ?? parseWithCanvas(value);
}

export function rgbaToHex({ r, g, b, a }: RGBA): string {
  const channels = [r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, '0'));
  if (a < 1) {
    channels.push(clampChannel(a * 255).toString(16).padStart(2, '0'));
  }
  return `#${channels.join('')}`.toUpperCase();
}

export function rgbaToRgbString({ r, g, b, a }: RGBA): string {
  const roundedAlpha = Number(a.toFixed(3));
  return a < 1
    ? `rgba(${clampChannel(r)}, ${clampChannel(g)}, ${clampChannel(b)}, ${roundedAlpha})`
    : `rgb(${clampChannel(r)}, ${clampChannel(g)}, ${clampChannel(b)})`;
}

export function rgbaToHsl({ r, g, b, a }: RGBA): { h: number; s: number; l: number; a: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return {
    h: Math.round(hue),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
    a,
  };
}

export function rgbaToHslString(color: RGBA): string {
  const { h, s, l, a } = rgbaToHsl(color);
  const alpha = Number(a.toFixed(3));
  return a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${alpha})` : `hsl(${h}, ${s}%, ${l}%)`;
}

export interface ColorResult {
  rgba: RGBA;
  hex: string;
  rgb: string;
  hsl: string;
  hslParts: { h: number; s: number; l: number; a: number };
  cssColor: string;
}

export function convertColor(input: string): ColorResult | null {
  const rgba = parseColor(input);
  if (!rgba) return null;
  return {
    rgba,
    hex: rgbaToHex(rgba),
    rgb: rgbaToRgbString(rgba),
    hsl: rgbaToHslString(rgba),
    hslParts: rgbaToHsl(rgba),
    cssColor: rgbaToRgbString(rgba),
  };
}
