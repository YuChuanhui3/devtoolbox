import { describe, expect, test, vi } from 'vitest';
import { ToolError } from './errors';
import { tl } from '@/i18n/locale';
import {
  assessQrScan,
  buildQrSvg,
  canvasToPngBlob,
  crispQrRect,
  createQrMatrix,
  maxModuleCountForScan,
  normalizeQrColor,
  normalizeQrSize,
  QR_DEFAULT_STYLE,
  QR_MAX_SIZE,
  QR_MIN_SIZE,
  qrDownloadName,
  qrModuleCssPx,
  qrRects,
  renderQrToCanvas,
  utf8ByteLength,
} from './qr';

function captureError(action: () => unknown): ToolError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ToolError);
    return error as ToolError;
  }
  throw new Error('预期抛出 ToolError，但调用成功返回');
}

describe('createQrMatrix', () => {
  test('encodes text and exposes version and module size', () => {
    const matrix = createQrMatrix('https://example.com/tools/qr-generator', 'M');
    expect(matrix.version).toBeGreaterThanOrEqual(1);
    expect(matrix.moduleCount).toBe(17 + matrix.version * 4);
    expect(matrix.data).toHaveLength(matrix.moduleCount ** 2);
    expect(matrix.charLength).toBe('https://example.com/tools/qr-generator'.length);
    expect(matrix.byteLength).toBe(utf8ByteLength('https://example.com/tools/qr-generator'));
  });

  test('counts UTF-8 bytes for Chinese and emoji', () => {
    const matrix = createQrMatrix('你好，DevToolbox 👋', 'Q');
    expect(matrix.charLength).toBe(16);
    expect(matrix.byteLength).toBe(utf8ByteLength('你好，DevToolbox 👋'));
    expect(matrix.byteLength).toBeGreaterThan(matrix.charLength);
  });

  test('is deterministic for the same input and ECC level', () => {
    const first = createQrMatrix('deterministic payload', 'H');
    const second = createQrMatrix('deterministic payload', 'H');
    expect(second.version).toBe(first.version);
    expect(Array.from(second.data)).toEqual(Array.from(first.data));
  });

  test('rejects empty or whitespace-only input', () => {
    expect(captureError(() => createQrMatrix('', 'M')).message).toContain('请输入');
    expect(captureError(() => createQrMatrix('   \n', 'M')).message).toContain('请输入');
  });

  test('reports a capacity error for long content', () => {
    const error = captureError(() => createQrMatrix('a'.repeat(5000), 'H'));
    expect(error.message).toContain('内容超出二维码容量');
    expect(tl(error.hint!, 'zh')).toContain('5000 字符');
    expect(tl(error.hint!, 'zh')).toContain('L 级容错');
  });

  test('lower ECC levels allow more data than higher levels', () => {
    const payload = 'x'.repeat(2200);
    expect(() => createQrMatrix(payload, 'L')).not.toThrow();
    expect(() => createQrMatrix(payload, 'H')).toThrow(ToolError);
  });
});

describe('buildQrSvg', () => {
  const matrix = createQrMatrix('DevToolbox', 'M');

  test('renders a sized SVG with quiet zone and colors', () => {
    const svg = buildQrSvg(matrix, {
      size: 256,
      ecc: 'M',
      foreground: '#112233',
      background: '#fefefe',
    });
    const total = matrix.moduleCount + 8;
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg).toContain('width="256"');
    expect(svg).toContain('height="256"');
    expect(svg).toContain(`viewBox="0 0 ${total} ${total}"`);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="二维码"');
    expect(svg).toContain('<rect width="');
    expect(svg).toContain('fill="#fefefe"');
    expect(svg).toContain('fill="#112233"');
    expect(svg).toContain('<path d="M');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  test('normalizes colors and clamps the output size', () => {
    const svg = buildQrSvg(matrix, {
      size: 40,
      ecc: 'M',
      foreground: '#ABC',
      background: 'not-a-color',
    });
    expect(svg).toContain('width="128"');
    expect(svg).toContain('fill="#aabbcc"');
    expect(svg).toContain('fill="#ffffff"');
  });

  test('does not include user text in the SVG markup', () => {
    const secret = '<script>alert("xss")</script>';
    const secretMatrix = createQrMatrix(secret, 'M');
    const svg = buildQrSvg(secretMatrix, QR_DEFAULT_STYLE);
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('alert');
  });
});

describe('color and size helpers', () => {
  test('normalizes three and six digit hex colors', () => {
    expect(normalizeQrColor('#ABC', '#000000')).toBe('#aabbcc');
    expect(normalizeQrColor(' #123456 ', '#000000')).toBe('#123456');
    expect(normalizeQrColor('#12345', '#000000')).toBe('#000000');
    expect(normalizeQrColor('rgb(0,0,0)', '#000000')).toBe('#000000');
    expect(normalizeQrColor('#GGGGGG', '#000000')).toBe('#000000');
  });

  test('clamps QR sizes into the supported range', () => {
    expect(normalizeQrSize(10)).toBe(128);
    expect(normalizeQrSize(9999)).toBe(2048);
    expect(normalizeQrSize(Number.NaN)).toBe(512);
    expect(normalizeQrSize(512.4)).toBe(512);
    expect(qrDownloadName(9999, 'png')).toBe('qrcode-2048.png');
    expect(qrDownloadName(512, 'svg')).toBe('qrcode-512.svg');
  });
});

describe('qrRects', () => {
  test('returns bounded rectangles covering all dark runs', () => {
    const matrix = createQrMatrix('https://example.com', 'M');
    const size = 256;
    const rects = qrRects(matrix, size);
    expect(rects.length).toBeGreaterThan(0);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.width).toBeGreaterThanOrEqual(1);
      expect(rect.height).toBeGreaterThanOrEqual(1);
      expect(rect.x + rect.width).toBeLessThanOrEqual(size);
      expect(rect.y + rect.height).toBeLessThanOrEqual(size);
    }
  });
});

describe('canvas export', () => {
  function fakeCanvas(
    context: { fillStyle: string; imageSmoothingEnabled: boolean; fillRect: ReturnType<typeof vi.fn> } | null,
  ): HTMLCanvasElement {
    return {
      width: 0,
      height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
  }

  test('fills the background then each dark run', () => {
    const matrix = createQrMatrix('canvas export', 'M');
    const context = {
      fillStyle: '',
      imageSmoothingEnabled: true,
      fillRect: vi.fn(),
    };
    const canvas = fakeCanvas(context);
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValueOnce(canvas as unknown as HTMLElement);

    try {
      const rendered = renderQrToCanvas(matrix, {
        ...QR_DEFAULT_STYLE,
        size: 256,
        foreground: '#000000',
        background: '#ffffff',
      });
      expect(rendered).toBe(canvas);
      expect(canvas.width).toBe(256);
      expect(canvas.height).toBe(256);
      expect(context.imageSmoothingEnabled).toBe(false);
      expect(context.fillStyle).toBe('#000000');
      expect(context.fillRect).toHaveBeenCalledTimes(qrRects(matrix, 256).length + 1);
      expect(context.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 256, 256);
    } finally {
      createElement.mockRestore();
    }
  });

  test('throws a friendly error without a 2D context', () => {
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValueOnce(fakeCanvas(null) as unknown as HTMLElement);

    try {
      const error = captureError(() =>
        renderQrToCanvas(createQrMatrix('no canvas', 'M'), QR_DEFAULT_STYLE),
      );
      expect(error.message).toContain('Canvas');
      expect(tl(error.hint!, 'zh')).toContain('SVG');
    } finally {
      createElement.mockRestore();
    }
  });

  test('resolves a PNG blob or rejects when export fails', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const success = {
      toBlob: (callback: BlobCallback) => callback(blob),
    } as unknown as HTMLCanvasElement;
    await expect(canvasToPngBlob(success)).resolves.toBe(blob);

    const failure = {
      toBlob: (callback: BlobCallback) => callback(null),
    } as unknown as HTMLCanvasElement;
    await expect(canvasToPngBlob(failure)).rejects.toBeInstanceOf(ToolError);
  });
});

describe('qrModuleCssPx / maxModuleCountForScan', () => {
  test('按显示宽度算每模块像素，与 canvas 后备尺寸无关', () => {
    expect(qrModuleCssPx(117, 320)).toBeCloseTo(2.56, 2); // V25 塞进 320px：密到扫不出
    expect(qrModuleCssPx(177, 320)).toBeCloseTo(1.73, 2); // V40
    expect(qrModuleCssPx(177, 1024)).toBeGreaterThan(qrModuleCssPx(177, 320));
    expect(qrModuleCssPx(21, 0)).toBe(0);
    expect(qrModuleCssPx(21, Number.NaN)).toBe(0);
  });

  test('显示宽度与每模块下限决定容量上限', () => {
    expect(maxModuleCountForScan(320, 4)).toBe(72); // → V13（69 模块）
    expect(maxModuleCountForScan(320, 6)).toBe(45); // → V7（45 模块）
    expect(maxModuleCountForScan(320, 3)).toBe(98); // → V20（97 模块）
    expect(maxModuleCountForScan(700, 4)).toBeGreaterThanOrEqual(165); // → 放映可放到 V37+
    expect(maxModuleCountForScan(0, 4)).toBe(Number.MAX_SAFE_INTEGER);
    expect(maxModuleCountForScan(320, 0)).toBe(Number.MAX_SAFE_INTEGER);
  });

  test('assessQrScan 在达标/恰好低于下限处给出结论', () => {
    const ok = assessQrScan(69, 320, 4);
    expect(ok.totalModules).toBe(77);
    expect(ok.modulePx).toBeCloseTo(320 / 77, 4);
    expect(ok.ok).toBe(true);

    const dense = assessQrScan(73, 320, 4);
    expect(dense.modulePx).toBeLessThan(4);
    expect(dense.ok).toBe(false);

    expect(assessQrScan(69, 0, 4).ok).toBe(false);
  });

  test('同一内容在窄显示宽度下判为不可扫，放宽宽度后通过', () => {
    const matrix = createQrMatrix('a'.repeat(1000), 'M');
    expect(assessQrScan(matrix.moduleCount, 320, 4).ok).toBe(false);
    expect(assessQrScan(matrix.moduleCount, 640, 4).ok).toBe(true);
  });
});

describe('crispQrRect', () => {
  test('格宽取整数，backing 是模块总数的整数倍', () => {
    const total = 117 + 8; // V25
    const { size, cssSize } = crispQrRect(117, 320, 2);
    expect(size % total).toBe(0);
    expect(size / total).toBe(5); // floor(320*2 / 125)
    expect(cssSize * 2).toBeCloseTo(size, 6);
  });

  test('夹在支持的画布尺寸范围内', () => {
    expect(crispQrRect(177, 4096, 3).size).toBeLessThanOrEqual(QR_MAX_SIZE);
    expect(crispQrRect(21, 60, 1).size).toBeGreaterThanOrEqual(QR_MIN_SIZE);
    expect(crispQrRect(21, 60, 1).size % (21 + 8)).toBe(0);
  });

  test('异常 dpr 退回 1 倍', () => {
    expect(crispQrRect(69, 320, 0).size).toBe(crispQrRect(69, 320, 1).size);
    expect(crispQrRect(69, 320, Number.NaN).cssSize).toBe(crispQrRect(69, 320, 1).cssSize);
  });
});
