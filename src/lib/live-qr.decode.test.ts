import { describe, expect, test, vi } from 'vitest';
import { startLiveQr } from '@/lib/live-qr';
import { createQrMatrix } from '@/lib/qr';
import { makeSessionId, splitFrames } from '@/lib/qr-transfer';

/** 把二维码点阵画成 RGBA（白底黑码 + 4 格静区），scale 即每模块像素。 */
function raster(matrix: { moduleCount: number; data: Uint8Array }, scale: number) {
  const side = (matrix.moduleCount + 8) * scale;
  const buf = new Uint8ClampedArray(side * side * 4);
  buf.fill(255);
  for (let y = 0; y < matrix.moduleCount; y += 1) {
    for (let x = 0; x < matrix.moduleCount; x += 1) {
      if (!matrix.data[y * matrix.moduleCount + x]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const p = (((y + 4) * scale + dy) * side + (x + 4) * scale + dx) * 4;
          buf[p] = 0;
          buf[p + 1] = 0;
          buf[p + 2] = 0;
        }
      }
    }
  }
  return { buf, side };
}

function stubFeed(side: number, buf: Uint8ClampedArray) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: vi.fn() }] }) },
    configurable: true,
  });
  const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: buf })) };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  return {
    videoWidth: side,
    videoHeight: side,
    readyState: 4,
    srcObject: null,
    paused: false,
    play: () => Promise.resolve(),
    setAttribute: () => {},
  } as unknown as HTMLVideoElement;
}

describe('startLiveQr 真实解码', () => {
  test('读得出发送端切出的 DQX 帧', async () => {
    const sid = makeSessionId();
    const payload = new TextEncoder().encode(
      Array.from({ length: 700 }, (_, i) => `item${i},v-${((i * 2654435761) % 9973).toString(36)}`).join('\n'),
    );
    const frame = splitFrames(payload.slice(0, 2400), { sid, frameBytes: 300 }).frames[0];
    // 每模块 4px：对应行内舞台守住的最低密度
    const { buf, side } = raster(createQrMatrix(frame, 'M'), 4);

    const onText = vi.fn();
    const stop = await startLiveQr({ video: stubFeed(side, buf), onText, intervalMs: 4 });
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    stop();

    expect(onText).toHaveBeenCalledWith(frame);
  });
});
