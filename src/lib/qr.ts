import QRCode from 'qrcode';
import type { QRCode as QrSymbol } from 'qrcode';
import { ToolError } from './errors';
import type { L10n } from '@/i18n/locale';

export type QrEcc = 'L' | 'M' | 'Q' | 'H';

export const QR_MARGIN = 4;
export const QR_MIN_SIZE = 128;
export const QR_MAX_SIZE = 2048;
export const QR_DEFAULT_SIZE = 512;

export const QR_SIZE_OPTIONS = [256, 512, 1024, 2048] as const;

export const QR_ECC_OPTIONS: ReadonlyArray<{
  value: QrEcc;
  label: string;
  description: L10n;
}> = [
  { value: 'L', label: 'L · 7%', description: { zh: '容量最大，适合内容较长的场景', en: 'Largest capacity; best for long content' } },
  { value: 'M', label: 'M · 15%', description: { zh: '容量与容错的常用平衡（推荐）', en: 'A common balance of capacity and recovery (recommended)' } },
  { value: 'Q', label: 'Q · 25%', description: { zh: '较强容错，适合印刷或易磨损场景', en: 'Stronger recovery; suited to printing and worn surfaces' } },
  { value: 'H', label: 'H · 30%', description: { zh: '容错最高，容量最小', en: 'Highest recovery, smallest capacity' } },
];

export interface QrStyle {
  size: number;
  ecc: QrEcc;
  foreground: string;
  background: string;
}

export interface QrMatrix {
  version: number;
  moduleCount: number;
  data: Uint8Array;
  byteLength: number;
  charLength: number;
}

export const QR_DEFAULT_STYLE: QrStyle = {
  size: QR_DEFAULT_SIZE,
  ecc: 'M',
  foreground: '#111827',
  background: '#ffffff',
};

export interface QrRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function normalizeQrSize(size: number): number {
  if (!Number.isFinite(size)) return QR_DEFAULT_SIZE;
  return Math.min(QR_MAX_SIZE, Math.max(QR_MIN_SIZE, Math.round(size)));
}

export function normalizeQrColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!HEX_COLOR.test(trimmed)) return fallback;
  const hex = trimmed.slice(1).toLowerCase();
  const expanded =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
  return `#${expanded}`;
}

export function createQrMatrix(text: string, ecc: QrEcc): QrMatrix {
  if (!text.trim()) {
    throw new ToolError(
      { zh: '请输入要生成二维码的内容', en: 'Enter the content to generate a QR code' },
      { zh: '支持文本、链接、Wi-Fi 配置等任意内容。', en: 'Any content is supported, such as text, links, or Wi-Fi settings.' },
    );
  }

  const byteLength = utf8ByteLength(text);
  let symbol: QrSymbol;
  try {
    symbol = QRCode.create(text, { errorCorrectionLevel: ecc });
  } catch {
    throw new ToolError(
      { zh: '内容超出二维码容量', en: 'Content exceeds the QR code capacity' },
      {
        zh: `当前内容 ${text.length} 字符 / ${byteLength} 字节（UTF-8），超出 ${ecc} 级容错的可编码上限。请缩短内容、切换到 L 级容错，或拆分为多个二维码。`,
        en: `The content is ${text.length} characters / ${byteLength} bytes (UTF-8), over the encoding limit of ${ecc} error correction. Shorten the content, switch to L error correction, or split it into multiple QR codes.`,
      },
    );
  }

  return {
    version: symbol.version,
    moduleCount: symbol.modules.size,
    data: symbol.modules.data,
    byteLength,
    charLength: text.length,
  };
}

export function buildQrSvg(matrix: QrMatrix, style: QrStyle): string {
  const size = normalizeQrSize(style.size);
  const foreground = normalizeQrColor(style.foreground, QR_DEFAULT_STYLE.foreground);
  const background = normalizeQrColor(style.background, QR_DEFAULT_STYLE.background);
  const total = matrix.moduleCount + QR_MARGIN * 2;
  const commands: string[] = [];

  for (let row = 0; row < matrix.moduleCount; row += 1) {
    const offset = row * matrix.moduleCount;
    let col = 0;
    while (col < matrix.moduleCount) {
      if (!matrix.data[offset + col]) {
        col += 1;
        continue;
      }
      let run = 1;
      while (col + run < matrix.moduleCount && matrix.data[offset + col + run]) {
        run += 1;
      }
      commands.push(`M${col + QR_MARGIN} ${row + QR_MARGIN}h${run}v1h-${run}z`);
      col += run;
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="二维码">`,
    `<rect width="${total}" height="${total}" fill="${background}"/>`,
    `<path d="${commands.join('')}" fill="${foreground}"/>`,
    '</svg>',
  ].join('');
}

export function qrRects(matrix: QrMatrix, size: number): QrRect[] {
  const normalizedSize = normalizeQrSize(size);
  const total = matrix.moduleCount + QR_MARGIN * 2;
  const cell = normalizedSize / total;
  const rects: QrRect[] = [];

  for (let row = 0; row < matrix.moduleCount; row += 1) {
    const offset = row * matrix.moduleCount;
    const y = Math.round((row + QR_MARGIN) * cell);
    const bottom = Math.round((row + QR_MARGIN + 1) * cell);
    const height = Math.max(1, bottom - y);
    let col = 0;
    while (col < matrix.moduleCount) {
      if (!matrix.data[offset + col]) {
        col += 1;
        continue;
      }
      let run = 1;
      while (col + run < matrix.moduleCount && matrix.data[offset + col + run]) {
        run += 1;
      }
      const x = Math.round((col + QR_MARGIN) * cell);
      const right = Math.round((col + QR_MARGIN + run) * cell);
      rects.push({ x, y, width: Math.max(1, right - x), height });
      col += run;
    }
  }

  return rects;
}

export function renderQrToCanvas(matrix: QrMatrix, style: QrStyle): HTMLCanvasElement {
  const size = normalizeQrSize(style.size);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new ToolError(
      { zh: '当前浏览器不支持 Canvas', en: 'The current browser does not support Canvas' },
      {
        zh: '请更换 Chrome / Edge / Safari 最新版本后重试，或下载 SVG 格式。',
        en: 'Try again in the latest Chrome / Edge / Safari, or download the SVG format.',
      },
    );
  }

  context.imageSmoothingEnabled = false;
  context.fillStyle = normalizeQrColor(style.background, QR_DEFAULT_STYLE.background);
  context.fillRect(0, 0, size, size);
  context.fillStyle = normalizeQrColor(style.foreground, QR_DEFAULT_STYLE.foreground);
  for (const rect of qrRects(matrix, size)) {
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(
        new ToolError(
          { zh: 'PNG 生成失败', en: 'PNG generation failed' },
          { zh: '浏览器无法导出图片，请改用 SVG 下载。', en: 'The browser cannot export the image; use the SVG download instead.' },
        ),
      );
    }, 'image/png');
  });
}

export function qrDownloadName(size: number, extension: 'png' | 'svg'): string {
  return `qrcode-${normalizeQrSize(size)}.${extension}`;
}
