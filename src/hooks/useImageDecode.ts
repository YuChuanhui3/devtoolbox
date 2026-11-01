import { useCallback, useEffect, useState } from 'react';
import { ToolError, toToolError } from '@/lib/errors';
import { parseBase64Image } from '@/lib/imageBase64';

export interface DecodedImage {
  base64: string;
  bytes: Uint8Array;
  dataUri: string;
  mime: string;
  width: number;
  height: number;
}

export interface UseImageDecode {
  input: string;
  setInput: (value: string) => void;
  decoded: DecodedImage | null;
  error: ToolError | null;
  busy: boolean;
  clear: () => void;
}

const DECODE_DEBOUNCE_MS = 300;

/** Base64 → 图片的解码状态：防抖解析、用 Image 解码验证尺寸、过期结果丢弃。 */
export function useImageDecode(): UseImageDecode {
  const [input, setInput] = useState('');
  const [decoded, setDecoded] = useState<DecodedImage | null>(null);
  const [error, setError] = useState<ToolError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const raw = input.trim();
    if (!raw) {
      setDecoded(null);
      setError(null);
      setBusy(false);
      return;
    }

    let cancelled = false;
    setBusy(true);
    setError(null);

    const timer = window.setTimeout(() => {
      try {
        const parsed = parseBase64Image(raw);
        const image = new Image();
        image.onload = () => {
          if (cancelled) return;
          setDecoded({
            base64: parsed.base64,
            bytes: parsed.bytes,
            dataUri: parsed.dataUri,
            mime: parsed.mime,
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
          setBusy(false);
        };
        image.onerror = () => {
          if (cancelled) return;
          setDecoded(null);
          setError(
            new ToolError(
              { zh: '图片预览失败', en: 'Image preview failed' },
              {
                zh: 'Base64 数据可能损坏，浏览器无法解码该图片。',
                en: 'The Base64 data may be corrupted; the browser cannot decode this image.',
              },
            ),
          );
          setBusy(false);
        };
        image.src = parsed.dataUri;
      } catch (caught) {
        if (cancelled) return;
        setDecoded(null);
        setError(toToolError(caught));
        setBusy(false);
      }
    }, DECODE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [input]);

  const clear = useCallback(() => {
    setInput('');
    setDecoded(null);
    setError(null);
    setBusy(false);
  }, []);

  return { input, setInput, decoded, error, busy, clear };
}
