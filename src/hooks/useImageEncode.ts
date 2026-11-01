import { useCallback, useEffect, useRef, useState } from 'react';
import { ToolError, toToolError } from '@/lib/errors';
import { loadImage, validateImageFile } from '@/lib/image';
import { readImageFile } from '@/lib/imageBase64';

export interface EncodeSource {
  file: File;
  previewUrl: string;
  base64: string;
  mime: string;
  width: number;
  height: number;
}

export interface UseImageEncode {
  source: EncodeSource | null;
  error: ToolError | null;
  /** 0-100 读取进度；null 表示空闲。 */
  progress: number | null;
  handleFiles: (fileList: FileList | File[]) => Promise<void>;
  clear: () => void;
}

/** 图片 → Base64 的编码状态机：请求失效、预览 Object URL 生命周期都收在这里。 */
export function useImageEncode({ pasteEnabled = false }: { pasteEnabled?: boolean } = {}): UseImageEncode {
  const [source, setSource] = useState<EncodeSource | null>(null);
  const [error, setError] = useState<ToolError | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const file = Array.from(fileList)[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (validation) {
      setError(validation);
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setError(null);
    setProgress(0);

    const previewUrl = URL.createObjectURL(file);
    try {
      const [read, image] = await Promise.all([
        readImageFile(file, (percent) => {
          if (requestRef.current === requestId) setProgress(percent);
        }),
        loadImage(file),
      ]);
      const width = image.width;
      const height = image.height;
      if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
        image.close();
      }
      if (requestRef.current !== requestId) {
        URL.revokeObjectURL(previewUrl);
        return;
      }

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = previewUrl;
      setSource({ file, previewUrl, base64: read.base64, mime: read.mime, width, height });
      setProgress(null);
    } catch (caught) {
      URL.revokeObjectURL(previewUrl);
      if (requestRef.current !== requestId) return;
      setError(toToolError(caught));
      setProgress(null);
    }
  }, []);

  useEffect(() => {
    if (!pasteEnabled) return;
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find(
        (item) => item.kind === 'file' && item.type.startsWith('image/'),
      );
      const file = imageItem?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void handleFiles([file]);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [pasteEnabled, handleFiles]);

  const clear = useCallback(() => {
    requestRef.current += 1;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setSource(null);
    setError(null);
    setProgress(null);
  }, []);

  return { source, error, progress, handleFiles, clear };
}
