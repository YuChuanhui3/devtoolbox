import bcrypt from 'bcryptjs';
import { sha1 } from '@noble/hashes/legacy.js';
import { ToolError } from './errors';
import { bytesToBase64 } from './base64';
import { apr1Hash } from './md5crypt';

export type HtpasswdFormat = 'bcrypt' | 'apr1' | 'sha1' | 'plain';

export interface HtpasswdEntry {
  username: string;
  format: HtpasswdFormat;
  line: string;
}

const FORMAT_LABELS: Record<HtpasswdFormat, string> = {
  bcrypt: 'bcrypt（$2y$，推荐）',
  apr1: 'apr1（Apache MD5-Crypt）',
  sha1: '{SHA}（SHA-1，已不推荐）',
  plain: '明文（仅调试）',
};

export function formatLabel(format: HtpasswdFormat): string {
  return FORMAT_LABELS[format];
}

export function generateHtpasswdLine(username: string, password: string, format: HtpasswdFormat, bcryptCost = 12): HtpasswdEntry {
  const user = username.trim();
  if (!user) throw new ToolError(
    { zh: '请输入用户名', en: 'Enter the username' },
    { zh: 'htpasswd 每行格式为 用户名:散列。', en: 'Each htpasswd line has the format username:hash.' },
  );
  if (user.includes(':')) throw new ToolError(
    { zh: '用户名不能包含冒号', en: 'The username must not contain a colon' },
    { zh: '冒号是 htpasswd 的分隔符。', en: 'The colon is the htpasswd separator.' },
  );
  if (!password) throw new ToolError(
    { zh: '请输入口令', en: 'Enter the password' },
    { zh: '口令不能为空。', en: 'The password must not be empty.' },
  );

  let hash: string;
  switch (format) {
    case 'bcrypt':
      hash = bcrypt.hashSync(password, Math.min(15, Math.max(4, bcryptCost))).replace(/^\$2[ab]\$/, '$2y$');
      break;
    case 'apr1':
      hash = apr1Hash(password);
      break;
    case 'sha1':
      hash = `{SHA}${bytesToBase64(sha1(new TextEncoder().encode(password)))}`;
      break;
    case 'plain':
      hash = password;
      break;
    default:
      throw new ToolError({ zh: `未知格式：${format}`, en: `Unknown format: ${format}` });
  }
  return { username: user, format, line: `${user}:${hash}` };
}
