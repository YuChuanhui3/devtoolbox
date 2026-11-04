import QRCode from 'qrcode';
import type { QRCode as QrSymbol } from 'qrcode';
import { ToolError } from './errors';
import { tl, type L10n } from '@/i18n/locale';

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

const QR_CAPACITY_ERROR_MESSAGE: L10n = { zh: '内容超出二维码容量', en: 'Content exceeds the QR code capacity' };

/** 判断 createQrMatrix 抛出的错误是否为容量不足（供自动搜索单帧最大字节数用）。 */
export function isQrCapacityError(error: unknown): boolean {
  return error instanceof ToolError && tl(error.localized, 'zh') === QR_CAPACITY_ERROR_MESSAGE.zh;
}

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
  } catch (error) {
    if (error instanceof ToolError && tl(error.localized, 'zh') === QR_CAPACITY_ERROR_MESSAGE.zh) throw error;
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
  // 模块必须等宽：分数 cell 取整后宽窄交替，V25+ 的码扫描器（zxing）直接检测不到图形
  const cell = Math.max(1, Math.floor(normalizedSize / total));
  const offset = Math.floor((normalizedSize - cell * total) / 2);
  const rects: QrRect[] = [];

  for (let row = 0; row < matrix.moduleCount; row += 1) {
    const offsetRow = row * matrix.moduleCount;
    let col = 0;
    while (col < matrix.moduleCount) {
      if (!matrix.data[offsetRow + col]) {
        col += 1;
        continue;
      }
      let run = 1;
      while (col + run < matrix.moduleCount && matrix.data[offsetRow + col + run]) {
        run += 1;
      }
      rects.push({
        x: offset + (col + QR_MARGIN) * cell,
        y: offset + (row + QR_MARGIN) * cell,
        width: run * cell,
        height: cell,
      });
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

export interface QrScannability {
  /** 含左右上下静区的模块总数，即画布被划分成多少格。 */
  totalModules: number;
  /** 实际显示宽度下每模块的 CSS 像素。 */
  modulePx: number;
  minModulePx: number;
  ok: boolean;
}

/**
 * 每模块的 CSS 像素。相机分辨的是屏幕上的物理尺寸，与 canvas 后备像素无关，
 * 因此可扫性只能用「实际上屏宽度」做判断（CSS px 是 DPI 无关的代理量）。
 */
export function qrModuleCssPx(moduleCount: number, cssWidth: number): number {
  const total = moduleCount + QR_MARGIN * 2;
  if (total <= 0 || !(cssWidth > 0)) return 0;
  return cssWidth / total;
}

/** 给定显示宽度与每模块下限，允许的最大模块数（已扣除静区）。 */
export function maxModuleCountForScan(cssWidth: number, minModulePx: number): number {
  if (!(cssWidth > 0) || !(minModulePx > 0)) return Number.MAX_SAFE_INTEGER;
  return Math.floor(cssWidth / minModulePx) - QR_MARGIN * 2;
}

export function assessQrScan(moduleCount: number, cssWidth: number, minModulePx: number): QrScannability {
  const modulePx = qrModuleCssPx(moduleCount, cssWidth);
  return {
    totalModules: moduleCount + QR_MARGIN * 2,
    modulePx,
    minModulePx,
    ok: modulePx >= minModulePx,
  };
}

/**
 * 无重采样的画布尺寸：格宽取整数，backing = 模块总数 × 格宽，再按 dpr 反推 CSS 尺寸，
 * 这样一个模块正好占整数个设备像素（固定 512 之类会把码缩到 CSS 宽度上、边缘发糊）。
 */
export function crispQrRect(moduleCount: number, cssWidth: number, dpr = 1): { size: number; cssSize: number } {
  const total = moduleCount + QR_MARGIN * 2;
  if (total <= 0) return { size: QR_DEFAULT_SIZE, cssSize: QR_DEFAULT_SIZE };
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const maxCell = Math.max(1, Math.floor(QR_MAX_SIZE / total));
  const minCell = Math.min(Math.ceil(QR_MIN_SIZE / total), maxCell);
  const wanted = Math.floor((Math.max(0, cssWidth) * ratio) / total);
  const cell = Math.min(maxCell, Math.max(minCell, wanted));
  const size = total * cell;
  return { size, cssSize: size / ratio };
}
