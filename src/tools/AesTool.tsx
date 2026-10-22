import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { IconButton } from '@/components/ui/IconButton';
import { TransformTool } from '@/components/tool/TransformTool';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { ToolError } from '@/lib/errors';
import { base64ToBytes, bytesToBase64, normalizeBase64 } from '@/lib/base64';
import { SAMPLE_AES_TEXT } from '@/data/samples';

type Direction = 'encrypt' | 'decrypt';
type Algorithm = 'AES-GCM' | 'AES-CBC';

const SALT_LENGTH = 16;
const ITERATIONS = 100_000;
const DEMO_KEY = 'devtoolbox-demo';
const DEMO_CIPHERTEXT =
  'oW2cNT7AhQBglL6KD3m0EKZ0vqistqEmoKgrvXPfFJttP+4Q/crqTfvrD418KWEX0rw1gvm/7GP7+p98qe2r0Hed4g7X1Y6tX0xs9UOSBzw=';

function ivLengthFor(algorithm: Algorithm): number {
  return algorithm === 'AES-GCM' ? 12 : 16;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  algorithm: Algorithm,
): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    throw new ToolError(
      { zh: '当前环境不支持 Web Crypto', en: 'Web Crypto is unavailable in this environment' },
      {
        zh: 'AES 加解密需要安全上下文（HTTPS 或 localhost），请更换浏览器或访问方式后重试。',
        en: 'AES encryption requires a secure context (HTTPS or localhost). Try another browser or URL.',
      },
    );
  }

  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: algorithm, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptText(text: string, passphrase: string, algorithm: Algorithm): Promise<string> {
  if (!text) {
    throw new ToolError(
      { zh: '请输入需要加密的文本', en: 'Enter the text to encrypt' },
      { zh: '输入内容不能为空。', en: 'Input cannot be empty.' },
    );
  }
  if (!passphrase) {
    throw new ToolError(
      { zh: '请输入密钥', en: 'Enter a key' },
      {
        zh: '建议使用至少 12 位的复杂口令，且不要使用生产环境密钥。',
        en: 'Use a passphrase of at least 12 characters, and never a production key.',
      },
    );
  }
  if (passphrase.length < 6) {
    throw new ToolError(
      { zh: '密钥过短', en: 'Key too short' },
      {
        zh: '建议至少 6 位，实际使用建议 12 位以上并混合大小写与符号。',
        en: 'Minimum 6 characters; in practice use 12+ with mixed case and symbols.',
      },
    );
  }

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(ivLengthFor(algorithm)));
  const key = await deriveKey(passphrase, salt, algorithm);
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: algorithm, iv },
    key,
    new TextEncoder().encode(text),
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  return bytesToBase64(combined);
}

async function decryptText(
  ciphertext: string,
  passphrase: string,
  algorithm: Algorithm,
): Promise<string> {
  if (!ciphertext.trim()) {
    throw new ToolError(
      { zh: '请输入需要解密的密文', en: 'Enter the ciphertext to decrypt' },
      { zh: '密文应为 Base64 文本。', en: 'The ciphertext should be Base64 text.' },
    );
  }
  if (!passphrase) {
    throw new ToolError(
      { zh: '请输入密钥', en: 'Enter a key' },
      { zh: '需要使用加密时的同一密钥。', en: 'Use the same key as when encrypting.' },
    );
  }

  const ivLength = ivLengthFor(algorithm);
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(normalizeBase64(ciphertext));
  } catch {
    throw new ToolError(
      { zh: '密文格式不正确', en: 'Invalid ciphertext format' },
      {
        zh: '密文应为 Base64 编码的 salt + iv + ciphertext。',
        en: 'The ciphertext should be Base64 of salt + iv + ciphertext.',
      },
    );
  }

  if (bytes.length <= SALT_LENGTH + ivLength) {
    throw new ToolError(
      { zh: '密文长度不足', en: 'Ciphertext too short' },
      {
        zh: '数据可能不完整，或算法模式与加密时不一致。',
        en: 'The data may be incomplete, or the algorithm mode differs from encryption.',
      },
    );
  }

  const salt = bytes.slice(0, SALT_LENGTH);
  const iv = bytes.slice(SALT_LENGTH, SALT_LENGTH + ivLength);
  const payload = bytes.slice(SALT_LENGTH + ivLength);

  try {
    const key = await deriveKey(passphrase, salt, algorithm);
    const decrypted = await globalThis.crypto.subtle.decrypt({ name: algorithm, iv }, key, payload);
    return new TextDecoder('utf-8', { fatal: true }).decode(decrypted);
  } catch {
    throw new ToolError(
      { zh: '解密失败', en: 'Decryption failed' },
      {
        zh: '请检查密钥是否正确、算法模式是否与加密时一致，以及密文是否完整。',
        en: 'Check the key, the algorithm mode matching encryption, and that the ciphertext is complete.',
      },
    );
  }
}

export default function AesTool() {
  const { t } = useI18n();
  const [direction, setDirection] = useState<Direction>('encrypt');
  const [algorithm, setAlgorithm] = useState<Algorithm>('AES-GCM');
  const [passphrase, setPassphrase] = useState('');
  const [showKey, setShowKey] = useState(false);

  const isEncrypt = direction === 'encrypt';

  return (
    <div className="space-y-4">
      <TransformTool
        transform={(input) =>
          isEncrypt
            ? encryptText(input, passphrase, algorithm)
            : decryptText(input, passphrase, algorithm)
        }
        sample={isEncrypt ? SAMPLE_AES_TEXT : DEMO_CIPHERTEXT}
        inputLabel={isEncrypt ? { zh: '明文输入', en: 'Plaintext input' } : { zh: '密文输入（Base64）', en: 'Ciphertext input (Base64)' }}
        outputLabel={isEncrypt ? { zh: '密文结果（Base64）', en: 'Ciphertext (Base64)' } : { zh: '解密结果', en: 'Decrypted output' }}
        inputPlaceholder={isEncrypt ? { zh: '输入需要加密的文本', en: 'Enter the text to encrypt' } : { zh: '粘贴同算法、同密钥加密的 Base64 密文', en: 'Paste Base64 ciphertext from the same algorithm and key' }}
        outputFilename={isEncrypt ? 'encrypted.txt' : 'decrypted.txt'}
        successMessage={isEncrypt ? { zh: '加密完成', en: 'Encrypted' } : { zh: '解密完成', en: 'Decrypted' }}
        onSwap={() => setDirection(isEncrypt ? 'decrypt' : 'encrypt')}
        onSample={() => {
          if (!isEncrypt) {
            setPassphrase(DEMO_KEY);
            setAlgorithm('AES-GCM');
          }
        }}
        options={
          <>
            <Segmented
              value={direction}
              onChange={setDirection}
              ariaLabel={t({ zh: 'AES 方向', en: 'AES direction' })}
              options={[
                { value: 'encrypt', label: t({ zh: '加密', en: 'Encrypt' }) },
                { value: 'decrypt', label: t({ zh: '解密', en: 'Decrypt' }) },
              ]}
            />
            <Select
              value={algorithm}
              onChange={(event) => setAlgorithm(event.target.value as Algorithm)}
              aria-label={t({ zh: 'AES 模式', en: 'AES mode' })}
              className="h-8 text-xs"
              wrapperClassName="w-28"
            >
              <option value="AES-GCM">AES-GCM</option>
              <option value="AES-CBC">AES-CBC</option>
            </Select>
            <div className="flex items-center gap-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder={t({ zh: '输入密钥', en: 'Enter key' })}
                aria-label={t({ zh: 'AES 密钥', en: 'AES key' })}
                autoComplete="off"
                className="h-8 w-40 text-xs"
              />
              <IconButton
                label={showKey ? t({ zh: '隐藏密钥', en: 'Hide key' }) : t({ zh: '显示密钥', en: 'Show key' })}
                size="sm"
                onClick={() => setShowKey((value) => !value)}
              >
                {showKey ? (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </IconButton>
            </div>
          </>
        }
        helpText={t({
          zh: '密文格式：Base64(salt + iv + ciphertext)。密钥通过 PBKDF2-SHA256（100,000 次迭代）派生为 256 位 AES 密钥。',
          en: 'Ciphertext format: Base64(salt + iv + ciphertext). The key is derived as a 256-bit AES key via PBKDF2-SHA256 (100,000 iterations).',
        })}
      />

      <ToolAlert
        tone="warning"
        title={{ zh: '请勿输入生产环境的敏感密钥', en: 'Do not enter production secrets' }}
        hint={{
          zh: '本工具在浏览器本地完成加解密，密钥不保存、不上传；但页面仍可能被截屏或记录，请遵循最小暴露原则。',
          en: 'Encryption and decryption run locally in your browser; keys are neither stored nor uploaded. Screens of this page are still possible, so follow least-exposure practices.',
        }}
      />
    </div>
  );
}
