import { describe, expect, test } from 'vitest';
import { ToolError } from './errors';
import {
  BASE64_LINE_LENGTH,
  buildBase64Output,
  detectImageMime,
  imageExtensionForMime,
  imageMimeForFile,
  parseBase64Image,
  readFileAsDataUrl,
  readImageFile,
} from './imageBase64';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64FromBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function captureError(action: () => unknown): ToolError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ToolError);
    return error as ToolError;
  }
  throw new Error('预期抛出 ToolError，但调用成功返回');
}

describe('detectImageMime', () => {
  test('detects supported image signatures', () => {
    expect(detectImageMime(bytesFromBase64(PNG_BASE64))).toBe('image/png');
    expect(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectImageMime(new Uint8Array([...'GIF87a'].map((c) => c.charCodeAt(0))))).toBe(
      'image/gif',
    );
    expect(detectImageMime(new Uint8Array([...'GIF89a'].map((c) => c.charCodeAt(0))))).toBe(
      'image/gif',
    );
    expect(
      detectImageMime(
        new Uint8Array([
          ...'RIFF'.split('').map((c) => c.charCodeAt(0)),
          0,
          0,
          0,
          0,
          ...'WEBP'.split('').map((c) => c.charCodeAt(0)),
        ]),
      ),
    ).toBe('image/webp');
    expect(detectImageMime(new Uint8Array([0x42, 0x4d, 0x00]))).toBe('image/bmp');
  });

  test('returns null for unknown or truncated data', () => {
    expect(detectImageMime(new Uint8Array([...'hello'].map((c) => c.charCodeAt(0))))).toBeNull();
    expect(detectImageMime(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(detectImageMime(new Uint8Array())).toBeNull();
  });
});

describe('parseBase64Image', () => {
  test('parses raw Base64 and produces a canonical Data URI', () => {
    const parsed = parseBase64Image(PNG_BASE64);
    expect(parsed.mime).toBe('image/png');
    expect(parsed.base64).toBe(PNG_BASE64);
    expect(parsed.bytes.length).toBeGreaterThan(20);
    expect(parsed.dataUri).toBe(`data:image/png;base64,${PNG_BASE64}`);
  });

  test('cleans whitespace, quotes and Data URI prefixes', () => {
    const messy = `"DATA:IMAGE/PNG;BASE64, ${PNG_BASE64.slice(0, 24)}
      ${PNG_BASE64.slice(24)}"`;
    const parsed = parseBase64Image(messy);
    expect(parsed.mime).toBe('image/png');
    expect(parsed.base64).toBe(PNG_BASE64);
  });

  test('trusts magic bytes over the declared MIME type', () => {
    const parsed = parseBase64Image(`data:image/jpeg;base64,${PNG_BASE64}`);
    expect(parsed.mime).toBe('image/png');
  });

  test('supports URL-safe Base64 without padding', () => {
    const bytes = new Uint8Array([
      ...bytesFromBase64(PNG_BASE64),
      0xfb,
      0xef,
      0xbe,
    ]);
    const standard = base64FromBytes(bytes);
    const urlSafe = standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const parsed = parseBase64Image(urlSafe);
    expect(parsed.base64).toBe(standard);
    expect(parsed.mime).toBe('image/png');
  });

  test('rejects empty, malformed and unsupported input', () => {
    expect(captureError(() => parseBase64Image('   ')).message).toContain('请输入 Base64');
    expect(captureError(() => parseBase64Image('data:image/png;base64')).message).toContain(
      'Data URL 格式不完整',
    );
    expect(
      captureError(() => parseBase64Image('data:image/png,not-base64')).message,
    ).toContain('仅支持 Base64 编码');
    expect(captureError(() => parseBase64Image('data:image/png;base64,   ')).message).toContain(
      'Base64 内容为空',
    );
    expect(captureError(() => parseBase64Image('!!!!')).message).toContain('非法字符');
    expect(captureError(() => parseBase64Image('A')).message).toContain('解码失败');
    expect(captureError(() => parseBase64Image('aGVsbG8=')).message).toContain('无法识别图片格式');
  });
});

describe('buildBase64Output', () => {
  test('wraps Base64 at 76 columns with a Data URI prefix by default', () => {
    const raw = 'A'.repeat(BASE64_LINE_LENGTH + 4);
    expect(buildBase64Output(raw, 'image/png')).toBe(
      `data:image/png;base64,${'A'.repeat(BASE64_LINE_LENGTH)}\nAAAA`,
    );
  });

  test('supports raw and single-line output', () => {
    const raw = 'A'.repeat(BASE64_LINE_LENGTH + 4);
    expect(buildBase64Output(raw, 'image/png', { singleLine: true })).toBe(
      `data:image/png;base64,${raw}`,
    );
    expect(
      buildBase64Output(raw, 'image/jpeg', { includeDataUri: false, singleLine: true }),
    ).toBe(raw);
    expect(buildBase64Output('A'.repeat(BASE64_LINE_LENGTH), 'image/png')).toBe(
      `data:image/png;base64,${'A'.repeat(BASE64_LINE_LENGTH)}`,
    );
  });
});

describe('image MIME helpers', () => {
  test('maps MIME types to download extensions', () => {
    expect(imageExtensionForMime('image/png')).toBe('png');
    expect(imageExtensionForMime('image/jpeg')).toBe('jpg');
    expect(imageExtensionForMime('image/webp')).toBe('webp');
    expect(imageExtensionForMime('image/gif')).toBe('gif');
    expect(imageExtensionForMime('image/bmp')).toBe('bmp');
    expect(imageExtensionForMime('image/avif')).toBe('bin');
  });

  test('infers a file MIME type from its type or extension', () => {
    expect(imageMimeForFile(new File(['x'], 'a.webp', { type: 'image/webp' }))).toBe('image/webp');
    expect(imageMimeForFile(new File(['x'], 'b.JPEG', { type: '' }))).toBe('image/jpeg');
    expect(imageMimeForFile(new File(['x'], 'c.bmp', { type: 'text/plain' }))).toBe('image/bmp');
    expect(imageMimeForFile(new File(['x'], 'd.unknown', { type: '' }))).toBe(
      'application/octet-stream',
    );
  });
});

describe('file reading', () => {
  test('reads a file as a Data URL and reports completion progress', async () => {
    const progress: number[] = [];
    const dataUrl = await readFileAsDataUrl(
      new File(['hello'], 'note.txt', { type: 'text/plain' }),
      (percent) => progress.push(percent),
    );
    expect(dataUrl).toBe('data:text/plain;base64,aGVsbG8=');
    expect(progress.at(-1)).toBe(100);
  });

  test('extracts Base64 and infers an image MIME type', async () => {
    const result = await readImageFile(new File(['fake-png'], 'photo.PNG', { type: '' }));
    expect(result.base64).toBe('ZmFrZS1wbmc=');
    expect(result.mime).toBe('image/png');
    expect(result.dataUrl.startsWith('data:')).toBe(true);
  });

  test('rejects an empty image file', async () => {
    await expect(
      readImageFile(new File([], 'empty.png', { type: 'image/png' })),
    ).rejects.toThrow('图片内容为空');
  });
});
