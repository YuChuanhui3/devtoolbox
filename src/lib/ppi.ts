import { ToolError } from './errors';
import type { L10n } from '@/i18n/locale';

export interface PpiResult {
  ppi: number;
  ppm: number;
  physicalWidthInches: number;
  physicalHeightInches: number;
  aspectRatio: string;
  densityLabel: L10n;
  densityHint: L10n;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function classifyDensity(ppi: number): { label: L10n; hint: L10n } {
  if (ppi < 100) return { label: { zh: '低像素密度（LDPI 级）', en: 'Low pixel density (LDPI class)' }, hint: { zh: '接近早期手机/投影仪水平，文字边缘会有明显颗粒感。', en: 'Similar to early phones and projectors; text edges look grainy.' } };
  if (ppi < 140) return { label: { zh: '标准像素密度（MDPI 级，约 1x）', en: 'Standard pixel density (MDPI class, ~1x)' }, hint: { zh: 'Android 1x 基准区间，普通办公屏常见。', en: 'The Android 1x baseline range, common on office monitors.' } };
  if (ppi < 180) return { label: { zh: '高像素密度（TVDPI~HDPI，约 1.5x）', en: 'High pixel density (TVDPI–HDPI, ~1.5x)' }, hint: { zh: '1080p 的 24 英寸桌面屏大致落在这里。', en: 'Where a 24-inch 1080p desktop monitor lands.' } };
  if (ppi < 260) return { label: { zh: '全高清级（FHD 常用区间）', en: 'Full HD class (typical FHD range)' }, hint: { zh: '24 英寸 1080p、27 英寸 1440p 附近，日常清晰度足够。', en: 'Around 24" 1080p or 27" 1440p; sharp enough for daily use.' } };
  if (ppi < 320) return { label: { zh: '视网膜级（约 2x，QHD 常见）', en: 'Retina class (~2x, typical QHD)' }, hint: { zh: '27 英寸 2K/4K 入门档，近距离观看细腻。', en: 'Entry 2K/4K on a 27-inch panel; fine detail at close range.' } };
  if (ppi < 600) return { label: { zh: '超视网膜级（3x ~ 4x）', en: 'Super retina class (3x–4x)' }, hint: { zh: '手机旗舰与 5K 专业屏区间。', en: 'Flagship phones and 5K professional displays.' } };
  return { label: { zh: '极高密度（VR/微显示级别）', en: 'Extreme density (VR / micro-display class)' }, hint: { zh: '接近 VR 头显单眼分辨率密度级别。', en: 'Approaching per-eye VR headset densities.' } };
}

export function calcPpi(width: number, height: number, diagonalInches: number): PpiResult {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new ToolError(
      { zh: '分辨率必须为正整数', en: 'Resolution must be positive integers' },
      {
        zh: '请输入屏幕的像素宽度和高度，例如 2560 × 1440。',
        en: 'Enter the screen pixel width and height, e.g. 2560 × 1440.',
      },
    );
  }
  if (!Number.isFinite(diagonalInches) || diagonalInches <= 0 || diagonalInches > 200) {
    throw new ToolError(
      { zh: '对角线尺寸无效', en: 'Invalid diagonal size' },
      {
        zh: '请输入 0 ~ 200 英寸之间的屏幕对角线长度。',
        en: 'Enter a screen diagonal length between 0 and 200 inches.',
      },
    );
  }

  const diagonalPixels = Math.sqrt(width ** 2 + height ** 2);
  const ppi = diagonalPixels / diagonalInches;
  const aspect = gcd(width, height);
  const density = classifyDensity(ppi);

  return {
    ppi: Math.round(ppi * 100) / 100,
    ppm: Math.round(ppi * 39.3701 * 100) / 100,
    physicalWidthInches: Math.round(((width / ppi) * 100)) / 100,
    physicalHeightInches: Math.round(((height / ppi) * 100)) / 100,
    aspectRatio: `${width / aspect}:${height / aspect}`,
    densityLabel: density.label,
    densityHint: density.hint,
  };
}
