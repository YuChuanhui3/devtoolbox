export interface ProcessedImageResult {
  id: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  mime: string;
  extension: string;
  size: number;
  /** 目标大小模式：是否达成目标体积。 */
  targetMet?: boolean;
}

export interface ImagePreviewState {
  originalUrl: string;
  originalName: string;
  originalSize: number;
  originalBlob: Blob;
  resultUrl: string;
  resultName: string;
  resultBlob: Blob;
  resultSize: number;
  originalWidth: number;
  originalHeight: number;
  resultWidth: number;
  resultHeight: number;
}
