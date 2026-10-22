import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, test } from 'vitest';
import { bencodeEncode } from './bencode';
import { torrentBytesToMagnet } from './torrent';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

const enc = (text: string) => new TextEncoder().encode(text);

function buildFixtureTorrent(): Uint8Array {
  return bencodeEncode({
    announce: 'http://tracker.local/announce',
    'created by': 'test',
    info: { name: 'f.txt', length: 6, 'piece length': 16, pieces: enc('0123456789') },
  });
}

describe('torrent → magnet', () => {
  test('computes BTIH and builds magnet link', async () => {
    const info = await torrentBytesToMagnet(buildFixtureTorrent());
    expect(info.name).toBe('f.txt');
    expect(info.infoHash).toBe('GPPGOQ4RAMZLDAWO65E5LDENAIP4QFE5');
    expect(info.magnet).toBe(
      'magnet:?xt=urn:btih:GPPGOQ4RAMZLDAWO65E5LDENAIP4QFE5&dn=f.txt&tr=http%3A%2F%2Ftracker.local%2Fannounce',
    );
    expect(info.fileCount).toBe(1);
    expect(info.totalSize).toBe(6);
    expect(info.isPrivate).toBe(false);
  });

  test('multi-file torrents and announce-list dedupe', async () => {
    const bytes = bencodeEncode({
      announce: 'http://a/announce',
      'announce-list': [['http://a/announce'], ['http://b/announce']],
      info: {
        name: 'dir',
        'piece length': 16,
        pieces: enc('0123456789'),
        private: 1,
        files: [
          { length: 100, path: ['x.txt'] },
          { length: 250, path: ['sub', 'y.bin'] },
        ],
      },
    });
    const info = await torrentBytesToMagnet(bytes);
    expect(info.fileCount).toBe(2);
    expect(info.totalSize).toBe(350);
    expect(info.isPrivate).toBe(true);
    expect((info.magnet.match(/&tr=/g) ?? []).length).toBe(2);
  });

  test('errors', async () => {
    await expect(torrentBytesToMagnet(new Uint8Array(0))).rejects.toThrow('种子文件为空');
    await expect(torrentBytesToMagnet(bencodeEncode({ announce: 'x' }))).rejects.toThrow('缺少 info 段');
  });
});
