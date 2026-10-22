import { describe, expect, test } from 'vitest';
import {
  DEFAULT_HASH_ALGORITHMS,
  HASH_ALGORITHMS,
  emailMd5,
  hashInput,
  hashInputToAlgorithms,
  uppercaseRows,
} from './hash';

describe('hashInput digests', () => {
  test('MD family matches published vectors', () => {
    expect(hashInput('', 'md2')).toBe('8350e5a3e24c153df2275c9f80692773');
    expect(hashInput('abc', 'md2')).toBe('da853b0d3f88d99b30283a69e6ded6bb');
    expect(hashInput('', 'md4')).toBe('31d6cfe0d16ae931b73c59d7e0c089c0');
    expect(hashInput('abc', 'md4')).toBe('a448017aaf21d8525fc10ae87aa6729d');
    expect(hashInput('', 'md5')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(hashInput('中文', 'md5')).toBe('a7bac2239fcdcb3a067903d8077c4a07');
    expect(hashInput('abc', 'ripemd160')).toBe('8eb208f7e05d987a9b044a8e98c6b087f15a0bfc');
  });

  test('SHA family matches published vectors', () => {
    expect(hashInput('abc', 'sha1')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(hashInput('abc', 'sha256')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hashInput('abc', 'sha512')).toBe(
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    );
  });

  test('SHA-3 / Keccak matches published vectors', () => {
    expect(hashInput('abc', 'sha3-256')).toBe(
      '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532',
    );
    expect(hashInput('abc', 'sha3-512')).toBe(
      'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0',
    );
    expect(hashInput('', 'keccak-256')).toBe(
      'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
    );
  });

  test('SHAKE honors requested output length', () => {
    expect(hashInput('abc', 'shake128', { shakeBytes: 32 })).toBe(
      '5881092dd818bf5cf8a3ddb793fbcba74097d5c526a6d35f97b83351940f2cc8',
    );
    expect(hashInput('abc', 'shake256', { shakeBytes: 16 })).toHaveLength(32);
    expect(hashInput('abc', 'shake128')).toHaveLength(64);
    expect(hashInput('abc', 'shake256')).toHaveLength(128);
  });

  test('SHAKE rejects invalid output length', () => {
    expect(() => hashInput('abc', 'shake128', { shakeBytes: 0 })).toThrow('SHAKE 输出长度无效');
    expect(() => hashInput('abc', 'shake256', { shakeBytes: 99999 })).toThrow(
      'SHAKE 输出长度无效',
    );
  });

  test('accepts raw bytes as input', () => {
    expect(hashInput(new Uint8Array([97, 98, 99]), 'sha256')).toBe(hashInput('abc', 'sha256'));
  });
});

describe('hashInputToAlgorithms', () => {
  test('returns one row per algorithm with labels', () => {
    const rows = hashInputToAlgorithms('abc', ['md5', 'sha1']);
    expect(rows).toEqual([
      { id: 'md5', label: 'MD5', value: hashInput('abc', 'md5') },
      { id: 'sha1', label: 'SHA-1', value: hashInput('abc', 'sha1') },
    ]);
  });

  test('rejects unknown algorithm ids', () => {
    expect(() => hashInputToAlgorithms('abc', ['nope' as never])).toThrow('不支持的摘要算法');
  });
});

describe('emailMd5', () => {
  test('trims and lowercases before hashing', () => {
    expect(emailMd5('  AB@Ex.com ')).toBe('3655929172d583626b6a900d30d60448');
  });

  test('rejects empty input', () => {
    expect(() => emailMd5('   ')).toThrow('请输入邮箱地址');
  });
});

describe('metadata', () => {
  test('defaults exist among registered algorithms', () => {
    const ids = new Set(HASH_ALGORITHMS.map((info) => info.id));
    for (const id of DEFAULT_HASH_ALGORITHMS) expect(ids.has(id)).toBe(true);
  });
});

describe('uppercaseRows', () => {
  test('uppercases values only', () => {
    expect(uppercaseRows([{ label: 'MD5', value: 'abc' }])).toEqual([
      { label: 'MD5', value: 'ABC' },
    ]);
  });
});
