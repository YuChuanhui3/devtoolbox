import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_IMAGE_COUNT, validateImageFile } from '@/lib/image';
import { ToolError } from '@/lib/errors';

export interface ImageFileItem {
  id: string;
  file: File;
  url: string;
}

export interface UseImageFilesResult {
  items: ImageFileItem[];
  error: ToolError | null;
  setError: (error: ToolError | null) => void;
  addFiles: (files: FileList | File[]) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
}

let sequence = 0;

export function useImageFiles(): UseImageFilesResult {
  const [items, setItems] = useState<ImageFileItem[]>([]);
  const [error, setError] = useState<ToolError | null>(null);
  const itemsRef = useRef<ImageFileItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;

    const errors: ToolError[] = [];
    const valid: ImageFileItem[] = [];

    for (const file of incoming) {
      const validation = validateImageFile(file);
      if (validation) {
        errors.push(validation);
        continue;
      }
      sequence += 1;
      valid.push({
        id: `image-${Date.now()}-${sequence}`,
        file,
        url: URL.createObjectURL(file),
      });
    }

    const remaining = Math.max(0, MAX_IMAGE_COUNT - itemsRef.current.length);
    const accepted = valid.slice(0, remaining);
    valid.slice(remaining).forEach((item) => URL.revokeObjectURL(item.url));
    if (valid.length > remaining) {
      errors.push(new ToolError({
        zh: `最多同时处理 ${MAX_IMAGE_COUNT} 张图片，超出的文件已被忽略。`,
        en: `At most ${MAX_IMAGE_COUNT} images can be processed at a time; the extra files were ignored.`,
      }));
    }
    itemsRef.current = [...itemsRef.current, ...accepted];
    setItems(itemsRef.current);

    setError(errors[0] ?? null);
  }, []);

  const removeItem = useCallback((id: string) => {
    const target = itemsRef.current.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.url);
    itemsRef.current = itemsRef.current.filter((item) => item.id !== id);
    setItems(itemsRef.current);
  }, []);

  const clearItems = useCallback(() => {
    itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    itemsRef.current = [];
    setItems([]);
    setError(null);
  }, []);

  return { items, error, setError, addFiles, removeItem, clearItems };
}
