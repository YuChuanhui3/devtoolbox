function toBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === 'string' ? new TextEncoder().encode(input) : input;
}

function rotl(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function ff(a: number, b: number, c: number, d: number, x: number, s: number): number {
  return rotl((a + ((b & c) | (~b & d)) + x) >>> 0, s);
}

function gg(a: number, b: number, c: number, d: number, x: number, s: number): number {
  return rotl((a + ((b & c) | (b & d) | (c & d)) + x + 0x5a827999) >>> 0, s);
}

function hh(a: number, b: number, c: number, d: number, x: number, s: number): number {
  return rotl((a + (b ^ c ^ d) + x + 0x6ed9eba1) >>> 0, s);
}

function processBlock(state: number[], block: Uint8Array): void {
  const x: number[] = [];
  for (let i = 0; i < 16; i += 1) {
    const offset = i * 4;
    x.push(
      (block[offset] | (block[offset + 1] << 8) | (block[offset + 2] << 16) | (block[offset + 3] << 24)) >>> 0,
    );
  }

  let [a, b, c, d] = state;

  for (let group = 0; group < 4; group += 1) {
    const base = group * 4;
    a = ff(a, b, c, d, x[base], 3);
    d = ff(d, a, b, c, x[base + 1], 7);
    c = ff(c, d, a, b, x[base + 2], 11);
    b = ff(b, c, d, a, x[base + 3], 19);
  }

  for (let group = 0; group < 4; group += 1) {
    a = gg(a, b, c, d, x[group], 3);
    d = gg(d, a, b, c, x[group + 4], 5);
    c = gg(c, d, a, b, x[group + 8], 9);
    b = gg(b, c, d, a, x[group + 12], 13);
  }

  const round3Index = [[0, 8, 4, 12], [2, 10, 6, 14], [1, 9, 5, 13], [3, 11, 7, 15]];
  for (let group = 0; group < 4; group += 1) {
    const [i0, i1, i2, i3] = round3Index[group];
    a = hh(a, b, c, d, x[i0], 3);
    d = hh(d, a, b, c, x[i1], 9);
    c = hh(c, d, a, b, x[i2], 11);
    b = hh(b, c, d, a, x[i3], 15);
  }

  state[0] = (state[0] + a) >>> 0;
  state[1] = (state[1] + b) >>> 0;
  state[2] = (state[2] + c) >>> 0;
  state[3] = (state[3] + d) >>> 0;
}

/** MD4 摘要（RFC 1320），输出小写十六进制。 */
export function md4Hex(input: string | Uint8Array): string {
  const bytes = toBytes(input);
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];

  const bitLength = bytes.length * 8;
  const paddedLength = Math.max(64, Math.ceil((bytes.length + 9) / 64) * 64);
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    processBlock(state, padded.subarray(offset, offset + 64));
  }

  // RFC 1320 Decode：每个 32 位状态词按小端字节序输出。
  return state
    .map(
      (word) =>
        [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(''),
    )
    .join('');
}
