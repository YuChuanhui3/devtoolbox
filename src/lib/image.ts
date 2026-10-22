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

export async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
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
    return image;
  } catch {
    URL.revokeObjectURL(url);
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

export async function processImage(
  source: ImageBitmap | HTMLImageElement,
  options: ProcessImageOptions,
): Promise<ProcessedImage> {
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const scale = options.maxWidth > 0 ? Math.min(1, options.maxWidth / sourceWidth) : 1;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new ToolError(
      {
        zh: '当前浏览器不支持 Canvas 图片处理',
        en: 'This browser does not support Canvas image processing',
      },
      {
        zh: '请更换 Chrome / Edge / Safari 最新版本后重试。',
        en: 'Please use the latest Chrome / Edge / Safari and try again.',
      },
    );
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  if (options.mime === 'image/jpeg' || options.mime === 'image/bmp') {
    context.fillStyle = options.background || '#ffffff';
    context.fillRect(0, 0, width, height);
  }

  context.drawImage(source, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (result) => resolve(result),
      options.mime,
      Math.min(1, Math.max(0.05, options.quality)),
    );
  });

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
