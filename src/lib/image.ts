import { ToolError } from './errors';

export const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
export const MAX_IMAGE_COUNT = 20;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
export const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.bmp,image/jpeg,image/png,image/webp,image/gif,image/bmp';

export interface OutputFormat {
  mime: string;
  extension: string;
  label: string;
}

export const OUTPUT_FORMATS: OutputFormat[] = [
  { mime: 'image/webp', extension: 'webp', label: 'WebP' },
  { mime: 'image/jpeg', extension: 'jpg', label: 'JPG' },
  { mime: 'image/png', extension: 'png', label: 'PNG' },
];

const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];

const IMAGE_LIMIT_HINT = {
  zh: '支持 JPG / PNG / WebP / GIF / BMP，最多 20 张，单张不超过 20MB。',
  en: 'JPG / PNG / WebP / GIF / BMP supported, up to 20 images, 20MB each.',
};

export function validateImageFile(file: File): ToolError | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type) && !SUPPORTED_EXTENSIONS.includes(extension)) {
    return new ToolError(
      {
        zh: `仅支持 JPG / PNG / WebP / GIF / BMP，当前文件：${file.name}`,
        en: `Only JPG / PNG / WebP / GIF / BMP are supported, this file: ${file.name}`,
      },
      IMAGE_LIMIT_HINT,
    );
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return new ToolError(
      {
        zh: `单张图片不能超过 20MB，当前文件：${file.name}`,
        en: `Each image must stay under 20MB, this file: ${file.name}`,
      },
      IMAGE_LIMIT_HINT,
    );
  }
  return null;
}

// 20MB 的 PNG 解码后可能是上亿像素（≈GB 级内存），文件大小挡不住，按像素再设一道闸。
export const MAX_DECODED_PIXELS = 50_000_000;

function assertPixelBudget(source: { width: number; height: number; close?: () => void }, name: string) {
  if (source.width * source.height <= MAX_DECODED_PIXELS) return;
  if (typeof source.close === 'function') source.close();
  throw new ToolError(
    {
      zh: `${name} 解码后约 ${Math.round((source.width * source.height) / 1_000_000)} 百万像素，超过 5000 万像素上限`,
      en: `${name} decodes to ~${Math.round((source.width * source.height) / 1_000_000)} megapixels, above the 50MP limit`,
    },
    {
      zh: '请先用其他工具把图片缩小到约 7000×7000 像素以内。',
      en: 'Downscale the image to roughly 7000×7000 pixels first.',
    },
  );
}

export async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      assertPixelBudget(bitmap, file.name);
      return bitmap;
    } catch (error) {
      if (error instanceof ToolError) throw error;
      /* 回退到 HTMLImageElement */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    // 解码完成后位图已在内存中，Object URL 可以立即释放。
    URL.revokeObjectURL(url);
    assertPixelBudget(image, file.name);
    return image;
  } catch (error) {
    URL.revokeObjectURL(url);
    if (error instanceof ToolError) throw error;
    throw new ToolError(
      { zh: '图片读取失败', en: 'Image load failed' },
      {
        zh: '文件可能已损坏或格式不受浏览器支持。',
        en: 'The file may be corrupted or in a format the browser does not support.',
      },
    );
  }
}

export interface ProcessImageOptions {
  mime: string;
  quality: number;
  maxWidth: number;
  background: string;
}

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
}

const CANVAS_UNSUPPORTED_ERROR = new ToolError(
  {
    zh: '当前浏览器不支持 Canvas 图片处理',
    en: 'This browser does not support Canvas image processing',
  },
  {
    zh: '请更换 Chrome / Edge / Safari 最新版本后重试。',
    en: 'Please use the latest Chrome / Edge / Safari and try again.',
  },
);

function createScaledCanvas(
  source: ImageBitmap | HTMLImageElement,
  maxWidth: number,
  background: string | null,
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; width: number; height: number } {
  const scale = maxWidth > 0 ? Math.min(1, maxWidth / source.width) : 1;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw CANVAS_UNSUPPORTED_ERROR;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  }

  context.drawImage(source, 0, 0, width, height);
  return { canvas, context, width, height };
}

function encodeCanvas(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (result) => resolve(result),
      mime,
      Math.min(1, Math.max(0.05, quality)),
    );
  });
}

export async function processImage(
  source: ImageBitmap | HTMLImageElement,
  options: ProcessImageOptions,
): Promise<ProcessedImage> {
  const { canvas, width, height } = createScaledCanvas(
    source,
    options.maxWidth,
    options.mime === 'image/jpeg' || options.mime === 'image/bmp' ? options.background || '#ffffff' : null,
  );

  const blob = await encodeCanvas(canvas, options.mime, options.quality);
  if (!blob) {
    throw new ToolError(
      { zh: '图片处理失败', en: 'Image processing failed' },
      {
        zh: '浏览器无法生成目标格式，请尝试其他输出格式。',
        en: 'The browser could not generate the target format; try a different output format.',
      },
    );
  }

  return { blob, width, height };
}

let webpSupport: boolean | null = null;

export function supportsWebp(): boolean {
  if (webpSupport !== null) return webpSupport;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

/** 缩小采样检测 alpha 通道，决定是否允许无损 JPEG 候选。 */
export function hasTransparency(source: ImageBitmap | HTMLImageElement): boolean {
  const probeScale = Math.min(1, 128 / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * probeScale));
  const height = Math.max(1, Math.round(source.height * probeScale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return true;
  context.drawImage(source, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  for (let offset = 3; offset < data.length; offset += 4) {
    if (data[offset] < 255) return true;
  }
  return false;
}

export interface CompressSettings {
  /** 0-1，质量模式使用。 */
  quality: number;
  maxWidth: number;
  background: string;
}

export type CompressStrategy =
  | { kind: 'direct'; mime: string }
  | { kind: 'smart' }
  | { kind: 'target'; targetBytes: number };

export interface CompressOutcome {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
  /** 仅目标大小模式：是否达成目标体积。 */
  targetMet?: boolean;
}

/** 试编多个候选格式取最小；透明图跳过 JPEG，不透明图仍以无损 PNG 作兜底候选。 */
export async function compressSmart(
  source: ImageBitmap | HTMLImageElement,
  settings: CompressSettings,
): Promise<CompressOutcome> {
  const transparent = hasTransparency(source);
  const { canvas, width, height } = createScaledCanvas(source, settings.maxWidth, null);

  const candidates: Array<{ mime: string; blob: Blob | null }> = [];
  if (supportsWebp()) {
    candidates.push({ mime: 'image/webp', blob: await encodeCanvas(canvas, 'image/webp', settings.quality) });
  }
  if (!transparent) {
    candidates.push({ mime: 'image/jpeg', blob: await encodeCanvas(canvas, 'image/jpeg', settings.quality) });
  }
  candidates.push({ mime: 'image/png', blob: await encodeCanvas(canvas, 'image/png', 1) });

  const valid = candidates.filter((item): item is { mime: string; blob: Blob } => Boolean(item.blob));
  if (valid.length === 0) {
    throw new ToolError(
      { zh: '图片处理失败', en: 'Image processing failed' },
      {
        zh: '浏览器无法生成任何候选格式。',
        en: 'The browser could not encode any candidate format.',
      },
    );
  }
  const best = valid.reduce((a, b) => (b.blob.size < a.blob.size ? b : a));
  return { blob: best.blob, width, height, mime: best.mime };
}

const TARGET_MIN_SCALE = 0.2;
const TARGET_MIN_WIDTH = 320;
const TARGET_SCALE_STEP = 0.8;
const TARGET_SEARCH_STEPS = 7;

/** 二分质量找「≤ 目标体积的最高质量」，必要时逐档降分辨率。 */
export async function compressToTarget(
  source: ImageBitmap | HTMLImageElement,
  settings: CompressSettings,
  targetBytes: number,
): Promise<CompressOutcome> {
  const transparent = hasTransparency(source);
  const mime = supportsWebp() ? 'image/webp' : 'image/jpeg';
  const baseWidth = settings.maxWidth > 0 ? Math.min(settings.maxWidth, source.width) : source.width;

  let smallest: CompressOutcome | null = null;

  for (let scale = 1; scale >= TARGET_MIN_SCALE; scale *= TARGET_SCALE_STEP) {
    const maxWidth = Math.max(1, Math.round(baseWidth * scale));
    const { canvas, width, height } = createScaledCanvas(
      source,
      maxWidth,
      transparent || mime !== 'image/jpeg' ? null : settings.background || '#ffffff',
    );

    let lo = 0.05;
    let hi = 0.95;
    let best: Blob | null = null;
    let lowest: Blob | null = null;

    for (let step = 0; step < TARGET_SEARCH_STEPS; step += 1) {
      const mid = (lo + hi) / 2;
      const blob = await encodeCanvas(canvas, mime, mid);
      if (!blob) break;
      if (!lowest || blob.size < lowest.size) lowest = blob;
      if (blob.size <= targetBytes) {
        if (!best || blob.size > best.size) best = blob;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    if (best) {
      return { blob: best, width, height, mime, targetMet: true };
    }
    if (lowest && (!smallest || lowest.size < smallest.blob.size)) {
      smallest = { blob: lowest, width, height, mime, targetMet: false };
    }
    if (width <= TARGET_MIN_WIDTH) break;
  }

  if (!smallest) {
    throw new ToolError(
      { zh: '图片处理失败', en: 'Image processing failed' },
      {
        zh: '浏览器无法编码目标格式。',
        en: 'The browser could not encode the target format.',
      },
    );
  }
  return smallest;
}

export async function compressImage(
  source: ImageBitmap | HTMLImageElement,
  strategy: CompressStrategy,
  settings: CompressSettings,
): Promise<CompressOutcome> {
  if (strategy.kind === 'direct') {
    const processed = await processImage(source, { ...settings, mime: strategy.mime });
    return { ...processed, mime: strategy.mime };
  }
  if (strategy.kind === 'smart') {
    return compressSmart(source, settings);
  }
  return compressToTarget(source, settings, strategy.targetBytes);
}

export function mimeToExtension(mime: string): string {
  const format = OUTPUT_FORMATS.find((item) => item.mime === mime);
  return format?.extension ?? 'img';
}

export function replaceExtension(filename: string, extension: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return `${base || 'image'}.${extension}`;
}

export function formatLabelForMime(mime: string): string {
  return OUTPUT_FORMATS.find((item) => item.mime === mime)?.label ?? mime.replace('image/', '').toUpperCase();
}
