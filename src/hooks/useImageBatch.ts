import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { downloadAll } from '@/lib/download';
import { ToolError, toToolError } from '@/lib/errors';
import { tl } from '@/i18n/locale';
import { loadImage, mimeToExtension, processImage } from '@/lib/image';
import type { ProcessImageOptions } from '@/lib/image';
import type { ImageFileItem } from '@/hooks/useImageFiles';
import type { ImagePreviewState, ProcessedImageResult } from '@/types/image';

export interface ImageBatchConfig {
  /** 待处理文件列表，来自 useImageFiles。 */
  items: ImageFileItem[];
  setError: (error: ToolError | null) => void;
  /** 结果被移除/清空时同步清理源文件列表。 */
  removeSource: (id: string) => void;
  clearSources: () => void;
  /** 下载与预览用的结果文件名，两个工具命名规则不同（压缩会追加 -compressed）。 */
  resultFilename: (sourceName: string, result: ProcessedImageResult) => string;
}

export interface ImageBatch {
  results: Record<string, ProcessedImageResult>;
  isProcessing: boolean;
  progress: number;
  totalOriginal: number;
  totalResult: number;
  processAll: (
    resolveOptions: (file: File) => ProcessImageOptions,
    messages: { success: string },
  ) => Promise<void>;
  removeItem: (id: string) => void;
  clearAll: () => void;
  downloadAllResults: () => Promise<void>;
  buildPreview: (item: ImageFileItem, result: ProcessedImageResult) => ImagePreviewState;
}

/**
 * 图片批处理管线的共享状态：结果表、进度、以及 Object URL 的创建与释放。
 *
 * Object URL 的生命周期集中在这里，是因为逐个结果都持有一个指向大 Blob 的 URL，
 * 散落在各工具里极易漏 revoke 而让整张原图常驻内存。
 */
export function useImageBatch({
  items,
  setError,
  removeSource,
  clearSources,
  resultFilename,
}: ImageBatchConfig): ImageBatch {
  const toast = useToast();
  const [results, setResults] = useState<Record<string, ProcessedImageResult>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const resultsRef = useRef(results);
  resultsRef.current = results;

  const revokeAll = useCallback(() => {
    Object.values(resultsRef.current).forEach((result) => URL.revokeObjectURL(result.url));
  }, []);

  useEffect(() => revokeAll, [revokeAll]);

  const totalOriginal = items.reduce((sum, item) => sum + item.file.size, 0);
  const totalResult = useMemo(
    () => Object.values(results).reduce((sum, result) => sum + result.size, 0),
    [results],
  );

  const processAll = useCallback(
    async (
      resolveOptions: (file: File) => ProcessImageOptions,
      messages: { success: string },
    ) => {
      if (items.length === 0 || isProcessing) return;

      revokeAll();
      setResults({});
      setIsProcessing(true);
      setProgress(0);
      setError(null);

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        try {
          const bitmap = await loadImage(item.file);
          const options = resolveOptions(item.file);
          const processed = await processImage(bitmap, options);

          const originalWidth = bitmap.width;
          const originalHeight = bitmap.height;
          if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) {
            bitmap.close();
          }

          const result: ProcessedImageResult = {
            id: item.id,
            blob: processed.blob,
            url: URL.createObjectURL(processed.blob),
            width: processed.width,
            height: processed.height,
            originalWidth,
            originalHeight,
            mime: options.mime,
            extension: mimeToExtension(options.mime),
            size: processed.blob.size,
          };
          setResults((current) => ({ ...current, [item.id]: result }));
        } catch (error) {
          const toolError = toToolError(error);
          // 批处理要指明是哪个文件失败；底层 ToolError 的 hint（如 Canvas 不支持）不能丢。
          setError(
            new ToolError(
              {
                zh: `${item.file.name}：${toolError.message}`,
                en: `${item.file.name}: ${tl(toolError.localized, 'en')}`,
              },
              toolError.hint,
            ),
          );
        }
        setProgress(Math.round(((index + 1) / items.length) * 100));
      }

      setIsProcessing(false);
      toast.success(messages.success);
    },
    [items, isProcessing, revokeAll, setError, toast],
  );

  const removeItem = useCallback(
    (id: string) => {
      const result = results[id];
      if (result) {
        URL.revokeObjectURL(result.url);
        setResults((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
      removeSource(id);
    },
    [results, removeSource],
  );

  const clearAll = useCallback(() => {
    revokeAll();
    setResults({});
    clearSources();
    setProgress(0);
  }, [revokeAll, clearSources]);

  const downloadAllResults = useCallback(async () => {
    const payload = items
      .map((item) => {
        const result = results[item.id];
        if (!result) return null;
        return { filename: resultFilename(item.file.name, result), blob: result.blob };
      })
      .filter((entry): entry is { filename: string; blob: Blob } => Boolean(entry));

    if (payload.length === 0) return;
    await downloadAll(payload);
    toast.success(`已开始下载 ${payload.length} 张图片`);
  }, [items, results, resultFilename, toast]);

  const buildPreview = useCallback(
    (item: ImageFileItem, result: ProcessedImageResult): ImagePreviewState => ({
      originalUrl: item.url,
      originalName: item.file.name,
      originalSize: item.file.size,
      originalBlob: item.file,
      originalWidth: result.originalWidth,
      originalHeight: result.originalHeight,
      resultUrl: result.url,
      resultName: resultFilename(item.file.name, result),
      resultBlob: result.blob,
      resultSize: result.size,
      resultWidth: result.width,
      resultHeight: result.height,
    }),
    [resultFilename],
  );

  return {
    results,
    isProcessing,
    progress,
    totalOriginal,
    totalResult,
    processAll,
    removeItem,
    clearAll,
    downloadAllResults,
    buildPreview,
  };
}
