import { describe, expect, test } from 'vitest';
import { gunzipBase64ToText, gzipTextToBase64 } from './gzip';

const supported =
  typeof globalThis.CompressionStream === 'function' && typeof Blob.prototype.stream === 'function';

describe('gzip text ↔ base64', () => {
  test('empty input validation', async () => {
    await expect(gzipTextToBase64('')).rejects.toThrow('请输入需要压缩的文本');
    await expect(gunzipBase64ToText('  ')).rejects.toThrow('请输入需要解压的 Base64');
  });

  test('invalid base64 rejected', async () => {
    await expect(gunzipBase64ToText('not!base64!')).rejects.toThrow(/Base64|不支持/);
  });

  test.skipIf(!supported)('round trip keeps utf-8 text', async () => {
    const text = 'Gzip 往返测试'.repeat(200);
    const packed = await gzipTextToBase64(text);
    expect(packed.length).toBeLessThan(text.length);
    expect(await gunzipBase64ToText(packed)).toBe(text);
  });

  test.skipIf(!supported)('decompresses an externally produced gzip', async () => {
    // node zlib 对 "Hello, DevToolbox" 的 gzip 输出。
    const base64 = 'H4sIAAAAAAAAE/NIzcnJ11FwSS0Lyc/PScqvAACC3b56EQAAAA==';
    expect(await gunzipBase64ToText(base64)).toBe('Hello, DevToolbox');
  });
});
