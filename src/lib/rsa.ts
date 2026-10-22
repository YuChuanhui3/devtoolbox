import { ToolError } from './errors';
import { arrayBufferToBase64, base64ToArrayBuffer, normalizeBase64 } from './base64';
import { derToPem, pemToDer } from './pem';

export type RsaBits = 2048 | 4096;

function requireSubtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new ToolError(
      { zh: '当前环境不支持 Web Crypto', en: 'The current environment does not support Web Crypto' },
      { zh: 'RSA 运算需要安全上下文（HTTPS 或 localhost），请更换浏览器或访问方式后重试。', en: 'RSA operations require a secure context (HTTPS or localhost); try a different browser or access method.' },
    );
  }
  return globalThis.crypto.subtle;
}

export async function generateRsaKeyPairPem(bits: RsaBits): Promise<{ publicKeyPem: string; privateKeyPem: string }> {
  const subtle = requireSubtle();
  const keyPair = await subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt'],
  );
  const spki = await subtle.exportKey('spki', keyPair.publicKey);
  const pkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey);
  return {
    publicKeyPem: derToPem(new Uint8Array(spki), 'PUBLIC KEY'),
    privateKeyPem: derToPem(new Uint8Array(pkcs8), 'PRIVATE KEY'),
  };
}

async function importPublicKey(pem: string, subtle: SubtleCrypto): Promise<CryptoKey> {
  const der = pemToDer(pem, 'PUBLIC KEY');
  try {
    return await subtle.importKey('spki', der, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  } catch {
    throw new ToolError(
      { zh: '公钥导入失败', en: 'Public key import failed' },
      { zh: '请使用本工具或 openssl 导出的 SPKI 格式 “BEGIN PUBLIC KEY” PEM。', en: 'Use a SPKI-format “BEGIN PUBLIC KEY” PEM exported by this tool or openssl.' },
    );
  }
}

async function importPrivateKey(pem: string, usage: 'decrypt' | 'sign', algorithm: 'RSA-OAEP' | 'RSA-PSS' | 'RSASSA-PKCS1-v1_5'): Promise<CryptoKey> {
  const subtle = requireSubtle();
  const der = pemToDer(pem, 'PRIVATE KEY');
  try {
    return await subtle.importKey('pkcs8', der, { name: algorithm, hash: 'SHA-256' }, false, [usage]);
  } catch {
    throw new ToolError(
      { zh: '私钥导入失败', en: 'Private key import failed' },
      { zh: '请使用 PKCS#8 格式 “BEGIN PRIVATE KEY” PEM，且算法用途与当前操作一致。', en: 'Use a PKCS#8-format “BEGIN PRIVATE KEY” PEM whose algorithm usage matches the current operation.' },
    );
  }
}

export async function rsaEncryptOaep(plaintext: string, publicKeyPem: string): Promise<string> {
  if (!plaintext) throw new ToolError(
    { zh: '请输入需要加密的明文', en: 'Enter the plaintext to encrypt' },
    { zh: 'RSA-OAEP 单次加密长度受限，大文件请先用 AES 工具。', en: 'RSA-OAEP limits the length per encryption; use the AES tool for large files first.' },
  );
  const subtle = requireSubtle();
  const key = await importPublicKey(publicKeyPem, subtle);
  const encrypted = await subtle.encrypt({ name: 'RSA-OAEP' }, key, new TextEncoder().encode(plaintext));
  return arrayBufferToBase64(encrypted);
}

export async function rsaDecryptOaep(ciphertextBase64: string, privateKeyPem: string): Promise<string> {
  if (!ciphertextBase64.trim()) throw new ToolError({ zh: '请输入需要解密的 Base64 密文', en: 'Enter the Base64 ciphertext to decrypt' });
  const subtle = requireSubtle();
  const key = await importPrivateKey(privateKeyPem, 'decrypt', 'RSA-OAEP');
  let buffer: ArrayBuffer;
  try {
    buffer = base64ToArrayBuffer(normalizeBase64(ciphertextBase64));
  } catch {
    throw new ToolError(
      { zh: '密文格式不正确', en: 'Ciphertext format is invalid' },
      { zh: '应为 RSA 加密结果的标准 Base64。', en: 'It should be the standard Base64 of an RSA encryption result.' },
    );
  }
  try {
    const decrypted = await subtle.decrypt({ name: 'RSA-OAEP' }, key, buffer);
    return new TextDecoder('utf-8', { fatal: true }).decode(decrypted);
  } catch {
    throw new ToolError(
      { zh: '解密失败', en: 'Decryption failed' },
      { zh: '请确认密钥对匹配、密文完整，且加密时同样使用 RSA-OAEP(SHA-256)。', en: 'Make sure the key pair matches, the ciphertext is complete, and RSA-OAEP(SHA-256) was also used for encryption.' },
    );
  }
}

export type SignatureScheme = 'RSA1' | 'RSA2';

export async function rsaSign(message: string, privateKeyPem: string, scheme: SignatureScheme): Promise<string> {
  if (!message) throw new ToolError({ zh: '请输入需要签名的内容', en: 'Enter the content to sign' });
  const key = await importPrivateKey(
    privateKeyPem,
    'sign',
    scheme === 'RSA2' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5',
  );
  const subtle = requireSubtle();
  const signature = await subtle.sign(
    scheme === 'RSA2' ? { name: 'RSA-PSS', saltLength: 32 } : { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(message),
  );
  return arrayBufferToBase64(signature);
}

export async function rsaVerify(message: string, signatureBase64: string, publicKeyPem: string, scheme: SignatureScheme): Promise<boolean> {
  if (!message || !signatureBase64.trim()) throw new ToolError({ zh: '请同时输入原文与签名（Base64）', en: 'Enter both the message and the signature (Base64)' });
  const subtle = requireSubtle();
  const der = pemToDer(publicKeyPem, 'PUBLIC KEY');
  const key = await subtle.importKey(
    'spki',
    der,
    { name: scheme === 'RSA2' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  let signature: ArrayBuffer;
  try {
    signature = base64ToArrayBuffer(normalizeBase64(signatureBase64));
  } catch {
    throw new ToolError(
      { zh: '签名格式不正确', en: 'Signature format is invalid' },
      { zh: '应为签名结果的标准 Base64。', en: 'It should be the standard Base64 of a signature result.' },
    );
  }
  return subtle.verify(
    scheme === 'RSA2' ? { name: 'RSA-PSS', saltLength: 32 } : { name: 'RSASSA-PKCS1-v1_5' },
    key,
    signature,
    new TextEncoder().encode(message),
  );
}
