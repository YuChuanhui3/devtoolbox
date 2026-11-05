import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useImageFiles } from './useImageFiles';
import { MAX_IMAGE_COUNT } from '@/lib/image';

afterEach(() => vi.unstubAllGlobals());

describe('image file lifecycle', () => {
  it('releases rejected previews and handles consecutive additions before rendering', () => {
    let sequence = 0;
    const revokeObjectURL = vi.fn();
    const createObjectURL = vi.fn(() => `blob:test-${++sequence}`);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const { result, unmount } = renderHook(() => useImageFiles());
    const file = new File(['image'], 'sample.png', { type: 'image/png' });
    act(() => {
      result.current.addFiles(Array(MAX_IMAGE_COUNT).fill(file));
      result.current.addFiles([file]);
    });
    expect(result.current.items).toHaveLength(MAX_IMAGE_COUNT);
    expect(result.current.error).not.toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith(`blob:test-${MAX_IMAGE_COUNT + 1}`);
    act(() => result.current.clearItems());
    expect(revokeObjectURL).toHaveBeenCalledTimes(MAX_IMAGE_COUNT + 1);
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(MAX_IMAGE_COUNT + 1);
  });
});
