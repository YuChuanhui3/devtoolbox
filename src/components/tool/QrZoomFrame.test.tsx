import { beforeEach, describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { useAppStore } from '@/store/appStore';
import { buildQrSvg, createQrMatrix, maxModuleCountForScan, QR_DEFAULT_STYLE } from '@/lib/qr';
import { QrZoomFrame } from './QrZoomFrame';

/** 真实生成 SVG：矢量码不需要 canvas，密度读数也就不会被 mock 骗过去。 */
function renderBoard(text: string, inlineWidth = 240) {
  const matrix = createQrMatrix(text, 'L');
  return {
    matrix,
    ...render(
      <I18nProvider>
        <QrZoomFrame
          svg={buildQrSvg(matrix, { ...QR_DEFAULT_STYLE, ecc: 'L', size: inlineWidth })}
          moduleCount={matrix.moduleCount}
          inlineWidth={inlineWidth}
          remedy={{ zh: '改用分帧传输。', en: 'or split it into frames.' }}
        />
      </I18nProvider>,
    ),
  };
}

beforeEach(() => {
  useAppStore.setState({ locale: 'zh' });
});

describe('QrZoomFrame', () => {
  test('稀疏码按行内宽度报告够扫', () => {
    const { matrix } = renderBoard('https://example.com');
    expect(matrix.moduleCount).toBeLessThanOrEqual(maxModuleCountForScan(240, 4));
    expect(screen.getByText(/每模块 \d+\.\d\dpx，高于 4px，够扫/)).toBeInTheDocument();
  });

  test('密度不够时给出实测像素而不是版本号猜测', () => {
    // 400 字符在 L 级下超过 240px 的模块预算（52 模块），旧的 version>=20 判断对此完全沉默
    const { matrix } = renderBoard('A'.repeat(400));
    expect(matrix.moduleCount).toBeGreaterThan(maxModuleCountForScan(240, 4));
    expect(screen.getByText(/每模块只有 \d+\.\d\dpx（需要 ≥4px）/)).toHaveClass('text-warn');
    expect(screen.getByText(/改用分帧传输/)).toBeInTheDocument();
  });

  test('放大后按全屏宽度重算密度，Esc 关闭', () => {
    renderBoard('A'.repeat(400));
    expect(screen.getAllByRole('img')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // jsdom 视口 1024×768 → 放大舞台 672px，同一张码在这里是达标的
    expect(screen.getByText(/每模块 \d+\.\d\dpx · 对准摄像头/)).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
