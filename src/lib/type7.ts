import { ToolError } from './errors';

// Cisco Type 7（XL）替换表，种子取值 0 ~ 52。
const XLAT = 'dsfd;kfoA,.iyewrkldJKDHSUBsgvca69834ncxv9873254k;fg87';

function seedDigits(seed: number): string {
  return String(seed).padStart(2, '0');
}

/** 加密：返回 “两位十进制种子 + HEX 密文” 的 Type 7 串。 */
export function type7Encrypt(plaintext: string, seed?: number): string {
  if (!plaintext)
    throw new ToolError(
      { zh: '请输入需要加密的明文', en: 'Enter the plaintext to encrypt' },
      { zh: 'Type 7 加密输入不能为空。', en: 'Type 7 encryption input must not be empty.' },
    );
  const effective = seed ?? Math.floor(Math.random() * XLAT.length);
  if (!Number.isInteger(effective) || effective < 0 || effective > 52) {
    throw new ToolError(
      { zh: `Type 7 种子无效：${seed}`, en: `Invalid Type 7 seed: ${seed}` },
      { zh: '种子必须是 0 ~ 52 的整数。', en: 'Seed must be an integer between 0 and 52.' },
    );
  }
  let result = seedDigits(effective);
  for (let i = 0; i < plaintext.length; i += 1) {
    const key = XLAT.charCodeAt((effective + i) % XLAT.length);
    const value = (plaintext.charCodeAt(i) ^ key) & 0xff;
    result += value.toString(16).toUpperCase().padStart(2, '0');
  }
  return result;
}

/** 解密：输入可带 “password 7 ” 之类前缀，自动提取 Type 7 串。 */
export function type7Decrypt(ciphertext: string): string {
  const trimmed = ciphertext.trim();
  const match = /\b(\d{2})([0-9A-Fa-f]{2,})\b/.exec(trimmed);
  if (!match) {
    throw new ToolError(
      { zh: '未找到合法的 Type 7 密文', en: 'No valid Type 7 ciphertext found' },
      {
        zh: '格式应为两位十进制种子（00 ~ 52）加偶数位 HEX，例如 0458050B10284F。',
        en: 'Format: a two-digit decimal seed (00 ~ 52) followed by an even number of HEX digits, e.g. 0458050B10284F.',
      },
    );
  }
  const [, seedText, hex] = match;
  const seed = Number(seedText);
  if (seed < 0 || seed > 52) {
    throw new ToolError(
      { zh: `Type 7 种子无效：${seedText}`, en: `Invalid Type 7 seed: ${seedText}` },
      { zh: '种子必须是 0 ~ 52 的整数。', en: 'Seed must be an integer between 0 and 52.' },
    );
  }
  let result = '';
  for (let i = 0; i < hex.length; i += 2) {
    const value = parseInt(hex.slice(i, i + 2), 16);
    result += String.fromCharCode(value ^ XLAT.charCodeAt((seed + i / 2) % XLAT.length));
  }
  return result;
}
