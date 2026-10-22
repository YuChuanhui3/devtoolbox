import { ToolError } from './errors';

/** DER → PEM（64 字符折行）。 */
export function derToPem(der: Uint8Array, label: string): string {
  const binary = Array.from(der, (byte) => String.fromCharCode(byte)).join('');
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

/** PEM → DER，容忍 CRLF 与多余说明文本。 */
export function pemToDer(pem: string, expectedLabel?: string): Uint8Array {
  const match = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(pem);
  if (!match) {
    throw new ToolError(
      { zh: 'PEM 格式不正确', en: 'PEM format is invalid' },
      { zh: '应包含 -----BEGIN … ----- 与 -----END … ----- 成对标记。', en: 'It should contain paired -----BEGIN … ----- and -----END … ----- markers.' },
    );
  }
  const [, label, body] = match;
  if (expectedLabel && label !== expectedLabel) {
    throw new ToolError(
      { zh: `PEM 类型不匹配：期望 ${expectedLabel}，实际 ${label}`, en: `PEM type mismatch: expected ${expectedLabel}, got ${label}` },
      { zh: '请确认导入的是对应类型的密钥/证书。', en: 'Make sure the imported key/certificate is of the matching type.' },
    );
  }
  const base64 = body.replace(/[\s-]/g, '');
  try {
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw new ToolError(
      { zh: 'PEM 内的 Base64 内容无法解码', en: 'The Base64 content in the PEM cannot be decoded' },
      { zh: '请确认复制完整、未混入其他文本。', en: 'Make sure it was copied completely, without other text mixed in.' },
    );
  }
}
