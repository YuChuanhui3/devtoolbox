import { md5 } from '@noble/hashes/legacy.js';
import { ToolError } from './errors';

const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function bytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function md5Raw(chunks: Uint8Array[]): Uint8Array {
  const hasher = md5.create();
  for (const chunk of chunks) hasher.update(chunk);
  return hasher.digest();
}

function to64(value: number, count: number): string {
  let result = '';
  let rest = value;
  for (let remaining = count - 1; remaining >= 0; remaining -= 1) {
    result += ITOA64[rest & 63];
    rest >>= 6;
  }
  return result;
}

/** APR1/MD5-Crypt 编码尾部 16 字节摘要（glibc/Apache 的固定字节顺序）。 */
function encodeDigest(digest: Uint8Array): string {
  return (
    to64((digest[0] << 16) | (digest[6] << 8) | digest[12], 4) +
    to64((digest[1] << 16) | (digest[7] << 8) | digest[13], 4) +
    to64((digest[2] << 16) | (digest[8] << 8) | digest[14], 4) +
    to64((digest[3] << 16) | (digest[9] << 8) | digest[15], 4) +
    to64((digest[4] << 16) | (digest[10] << 8) | digest[5], 4) +
    to64(digest[11], 2)
  );
}

export function randomApr1Salt(length = 8): string {
  const random = new Uint8Array(length);
  globalThis.crypto.getRandomValues(random);
  return Array.from(random, (byte) => ITOA64[byte & 63]).join('');
}

function computeApr1(password: string, salt: string): string {
  const passwordBytes = bytes(password);
  const saltBytes = bytes(salt);
  const magic = bytes('$apr1$');

  let ctx: Uint8Array[] = [passwordBytes, magic, saltBytes];

  const alt = md5Raw([passwordBytes, saltBytes, passwordBytes]);
  for (let remaining = passwordBytes.length; remaining > 0; remaining -= 16) {
    ctx.push(alt.subarray(0, Math.min(16, remaining)));
  }

  for (let bit = passwordBytes.length; bit > 0; bit >>= 1) {
    ctx.push(bit & 1 ? new Uint8Array([0]) : passwordBytes.subarray(0, 1));
  }

  let digest = md5Raw(ctx);

  for (let i = 0; i < 1000; i += 1) {
    const round: Uint8Array[] = [];
    round.push(i % 2 ? passwordBytes : digest);
    if (i % 3) round.push(saltBytes);
    if (i % 7) round.push(passwordBytes);
    round.push(i % 2 ? digest : passwordBytes);
    digest = md5Raw(round);
  }

  return `$apr1$${salt}$${encodeDigest(digest)}`;
}

/** 生成 Apache htpasswd 使用的 apr1 MD5-Crypt 口令散列。 */
export function apr1Hash(password: string, salt?: string): string {
  if (!password) throw new ToolError(
    { zh: '请输入口令', en: 'Enter the password' },
    { zh: 'apr1 计算要求口令非空。', en: 'apr1 requires a non-empty password.' },
  );
  let effective: string;
  if (salt) {
    const match = /^\$apr1\$([^$]+)\$/.exec(salt);
    effective = match ? match[1] : salt;
    if (!effective || effective.includes('$') || effective.length > 8) {
      throw new ToolError(
        { zh: `盐值不合法：${salt}`, en: `Invalid salt: ${salt}` },
        { zh: 'apr1 盐值长度 1 ~ 8，且不能包含 $。', en: 'The apr1 salt length must be between 1 and 8 and must not contain $.' },
      );
    }
  } else {
    effective = randomApr1Salt();
  }
  return computeApr1(password, effective);
}

export function verifyApr1Hash(password: string, expected: string): boolean {
  const match = /^\$apr1\$([^$]+)\$/.exec(expected.trim());
  if (!match) return false;
  return apr1Hash(password, match[1]) === expected.trim();
}
