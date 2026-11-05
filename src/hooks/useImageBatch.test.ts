import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useImageBatch } from './useImageBatch';
import type { CompressOutcome } from '@/lib/image';

vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/i18n/I18nProvider', () => ({ useI18n: () => ({ t: (value: { en: string }) => value.en }) }));
vi.mock('@/lib/image', async (original) => ({ ...await original<object>(), loadImage: vi.fn(async () => ({ width: 1, height: 1 })) }));
afterEach(() => vi.unstubAllGlobals());

describe('batch cancellation', () => {
  it('rejects duplicate starts and prevents late results after clear', async () => {
    const createObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    let finish!: (result: CompressOutcome) => void;
    const handler = vi.fn(() => new Promise<CompressOutcome>((resolve) => { finish = resolve; }));
    const clearSources = vi.fn();
    const { result } = renderHook(() => useImageBatch({
      items: [{ id: 'a', file: new File(['a'], 'a.png'), url: 'blob:a' }],
      setError: vi.fn(), removeSource: vi.fn(), clearSources, resultFilename: (name) => name,
    }));
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.processAll(handler, { success: 'done' });
      await result.current.processAll(handler, { success: 'done' });
    });
    expect(handler).toHaveBeenCalledTimes(1);
    act(() => result.current.clearAll());
    await act(async () => {
      finish({ blob: new Blob(['result']), width: 1, height: 1, mime: 'image/png' });
      await pending;
    });
    expect(result.current.results).toEqual({});
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clearSources).toHaveBeenCalledOnce();
    expect(result.current.isProcessing).toBe(false);
  });
});
