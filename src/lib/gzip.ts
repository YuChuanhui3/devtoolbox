import { ToolError } from './errors';
import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';

function getCompressionCtor(name: 'CompressionStream' | 'DecompressionStream'): new (format: CompressionFormat) => TransformStream {
  const ctor = globalThis[name];
  if (!ctor) {
    throw new ToolError(
      { zh: '当前浏览器不支持 Gzip 压缩流', en: 'This browser does not support Gzip compression streams' },
      {
        zh: '请使用 Chrome / Edge 80+、Firefox 113+ 或 Safari 16.4+ 后重试。',
        en: 'Please use Chrome / Edge 80+, Firefox 113+, or Safari 16.4+ and try again.',
      },
    );
  }
  return ctor;
}

async function transform(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  return new Response(stream).arrayBuffer();
}

/** 文本 → gzip 压缩后的 Base64。 */
export async function gzipTextToBase64(text: string): Promise<string> {
  if (!text)
    throw new ToolError(
      { zh: '请输入需要压缩的文本', en: 'Enter the text to compress' },
      { zh: 'Gzip 压缩输入不能为空。', en: 'Gzip compression input must not be empty.' },
    );
  const Ctor = getCompressionCtor('CompressionStream');
  const stream = new Blob([text]).stream().pipeThrough(new Ctor('gzip'));
  return arrayBufferToBase64(await transform(stream));
}

/** Base64(gzip) → 解压后的文本。 */
export async function gunzipBase64ToText(base64: string): Promise<string> {
  if (!base64.trim())
    throw new ToolError(
      { zh: '请输入需要解压的 Base64 数据', en: 'Enter the Base64 data to decompress' },
      { zh: '应为 gzip 压缩后的 Base64 文本。', en: 'Expected Base64 text of gzip-compressed data.' },
    );
  const Ctor = getCompressionCtor('DecompressionStream');
  let buffer: ArrayBuffer;
  try {
    buffer = base64ToArrayBuffer(base64);
  } catch {
    throw new ToolError(
      { zh: 'Base64 数据格式不正确', en: 'Invalid Base64 data format' },
      { zh: '请粘贴完整的 Base64(gzip) 内容。', en: 'Paste the complete Base64(gzip) content.' },
    );
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new Ctor('gzip'));
  const decompressed = await transform(stream);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(decompressed);
  } catch {
    throw new ToolError(
      { zh: '解压结果不是合法的 UTF-8 文本', en: 'Decompressed result is not valid UTF-8 text' },
      { zh: '如果原文件是二进制内容，请下载后查看。', en: 'If the original file is binary, download it to view.' },
    );
  }
}
