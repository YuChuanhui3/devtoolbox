export type RandomFn = () => number;

const HEX = '0123456789abcdef';

export function randomHex(rand: RandomFn, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += HEX[Math.floor(rand() * 16) % 16];
  return out;
}

/** 优先用 crypto.randomUUID；不可用时退化为 rand 驱动的 v4 形态 id（测试可注入固定 rand）。 */
export function newId(rand: RandomFn = Math.random): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const seq = randomHex(rand, 32).split('');
  seq[12] = '4';
  seq[16] = HEX[(parseInt(seq[16], 16) & 0b1011) | 0b1000];
  const s = seq.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
