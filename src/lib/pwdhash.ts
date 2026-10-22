import bcrypt from 'bcryptjs';
import { scrypt } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';
import { ToolError } from './errors';

export type PwdHashAlgorithm = 'bcrypt' | 'scrypt';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, dkLen: 32 };

export interface ScryptOptions {
  N?: number;
  r?: number;
  p?: number;
  dkLen?: number;
}

function encodeScrypt(password: string, saltHex: string, options: ScryptOptions): string {
  const { N = SCRYPT_PARAMS.N, r = SCRYPT_PARAMS.r, p = SCRYPT_PARAMS.p, dkLen = SCRYPT_PARAMS.dkLen } = options;
  if (!Number.isInteger(N) || N < 2 || (N & (N - 1)) !== 0 || N > 2 ** 20) {
    throw new ToolError(
      { zh: `Scrypt N 无效：${N}`, en: `Invalid Scrypt N: ${N}` },
      { zh: 'N 必须是 2 ~ 1048576 之间的 2 的整数次幂。', en: 'N must be an integer power of 2 between 2 and 1048576.' },
    );
  }
  if (!Number.isInteger(r) || r < 1 || r > 8 || !Number.isInteger(p) || p < 1 || p > 4) {
    throw new ToolError(
      { zh: 'Scrypt r/p 无效', en: 'Invalid Scrypt r/p' },
      { zh: '浏览器内建议 r=8、p=1。', en: 'r=8 and p=1 are recommended in the browser.' },
    );
  }
  const derived = scrypt(new TextEncoder().encode(password), hexToBytes(saltHex), { N, r, p, dkLen });
  return `scrypt$${N}$${r}$${p}$${saltHex}$${bytesToHex(derived)}`;
}

export function generatePwdHash(algorithm: PwdHashAlgorithm, secret: string, strength: number, options: ScryptOptions = {}): string {
  if (!secret) throw new ToolError(
    { zh: '请输入需要计算散列的口令', en: 'Enter the password to hash' },
    { zh: 'Bcrypt/Scrypt 都不可逆，仅适合做校验存储。', en: 'Bcrypt/Scrypt are one-way and suitable only for storing verification hashes.' },
  );
  if (algorithm === 'bcrypt') {
    const rounds = Math.min(15, Math.max(4, Math.round(strength)));
    return bcrypt.hashSync(secret, rounds);
  }
  const salt = randomBytes(16);
  return encodeScrypt(secret, bytesToHex(salt), options);
}

export function verifyPwdHash(algorithm: PwdHashAlgorithm, secret: string, hash: string): boolean {
  if (!secret || !hash) throw new ToolError({ zh: '请同时输入待校验口令与已有散列', en: 'Enter both the password to verify and the existing hash' });
  if (algorithm === 'bcrypt') {
    if (!hash.startsWith('$2')) throw new ToolError(
      { zh: '不是合法的 Bcrypt 散列', en: 'Not a valid Bcrypt hash' },
      { zh: 'Bcrypt 散列以 $2a$/$2b$ 开头。', en: 'Bcrypt hashes start with $2a$/$2b$.' },
    );
    return bcrypt.compareSync(secret, hash);
  }
  const match = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([0-9a-fA-F]+)\$([0-9a-fA-F]+)$/.exec(hash.trim());
  if (!match) {
    throw new ToolError(
      { zh: '不是合法的 Scrypt 散列', en: 'Not a valid Scrypt hash' },
      { zh: '格式应为 scrypt$N$r$p$盐(HEX)$散列(HEX)。', en: 'The format should be scrypt$N$r$p$salt(HEX)$hash(HEX).' },
    );
  }
  const [, N, r, p, saltHex, hashHex] = match;
  const expected = encodeScrypt(secret, saltHex, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    dkLen: hashHex.length / 2,
  });
  return expected === hash.trim();
}
