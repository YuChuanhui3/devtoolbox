import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { useDqxSession } from '@/hooks/useDqxSession';
import { useAppStore } from '@/store/appStore';
import { maxModuleCountForScan } from '@/lib/qr';
import { QrTransferPanel } from './QrTransferPanel';

// jsdom 没有 2D canvas：只替掉像素绘制，版本/密度/切帧仍走真实实现
vi.mock('@/lib/qr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/qr')>();
  return {
    ...actual,
    renderQrToCanvas: (_matrix: Parameters<typeof actual.renderQrToCanvas>[0], style: Parameters<typeof actual.renderQrToCanvas>[1]) =>
      ({ width: style.size, height: style.size, getContext: () => null }) as unknown as HTMLCanvasElement,
  };
});

// 重压图片同样要 canvas：把解码/编码换成可控产物，好让「切帧吃重压后的字节」这件事可断言
const fakeEncode = vi.hoisted(() => ({ bytes: 210_000 }));
vi.mock('@/lib/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/image')>();
  return {
    ...actual,
    loadImage: async (file: File) => ({ width: file.size, height: 1 }) as unknown as ImageBitmap,
    compressImage: async () => ({
      blob: new Blob([new Uint8Array(fakeEncode.bytes).fill(7)], { type: 'image/jpeg' }),
      width: 1600,
      height: 1200,
      mime: 'image/jpeg',
    }),
  };
});

function Harness({ initialDirection }: { initialDirection?: 'send' | 'receive' }) {
  const session = useDqxSession();
  return (
    <I18nProvider>
      <ToastProvider>
        <QrTransferPanel active session={session} initialDirection={initialDirection} />
      </ToastProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  useAppStore.setState({ locale: 'zh' });
});

describe('QrTransferPanel', () => {
  test('keeps send and receive under one tab and explains DQX1', () => {
    render(<Harness />);
    expect(screen.getByText('发送内容')).toBeVisible();
    expect(screen.getByText(/DQX1 是传输协议/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '接收' }));
    expect(screen.getByText('摄像头扫码')).toBeVisible();
    expect(screen.getByText('发送内容')).not.toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: '发送' }));
    expect(screen.getByText('发送内容')).toBeVisible();
  });

  test('honours legacy receive links', () => {
    render(<Harness initialDirection="receive" />);
    expect(screen.getByRole('tab', { name: '接收' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('摄像头扫码')).toBeVisible();
  });
});

/** 压缩后仍有 ~2KB 的伪随机文本：足够把每帧容量顶到密度上限。 */
const LONG_TEXT = Array.from(
  { length: 700 },
  (_, i) => `item${i},v-${((i * 2654435761) % 9973).toString(36)}`,
).join('\n');

function statValue(label: string): string {
  const cell = screen.getByText(label).parentElement;
  return (cell?.textContent ?? '').replace(label, '').trim();
}

function sessionSid(): string {
  return /会话 ([0-9a-z]{6})/.exec(screen.getAllByText(/会话 [0-9a-z]{6}/)[0].textContent ?? '')?.[1] ?? '';
}

async function typePayload() {
  fireEvent.change(screen.getByPlaceholderText(/粘贴要传输/), { target: { value: LONG_TEXT } });
  await waitFor(() => expect(screen.getByText('帧数')).toBeInTheDocument());
}

/** 走真实的手选文件路径（ImageDropzone → onFiles → arrayBuffer），内容换成给定的头部 + 指定大小的随机字节。 */
async function dropFile(name: string, mime: string, bytes: number, head: number[] = []) {
  fireEvent.click(screen.getByRole('tab', { name: '文件' }));
  const input = document.querySelector<HTMLInputElement>('input[type=file]');
  expect(input).not.toBeNull();
  const body = new Uint8Array(Math.max(0, bytes - head.length));
  // crypto.getRandomValues 单次上限 64KB，且测试要可复现：自己填伪随机
  let state = 0x9e3779b9;
  for (let i = 0; i < body.length; i += 1) {
    state = Math.imul(state ^ (state >>> 15), 0x85ebca6b) >>> 0;
    body[i] = (state ^ (state >>> 13)) & 0xff;
  }
  body.set(Uint8Array.from(head));
  fireEvent.change(input as HTMLInputElement, { target: { files: [new File([body], name, { type: mime })] } });
  await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());
}

const dropImage = (name: string, bytes: number) => dropFile(name, 'image/jpeg', bytes);

/** 载荷类型的哨兵靠头部魔术号，所以给容器文件造一个 ZIP 头。 */
const dropContainer = (name: string, bytes: number) => dropFile(name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes, [0x50, 0x4b, 0x03, 0x04]);

describe('SendPanel 密度预算', () => {
  test('标准档按行内显示宽度切帧：每模块像素守住下限', async () => {
    render(<Harness />);
    await typePayload();
    // 旧实现按 canvas 后备像素算预算，行内舞台会被顶到 V25（每模块 ~2.6px，扫不出来）
    expect(parseFloat(statValue('模块'))).toBeGreaterThanOrEqual(4);
    const version = Number(statValue('版本').replace('V', ''));
    const cap = maxModuleCountForScan(368, 4);
    expect(4 * version + 17).toBeLessThanOrEqual(cap);
  });

  test('放映换用更宽的舞台：重开会话、每帧更大、帧数更少', async () => {
    render(<Harness />);
    await typePayload();
    const before = sessionSid();
    const framesBefore = Number(statValue('帧数'));

    fireEvent.click(screen.getByRole('button', { name: '放映' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(sessionSid()).not.toBe(before));

    expect(Number(statValue('帧数'))).toBeLessThan(framesBefore);
    expect(parseFloat(statValue('模块'))).toBeGreaterThanOrEqual(4);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('帧数顶到接收端上限时拦住播放，并给出减帧出路', async () => {
    render(<Harness />);
    // 稳妥档行内舞台每帧只装 ~60B：400KB 会切出六千多帧，越过 DQX_LIMITS.maxTotalFrames
    fireEvent.click(screen.getByRole('tab', { name: /稳妥/ }));
    const gzipBox = screen.getByRole('checkbox', { name: /Gzip/ });
    if ((gzipBox as HTMLInputElement).checked) fireEvent.click(gzipBox);
    fireEvent.change(screen.getByPlaceholderText(/粘贴要传输/), { target: { value: 'x'.repeat(400_000) } });

    await waitFor(() => expect(screen.getByText(/超过接收端上限 2000/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '播放' })).toBeDisabled();
    // 出路要写在报警里，而且「放映」这步此刻还点得到
    expect(screen.getByText(/②点「放映」/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '放映' })).toBeEnabled();
  });
});

describe('SendPanel 图片重压', () => {
  test('拖入图片时默认重压：切帧吃重压后的字节，也不再白跑一遍 gzip', async () => {
    fakeEncode.bytes = 210_000;
    render(<Harness />);
    await dropImage('photo.jpg', 900_000);

    // 默认不是「原图」，也不是最费的均衡档：重压才是省帧的正解
    const trigger = screen.getByRole('combobox', { name: '图片重压' });
    expect(trigger.textContent).toContain('省帧数');
    await waitFor(() => expect(statValue('载荷')).toBe('205 KiB'));
    expect(screen.getByRole('checkbox', { name: /已重压/ })).toBeDisabled();

    fireEvent.click(trigger);
    expect(await screen.findByText('原图（帧数最多）')).toBeInTheDocument();
  });

  test('重压反而变大就退回原图，宁可少送字节', async () => {
    fakeEncode.bytes = 60_000;
    render(<Harness />);
    await dropImage('tiny.jpg', 20_000);

    await waitFor(() => expect(screen.getByText(/按原图发送/)).toBeInTheDocument());
    // 回退后走的是原图字节，Gzip 也重新可选（占位字节全 0，压完只剩几十 B，所以先关掉）
    const gzipBox = screen.getByRole('checkbox', { name: 'Gzip 压缩' });
    expect(gzipBox).toBeEnabled();
    fireEvent.click(gzipBox);
    expect(statValue('载荷')).toBe('20 KiB');
  });
});

describe('SendPanel 载荷类型提示', () => {
  const JSON_TEXT = JSON.stringify({ rows: Array.from({ length: 1200 }, (_, i) => ({ id: i, name: `客户-${i}` })) });

  test('文本 + Gzip：把实测比例摆在明面上，勾选项不再重复吹数字', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText(/粘贴要传输/), { target: { value: JSON_TEXT } });

    await waitFor(() => expect(screen.getByText(/文本 Gzip 实测/)).toBeInTheDocument());
    expect(screen.getByText(/文本 Gzip 实测.*（−\d+%）/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Gzip 压缩' })).toBeInTheDocument();
    // 扫多久比「多少帧」更能劝退人：读数要按 fps 折算成时间
    expect(statValue('预计耗时')).toMatch(/\d+(\.\d)? (秒|分)/);
  });

  test('文本没勾 Gzip：给的是经验值，不是实测', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Gzip 压缩/ }));
    fireEvent.change(screen.getByPlaceholderText(/粘贴要传输/), { target: { value: JSON_TEXT } });

    await waitFor(() => expect(screen.getByText(/勾上 Gzip 实测能省 80-86%/)).toBeInTheDocument());
    expect(screen.queryByText(/文本 Gzip 实测/)).not.toBeInTheDocument();
  });

  test('zip / Office 容器：照实报「内部已经压过」，涨了也不藏着', async () => {
    render(<Harness />);
    await dropContainer('book.xlsx', 60_000);

    await waitFor(() => expect(screen.getByText(/容器内部已经压过，Gzip 实测/)).toBeInTheDocument());
  });
});
