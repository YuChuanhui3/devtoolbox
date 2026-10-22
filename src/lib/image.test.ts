import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  formatLabelForMime,
  loadImage,
  mimeToExtension,
  processImage,
  replaceExtension,
  validateImageFile,
} from './image';

const drawImage = vi.fn();
const fillRect = vi.fn();
let contextAvailable = true;
let blobAvailable = true;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() =>
    contextAvailable
      ? {
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low',
          fillStyle: '',
          fillRect,
          drawImage,
        }
      : null,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback, type?: string) => {
    callback(blobAvailable ? new Blob(['ok'], { type: type ?? 'image/webp' }) : null);
  }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

  if (!URL.createObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:mock', configurable: true });
  }
  if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  contextAvailable = true;
  blobAvailable = true;
  drawImage.mockClear();
  fillRect.mockClear();
});

describe('image utilities', () => {
  test('validateImageFile accepts supported formats', () => {
    expect(validateImageFile(new File(['x'], 'a.png', { type: 'image/png' }))).toBeNull();
    expect(validateImageFile(new File(['x'], 'b.jpg', { type: 'image/jpeg' }))).toBeNull();
  });

  test('validateImageFile rejects unsupported formats and oversized files', () => {
    const rejected = validateImageFile(new File(['x'], 'a.txt', { type: 'text/plain' }));
    expect(rejected?.message).toContain('仅支持 JPG / PNG / WebP / GIF / BMP');
    expect(rejected?.hint).toBeTruthy();
    const large = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(large, 'size', { value: 21 * 1024 * 1024 });
    expect(validateImageFile(large)?.message).toContain('不能超过 20MB');
  });

  test('mimeToExtension and replaceExtension produce output filenames', () => {
    expect(mimeToExtension('image/webp')).toBe('webp');
    expect(mimeToExtension('image/jpeg')).toBe('jpg');
    expect(mimeToExtension('image/unknown')).toBe('img');
    expect(replaceExtension('photo.png', 'webp')).toBe('photo.webp');
    expect(replaceExtension('noext', 'jpg')).toBe('noext.jpg');
  });

  test('formatLabelForMime returns friendly labels', () => {
    expect(formatLabelForMime('image/webp')).toBe('WebP');
    expect(formatLabelForMime('image/jpeg')).toBe('JPG');
    expect(formatLabelForMime('image/x-foo')).toBe('X-FOO');
  });

  test('processImage resizes and encodes via canvas', async () => {
    const source = { width: 100, height: 50 } as ImageBitmap;
    const result = await processImage(source, {
      mime: 'image/webp',
      quality: 0.8,
      maxWidth: 50,
      background: '#fff',
    });

    expect(result.width).toBe(50);
    expect(result.height).toBe(25);
    expect(result.blob.type).toBe('image/webp');
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0, 50, 25);
    expect(fillRect).not.toHaveBeenCalled();
  });

  test('processImage fills a background for JPEG output', async () => {
    await processImage({ width: 10, height: 10 } as ImageBitmap, {
      mime: 'image/jpeg',
      quality: 0.9,
      maxWidth: 0,
      background: '#000000',
    });
    expect(fillRect).toHaveBeenCalledWith(0, 0, 10, 10);
  });

  test('processImage fails when canvas or blob is unavailable', async () => {
    contextAvailable = false;
    await expect(
      processImage({ width: 10, height: 10 } as ImageBitmap, {
        mime: 'image/png',
        quality: 1,
        maxWidth: 0,
        background: '#fff',
      }),
    ).rejects.toThrow('当前浏览器不支持 Canvas 图片处理');

    contextAvailable = true;
    blobAvailable = false;
    await expect(
      processImage({ width: 10, height: 10 } as ImageBitmap, {
        mime: 'image/png',
        quality: 1,
        maxWidth: 0,
        background: '#fff',
      }),
    ).rejects.toThrow('图片处理失败');
  });

  test('loadImage prefers createImageBitmap', async () => {
    const bitmap = { width: 20, height: 10 } as ImageBitmap;
    const createImageBitmapMock = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await expect(loadImage(file)).resolves.toBe(bitmap);
    expect(createImageBitmapMock).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
  });

  test('loadImage falls back to HTMLImageElement and reports failures', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => {
      throw new Error('unsupported');
    }));

    HTMLImageElement.prototype.decode = vi.fn(() => Promise.resolve());
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const image = await loadImage(file);
    expect(image).toBeInstanceOf(HTMLImageElement);

    HTMLImageElement.prototype.decode = vi.fn(() => Promise.reject(new Error('broken')));
    await expect(loadImage(file)).rejects.toThrow('图片读取失败');
  });
});
