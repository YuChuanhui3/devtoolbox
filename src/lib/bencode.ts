import { ToolError } from './errors';

export type BencodeValue = string | Uint8Array | number | BencodeValue[] | { [key: string]: BencodeValue };

// 跨 realm（jsdom/Node、不同上下文传入的 TextEncoder 输出）时 instanceof 会失效，用 ArrayBuffer 视图特征判断。
export function isBytes(value: unknown): value is Uint8Array {
  return ArrayBuffer.isView(value) && (value as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT === 1;
}

interface DecodeResult {
  value: BencodeValue;
  end: number;
}

function decode(data: Uint8Array, index: number): DecodeResult {
  if (index >= data.length) throw new ToolError({ zh: '种子文件解析失败', en: 'Torrent file parsing failed' }, { zh: 'bencode 数据在预期位置提前结束，文件可能已损坏。', en: 'The bencode data ended earlier than expected; the file may be corrupted.' });
  const head = data[index];
  if (head === 0x69 /* i */) {
    const end = data.indexOf(0x65 /* e */, index + 1);
    if (end === -1) throw new ToolError({ zh: '种子文件解析失败', en: 'Torrent file parsing failed' }, { zh: '整数以 i 开头、e 结尾，请检查文件完整性。', en: 'Integers start with i and end with e; check the file integrity.' });
    const text = new TextDecoder().decode(data.subarray(index + 1, end));
    if (!/^-?\d+$/.test(text)) throw new ToolError({ zh: '种子文件解析失败', en: 'Torrent file parsing failed' }, { zh: `非法整数字面量：${text}`, en: `Invalid integer literal: ${text}` });
    return { value: Number(text), end: end + 1 };
  }
  if (head === 0x64 /* d */) {
    const dict: Record<string, BencodeValue> = {};
    let cursor = index + 1;
    while (data[cursor] !== 0x65) {
      if (cursor >= data.length) throw new ToolError({ zh: '种子文件解析失败', en: 'Torrent file parsing failed' }, { zh: '字典缺少结束符 e。', en: 'The dictionary is missing its terminating e.' });
      const key = decode(data, cursor);
      if (typeof key.value !== 'string' && !isBytes(key.value)) {
        throw new ToolError({ zh: '种子文件解析失败', en: 'Torrent file parsing failed' }, { zh: '字典的键必须是字节串。', en: 'Dictionary keys must be byte strings.' });
      }
      const keyText = typeof key.value === 'string' ? key.value : new TextDecoder().decode(key.value);
      const item = decode(data, key.end);
      dict[keyText] = item.value;
      cursor = item.end;
    }
    return { value: dict, end: cursor + 1 };
  }
  if (head === 0x6c /* l */) {
    const list: BencodeValue[] = [];
    let cursor = index + 1;
    while (data[cursor] !== 0x65) {
      if (cursor >= data.length) throw new ToolError({ zh: '种子文件解析失败', en: 'Torrent file parsing failed' }, { zh: '列表缺少结束符 e。', en: 'The list is missing its terminating e.' });
      const item = decode(data, cursor);
      list.push(item.value);
      cursor = item.end;
    }
    return { value: list, end: cursor + 1 };
  }
  if (head >= 0x30 && head <= 0x39) {
    const colon = data.indexOf(0x3a /* : */, index);
    if (colon === -1) throw new ToolError({ zh: '种子文件解析失败', en: 'Torrent file parsing failed' }, { zh: '字节串缺少长度冒号。', en: 'The byte string is missing its length colon.' });
    const length = Number(new TextDecoder().decode(data.subarray(index, colon)));
    if (!Number.isInteger(length) || length < 0) throw new ToolError({ zh: '种子文件解析失败', en: 'Torrent file parsing failed' }, { zh: '字节串长度无效。', en: 'The byte string length is invalid.' });
    const start = colon + 1;
    return { value: data.subarray(start, start + length), end: start + length };
  }
  throw new ToolError({ zh: '种子文件解析失败', en: 'Torrent file parsing failed' }, { zh: `未知的 bencode 起始字节：0x${head.toString(16)}`, en: `Unknown bencode start byte: 0x${head.toString(16)}` });
}

export function bencodeDecode(data: Uint8Array): BencodeValue {
  return decode(data, 0).value;
}

/** 定位某个字典键对应的原始字节区间（用于 info 段做 BTIH 哈希）。 */
export function bencodeDecodeWithRaw(data: Uint8Array): { value: BencodeValue; rawOf: (key: string) => Uint8Array | null } {
  const result = decode(data, 0);
  return {
    value: result.value,
    rawOf(key: string): Uint8Array | null {
      if (typeof result.value !== 'object' || isBytes(result.value) || Array.isArray(result.value)) {
        return null;
      }
      const cursor = findRaw(data, key);
      return cursor;
    },
  };
}

function findRaw(data: Uint8Array, wantedKey: string): Uint8Array | null {
  let index = 0;
  if (data[index] !== 0x64) return null;
  index += 1;
  while (data[index] !== 0x65 && index < data.length) {
    const key = decode(data, index);
    const keyText = typeof key.value === 'string' ? key.value : new TextDecoder().decode(key.value as Uint8Array);
    const value = decode(data, key.end);
    if (keyText === wantedKey) return data.subarray(key.end, value.end);
    index = value.end;
  }
  return null;
}

const encoder = new TextEncoder();

export function bencodeEncode(value: BencodeValue): Uint8Array {
  const chunks: number[] = [];
  const write = (bytes: Uint8Array | string): void => {
    const arr = typeof bytes === 'string' ? encoder.encode(bytes) : bytes;
    for (const byte of arr) chunks.push(byte);
  };

  const walk = (item: BencodeValue): void => {
    if (typeof item === 'number') {
      write(`i${item}e`);
    } else if (typeof item === 'string') {
      const bytes = encoder.encode(item);
      write(`${bytes.length}:`);
      write(bytes);
    } else if (isBytes(item)) {
      write(`${item.length}:`);
      write(item);
    } else if (Array.isArray(item)) {
      write('l');
      for (const entry of item) walk(entry);
      write('e');
    } else {
      write('d');
      const keys = Object.keys(item).sort((a, b) => {
        const ba = encoder.encode(a);
        const bb = encoder.encode(b);
        const min = Math.min(ba.length, bb.length);
        for (let i = 0; i < min; i += 1) {
          if (ba[i] !== bb[i]) return ba[i] - bb[i];
        }
        return ba.length - bb.length;
      });
      for (const key of keys) {
        walk(key);
        walk(item[key]);
      }
      write('e');
    }
  };

  walk(value);
  return new Uint8Array(chunks);
}
