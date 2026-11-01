import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { downloadAll } from '@/lib/download';
import { ToolError, toToolError } from '@/lib/errors';
import { tl } from '@/i18n/locale';
import { useI18n } from '@/i18n/I18nProvider';
import { loadImage, mimeToExtension } from '@/lib/image';
import type { CompressOutcome } from '@/lib/image';
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
    handle: (file: File, bitmap: ImageBitmap | HTMLImageElement) => Promise<CompressOutcome>,
    messages: { success: string },
  ) => Promise<void>;
  cancel: () => void;
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
  const { t } = useI18n();
  const [results, setResults] = useState<Record<string, ProcessedImageResult>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const resultsRef = useRef(results);
  resultsRef.current = results;

  const revokeAll = useCallback(() => {
    Object.values(resultsRef.current).forEach((result) => URL.revokeObjectURL(result.url));
  }, []);

  const mountedRef = useRef(true);
  const cancelledRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      revokeAll();
    };
  }, [revokeAll]);

  const totalOriginal = items.reduce((sum, item) => sum + item.file.size, 0);
  const totalResult = useMemo(
    () => Object.values(results).reduce((sum, result) => sum + result.size, 0),
    [results],
  );

  const processAll = useCallback(
    async (
      handle: (file: File, bitmap: ImageBitmap | HTMLImageElement) => Promise<CompressOutcome>,
      messages: { success: string },
    ) => {
      if (items.length === 0 || isProcessing) return;

      cancelledRef.current = false;
      revokeAll();
      setResults({});
      setIsProcessing(true);
      setProgress(0);
      setError(null);

      let failures = 0;

      for (let index = 0; index < items.length; index += 1) {
        if (cancelledRef.current || !mountedRef.current) break;
        const item = items[index];
        let bitmap: ImageBitmap | HTMLImageElement | null = null;
        try {
          bitmap = await loadImage(item.file);
          if (cancelledRef.current || !mountedRef.current) break;
          const outcome = await handle(item.file, bitmap);
          if (cancelledRef.current || !mountedRef.current) break;

          const result: ProcessedImageResult = {
            id: item.id,
            blob: outcome.blob,
            url: URL.createObjectURL(outcome.blob),
            width: outcome.width,
            height: outcome.height,
            originalWidth: bitmap.width,
            originalHeight: bitmap.height,
            mime: outcome.mime,
            extension: mimeToExtension(outcome.mime),
            size: outcome.blob.size,
            targetMet: outcome.targetMet,
          };
          setResults((current) => ({ ...current, [item.id]: result }));
        } catch (error) {
          if (cancelledRef.current || !mountedRef.current) break;
          failures += 1;
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
        } finally {
          // 解码位图是这批里最贵的资源，无论成败都要释放。
          if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) {
            bitmap.close();
          }
        }
        setProgress(Math.round(((index + 1) / items.length) * 100));
      }

      if (!mountedRef.current) return;
      setIsProcessing(false);
      if (cancelledRef.current) {
        toast.info(t({ zh: '已取消处理', en: 'Processing cancelled' }));
      } else if (failures === 0) {
        toast.success(messages.success);
      } else {
        toast.error(t({ zh: `处理完成，${failures} 个文件失败`, en: `Finished with ${failures} failed files` }));
      }
    },
    [items, isProcessing, revokeAll, setError, toast, t],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

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
    toast.success(t({ zh: `已开始下载 ${payload.length} 张图片`, en: `Downloading ${payload.length} images` }));
  }, [items, results, resultFilename, toast, t]);

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
    cancel,
    removeItem,
    clearAll,
    downloadAllResults,
    buildPreview,
  };
}
