import { ToolError } from './errors';
import { bencodeDecodeWithRaw, isBytes, type BencodeValue } from './bencode';

function asDict(value: BencodeValue): Record<string, BencodeValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || isBytes(value)) {
    throw new ToolError(
      { zh: '种子文件顶层结构不是字典', en: 'The top-level structure of the torrent is not a dictionary' },
      { zh: '标准的 .torrent 文件以 d 开头，请确认选择了正确的文件。', en: 'A standard .torrent file starts with d; make sure you selected the right file.' },
    );
  }
  return value;
}

function text(value: BencodeValue | undefined, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (isBytes(value)) return new TextDecoder('utf-8').decode(value);
  return fallback;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function bytesToBase32NoPad(bytes: Uint8Array): string {
  let result = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) result += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return result;
}

export interface TorrentInfo {
  name: string;
  infoHash: string;
  magnet: string;
  fileCount: number;
  totalSize: number;
  isPrivate: boolean;
}

export async function torrentBytesToMagnet(data: Uint8Array): Promise<TorrentInfo> {
  if (data.length === 0)
    throw new ToolError(
      { zh: '种子文件为空', en: 'The torrent file is empty' },
      { zh: '请选择 .torrent 文件。', en: 'Select a .torrent file.' },
    );
  if (!globalThis.crypto?.subtle) {
    throw new ToolError(
      { zh: '当前环境不支持 Web Crypto', en: 'The current environment does not support Web Crypto' },
      {
        zh: '解析种子需要安全上下文（HTTPS 或 localhost），请更换访问方式后重试。',
        en: 'Parsing torrents requires a secure context (HTTPS or localhost); try a different way to access this page.',
      },
    );
  }

  const decoded = bencodeDecodeWithRaw(data);
  const dict = asDict(decoded.value);

  const infoRaw = decoded.rawOf('info');
  if (!infoRaw) {
    throw new ToolError(
      { zh: '种子文件缺少 info 段', en: 'The torrent file is missing the info section' },
      { zh: 'BTIH 哈希基于 info 字典计算，请确认 .torrent 文件完整。', en: 'The BTIH hash is computed from the info dictionary; make sure the .torrent file is complete.' },
    );
  }

  const digest = await globalThis.crypto.subtle.digest('SHA-1', infoRaw);
  const infoHash = bytesToBase32NoPad(new Uint8Array(digest));

  const name = text(dict['info'] !== undefined ? asDict(dict['info'])['name'] : undefined, 'unknown') || 'unknown';
  const announce = text(dict['announce']);
  const announceList = dict['announce-list'];

  const params = [`xt=urn:btih:${infoHash}`, `dn=${encodeURIComponent(name)}`];
  if (announce) params.push(`tr=${encodeURIComponent(announce)}`);
  if (Array.isArray(announceList)) {
    const trackers = new Set<string>();
    for (const group of announceList) {
      if (Array.isArray(group)) {
        for (const entry of group) {
          const url = text(entry);
          if (url) trackers.add(url);
        }
      }
    }
    for (const url of trackers) {
      if (url !== announce) params.push(`tr=${encodeURIComponent(url)}`);
    }
  }

  let fileCount = 1;
  let totalSize = 0;
  const infoDict = asDict(dict['info']);
  const files = infoDict['files'];
  if (Array.isArray(files)) {
    fileCount = files.length;
    for (const file of files) {
      if (typeof file === 'object' && !isBytes(file) && !Array.isArray(file)) {
        totalSize += Number((file as Record<string, BencodeValue>).length ?? 0);
      }
    }
  } else {
    totalSize = Number(infoDict.length ?? 0);
  }

  return {
    name,
    infoHash,
    magnet: `magnet:?${params.join('&')}`,
    fileCount,
    totalSize,
    isPrivate: Number(infoDict.private ?? 0) === 1,
  };
}
