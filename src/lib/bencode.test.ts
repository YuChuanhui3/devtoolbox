import { describe, expect, test } from 'vitest';
import { bencodeDecode, bencodeDecodeWithRaw, bencodeEncode, type BencodeValue } from './bencode';

const enc = (text: string) => new TextEncoder().encode(text);
const asText = (bytes: Uint8Array | null) => (bytes === null ? '' : new TextDecoder().decode(bytes));

function decodeDict(data: Uint8Array): Record<string, BencodeValue> {
  const value = bencodeDecode(data);
  if (typeof value !== 'object' || value instanceof Uint8Array || Array.isArray(value)) {
    throw new Error('expected dict');
  }
  return value;
}

describe('bencode', () => {
  test('decodes scalars', () => {
    expect(bencodeDecode(enc('i42e'))).toBe(42);
    expect(bencodeDecode(enc('i-7e'))).toBe(-7);
    expect(asText(bencodeDecode(enc('4:spam')) as Uint8Array)).toBe('spam');
    expect(asText(bencodeDecode(enc('0:')) as Uint8Array)).toBe('');
  });

  test('decodes lists and dicts', () => {
    const list = bencodeDecode(enc('l3:abc3:defe')) as Uint8Array[];
    expect(list.map(asText)).toEqual(['abc', 'def']);
    const dict = decodeDict(enc('d3:cowi10e4:spam4:eggse'));
    expect(dict['cow']).toBe(10);
    expect(asText(dict['spam'] as Uint8Array)).toBe('eggs');
  });

  test('encodes with byte-wise sorted dict keys', () => {
    expect(asText(bencodeEncode({ b: 'x', a: 1, B: 2 }))).toBe('d1:Bi2e1:ai1e1:b1:xe');
  });

  test('encode/decode round trip', () => {
    const value = {
      announce: 'http://tracker/announce',
      info: { name: '文件.txt', length: 123456, 'piece length': 16384 },
      'creation date': '1700000000',
    };
    const decoded = decodeDict(bencodeEncode(value));
    expect(asText(decoded['announce'] as Uint8Array)).toBe(value.announce);
    expect((decoded['info'] as Record<string, BencodeValue>)['length']).toBe(123456);
    expect(asText(decoded['creation date'] as Uint8Array)).toBe('1700000000');
  });

  test('rawOf returns untouched bytes of a dict entry', () => {
    const bytes = bencodeEncode({ info: { length: 3, name: 'a' }, other: 'z'.repeat(200) });
    const decoded = bencodeDecodeWithRaw(bytes);
    expect(asText(decoded.rawOf('info'))).toBe('d6:lengthi3e4:name1:ae');
    expect(decoded.rawOf('missing')).toBeNull();
  });

  test('rejects malformed data', () => {
    expect(() => bencodeDecode(enc('truncated'))).toThrow();
    expect(() => bencodeDecode(enc('i42'))).toThrow();
    expect(() => bencodeDecode(enc('i1.5e'))).toThrow();
  });
});
