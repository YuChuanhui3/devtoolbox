import { ToolError } from './errors';
import { MAX_IMAGE_SIZE } from './image';

export const BASE64_LINE_LENGTH = 76;
export const LARGE_BASE64_PREVIEW = 4000;
export const LARGE_BASE64_THRESHOLD = 100_000;

export interface ParsedBase64Image {
  /** 不含前缀与换行的标准 Base64。 */
  base64: string;
  mime: string;
  bytes: Uint8Array;
  dataUri: string;
}

export interface Base64OutputOptions {
  includeDataUri?: boolean;
  singleLine?: boolean;
}

export interface ReadImageResult {
  dataUrl: string;
  base64: string;
  mime: string;
}

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

function startsWithBytes(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function detectImageMime(bytes: Uint8Array): string | null {
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    return 'image/gif';
  }
  if (
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWithBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  if (startsWithBytes(bytes, [0x42, 0x4d])) {
    return 'image/bmp';
  }
  return null;
}

export function imageExtensionForMime(mime: string): string {
  return MIME_EXTENSION[mime.toLowerCase()] ?? 'bin';
}

export function imageMimeForFile(file: File): string {
  if (file.type.startsWith('image/')) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME[extension] ?? 'application/octet-stream';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(payload: string): Uint8Array {
  const compact = payload.replace(/\s+/g, '');
  if (!compact) {
    throw new ToolError(
      { zh: 'Base64 内容为空', en: 'Base64 content is empty' },
      { zh: '请粘贴完整的 Base64 字符串或 Data URL。', en: 'Paste the complete Base64 string or Data URL.' },
    );
  }
  if (compact.length > Math.ceil(MAX_IMAGE_SIZE / 3) * 4 + 4) {
    throw new ToolError(
      { zh: `Base64 解码后可能超过 ${MAX_IMAGE_SIZE / 1024 / 1024}MB 限制`, en: `Base64 may decode to more than ${MAX_IMAGE_SIZE / 1024 / 1024}MB, exceeding the limit` },
      { zh: '请先压缩图片，或选择更小的图片后重试。', en: 'Compress the image first, or choose a smaller image and try again.' },
    );
  }

  const normalized = compact.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new ToolError(
      { zh: 'Base64 数据包含非法字符', en: 'Base64 data contains invalid characters' },
      { zh: '仅支持 A-Z、a-z、0-9、+、/、-、_ 与结尾的 = 填充，空格和换行会自动清理。', en: 'Only A-Z, a-z, 0-9, +, /, -, _ and trailing = padding are supported; spaces and line breaks are removed automatically.' },
    );
  }

  const remainder = normalized.length % 4;
  const padded = remainder === 0 ? normalized : normalized + '='.repeat(4 - remainder);

  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new ToolError(
      { zh: 'Base64 解码失败', en: 'Base64 decoding failed' },
      { zh: '数据可能已损坏，请检查长度与填充是否完整。', en: 'The data may be corrupted; check that the length and padding are complete.' },
    );
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (bytes.length === 0) {
    throw new ToolError(
      { zh: 'Base64 内容为空', en: 'Base64 content is empty' },
      { zh: '解码后没有得到任何图片数据。', en: 'No image data was obtained after decoding.' },
    );
  }
  if (bytes.length > MAX_IMAGE_SIZE) {
    throw new ToolError(
      { zh: `图片超过 ${MAX_IMAGE_SIZE / 1024 / 1024}MB 限制`, en: `Image exceeds the ${MAX_IMAGE_SIZE / 1024 / 1024}MB limit` },
      { zh: '请压缩或缩小图片后重新编码。', en: 'Compress or resize the image before re-encoding.' },
    );
  }
  return bytes;
}

function parseDataUri(input: string): { declaredMime: string | null; payload: string } {
  const comma = input.indexOf(',');
  if (comma < 0) {
    throw new ToolError(
      { zh: 'Data URL 格式不完整', en: 'Data URL format is incomplete' },
      { zh: '请检查是否缺少逗号与 Base64 数据。', en: 'Check whether the comma and Base64 data are missing.' },
    );
  }

  const header = input.slice(5, comma);
  if (!/(?:^|;)\s*base64(?:;|$)/i.test(header)) {
    throw new ToolError(
      { zh: '仅支持 Base64 编码的 Data URL', en: 'Only Base64-encoded Data URLs are supported' },
      { zh: '请使用 data:image/png;base64,... 或 data:image/jpeg;base64,... 形式。', en: 'Use the data:image/png;base64,... or data:image/jpeg;base64,... form.' },
    );
  }

  const mimeMatch = /^([^;]+)/.exec(header);
  return {
    declaredMime: mimeMatch?.[1]?.trim().toLowerCase() || null,
    payload: input.slice(comma + 1),
  };
}

export function parseBase64Image(input: string): ParsedBase64Image {
  let text = input.trim().replace(/^\uFEFF/, '');
  if (
    text.length >= 2 &&
    (text.startsWith('"') || text.startsWith("'")) &&
    text.endsWith(text[0])
  ) {
    text = text.slice(1, -1).trim();
  }
  if (!text) {
    throw new ToolError(
      { zh: '请输入 Base64 或 Data URL', en: 'Enter Base64 or a Data URL' },
      { zh: '支持 data:image/png;base64,... 或纯 Base64 字符串。', en: 'Supports data:image/png;base64,... or a plain Base64 string.' },
    );
  }

  const payload = /^data:/i.test(text) ? parseDataUri(text).payload : text;

  const bytes = decodeBase64(payload);
  const mime = detectImageMime(bytes);
  if (!mime) {
    throw new ToolError(
      { zh: '无法识别图片格式', en: 'Unrecognized image format' },
      { zh: '请确认 Base64 内容来自 JPG / PNG / WebP / GIF / BMP 图片，其他格式暂不支持。', en: 'Make sure the Base64 comes from a JPG / PNG / WebP / GIF / BMP image; other formats are not supported yet.' },
    );
  }

  const base64 = bytesToBase64(bytes);
  return {
    base64,
    mime,
    bytes,
    dataUri: `data:${mime};base64,${base64}`,
  };
}

export function buildBase64Output(
  base64: string,
  mime: string,
  options: Base64OutputOptions = {},
): string {
  const { includeDataUri = true, singleLine = false } = options;
  const prefix = includeDataUri ? `data:${mime};base64,` : '';
  if (singleLine) return `${prefix}${base64}`;

  const lines: string[] = [];
  for (let offset = 0; offset < base64.length; offset += BASE64_LINE_LENGTH) {
    lines.push(base64.slice(offset, offset + BASE64_LINE_LENGTH));
  }
  return `${prefix}${lines.join('\n')}`;
}

export function readFileAsDataUrl(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onProgress?.(100);
        resolve(reader.result);
        return;
      }
      reject(
        new ToolError(
          { zh: '图片读取失败', en: 'Failed to read image' },
          { zh: '浏览器没有返回可用的 Base64 数据。', en: 'The browser did not return usable Base64 data.' },
        ),
      );
    };

    reader.onerror = () => {
      reject(
        new ToolError(
          { zh: '图片读取失败', en: 'Failed to read image' },
          { zh: '请检查文件是否损坏，或更换浏览器后重试。', en: 'Check whether the file is corrupted, or try a different browser.' },
        ),
      );
    };

    reader.onabort = () => {
      reject(
        new ToolError(
          { zh: '图片读取已取消', en: 'Image reading was cancelled' },
          { zh: '请重新选择图片。', en: 'Select the image again.' },
        ),
      );
    };

    reader.readAsDataURL(file);
  });
}

export async function readImageFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ReadImageResult> {
  const dataUrl = await readFileAsDataUrl(file, onProgress);
  const comma = dataUrl.indexOf(',');
  const header = comma >= 0 ? dataUrl.slice(0, comma) : '';
  if (comma < 0 || !/;base64$/i.test(header)) {
    throw new ToolError(
      { zh: '图片读取失败', en: 'Failed to read image' },
      { zh: '浏览器返回的数据不是 Base64 Data URL。', en: 'The data returned by the browser is not a Base64 Data URL.' },
    );
  }

  const base64 = dataUrl.slice(comma + 1).replace(/\s+/g, '');
  if (!base64) {
    throw new ToolError(
      { zh: '图片内容为空', en: 'Image content is empty' },
      { zh: '请选择包含有效图片数据的文件。', en: 'Select a file containing valid image data.' },
    );
  }

  return { dataUrl, base64, mime: imageMimeForFile(file) };
}
