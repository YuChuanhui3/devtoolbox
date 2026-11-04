import { afterEach, describe, expect, test, vi } from 'vitest';
import { startLiveQr, type LiveQrStats } from '@/lib/live-qr';

const jsQrMock = vi.fn();
vi.mock('jsqr', () => ({ default: (...args: unknown[]) => jsQrMock(...args) }));
// 第二引擎真实解码在测试里只会拖慢循环：这里只关心「抛错不中断」
vi.mock('@zxing/browser', () => ({
  BrowserQRCodeReader: class {
    decodeFromCanvas(): never {
      throw new Error('zxing stub');
    }
  },
}));

function fakeVideo(width = 96, height = 72) {
  return {
    videoWidth: width,
    videoHeight: height,
    readyState: 4,
    srcObject: null,
    paused: false,
    play: vi.fn(() => Promise.resolve()),
    setAttribute: vi.fn(),
  } as unknown as HTMLVideoElement & { videoWidth: number; readyState: number };
}

/** 第 1 次 drawImage 抛 InvalidStateError，之后正常：正是旧实现当场停摆的那一步。 */
function stubCanvas(size: number) {
  let draws = 0;
  const context = {
    drawImage: vi.fn(() => {
      draws += 1;
      if (draws === 1) throw new DOMException('The video is not ready', 'InvalidStateError');
    }),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(size) })),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  return context;
}

function stubCamera() {
  const stop = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop }] }) },
    configurable: true,
  });
  return stop;
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

afterEach(() => {
  vi.restoreAllMocks();
  jsQrMock.mockReset();
});

describe('startLiveQr', () => {
  test('单帧解码抛错只作废那一帧，循环继续且错误可见', async () => {
    stubCamera();
    stubCanvas(96 * 72 * 4);
    let calls = 0;
    jsQrMock.mockImplementation(() => {
      calls += 1;
      return calls === 3 ? { data: 'DQX1:abc123::0of1:AAAA:01234567' } : null;
    });

    const onText = vi.fn();
    const stats: LiveQrStats[] = [];
    const stop = await startLiveQr({ video: fakeVideo(), onText, onStats: (next) => stats.push(next), intervalMs: 4 });
    await wait(150);
    stop();

    // 旧实现（zxing 自管循环）在第 1 帧抛错后就拆掉流并永久停扫，这里必须继续跑到读到码
    expect(stats.some((item) => item.lastError?.includes('InvalidStateError'))).toBe(true);
    expect(onText).toHaveBeenCalledTimes(1);
    expect(stats[stats.length - 1].hits).toBe(1);
    expect(stats[stats.length - 1].attempts).toBeGreaterThan(3);
  });

  test('画面中途消失时报 stalled，而不是停止扫描', async () => {
    stubCamera();
    stubCanvas(96 * 72 * 4);
    jsQrMock.mockReturnValue(null);
    const video = fakeVideo();

    const stats: LiveQrStats[] = [];
    const stop = await startLiveQr({ video, onText: () => {}, onStats: (next) => stats.push(next), intervalMs: 4 });
    await wait(30);
    video.videoWidth = 0;
    video.readyState = 0;
    await wait(80);
    stop();

    expect(stats.some((item) => !item.stalled)).toBe(true);
    expect(stats[stats.length - 1].stalled).toBe(true);
    expect(stats[stats.length - 1].attempts).toBeGreaterThan(3);
  });

  test('stop 之后停止解码并释放摄像头', async () => {
    const release = stubCamera();
    stubCanvas(96 * 72 * 4);
    jsQrMock.mockReturnValue(null);

    const stats: LiveQrStats[] = [];
    const stop = await startLiveQr({ video: fakeVideo(), onText: () => {}, onStats: (next) => stats.push(next), intervalMs: 4 });
    await wait(30);
    stop();
    const attempts = stats[stats.length - 1].attempts;
    await wait(60);

    expect(stats[stats.length - 1].attempts).toBe(attempts);
    expect(release).toHaveBeenCalled();
  });
});

describe('startLiveQr 取摄像头', () => {
  test('高分辨率约束被拒时退回默认档位', async () => {
    const stream = { getTracks: () => [{ stop: vi.fn() }] };
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('unsatisfied', 'OverconstrainedError'))
      .mockResolvedValueOnce(stream);
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    stubCanvas(96 * 72 * 4);
    jsQrMock.mockReturnValue(null);

    const stop = await startLiveQr({ video: fakeVideo(), onText: () => {}, intervalMs: 4 });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    stop();
  });

  test('权限被拒时给出可执行的提示而不是静默无反应', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
      configurable: true,
    });
    await expect(startLiveQr({ video: fakeVideo(), onText: () => {} })).rejects.toThrow('摄像头权限被拒绝');
  });

  test('页面没有 mediaDevices（HTTP 局域网）时提示退回兜底路径', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    await expect(startLiveQr({ video: fakeVideo(), onText: () => {} })).rejects.toThrow('摄像头不可用');
  });
});
