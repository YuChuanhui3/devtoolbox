import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import CryptoJS from 'crypto-js';
import { Segmented } from '@/components/ui/Segmented';
import { Input } from '@/components/ui/Input';
import { IconButton } from '@/components/ui/IconButton';
import { TransformTool } from '@/components/tool/TransformTool';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { ToolError } from '@/lib/errors';
import { base64ToBytes, bytesToBase64 } from '@/lib/base64';
import { rc4 } from '@/lib/rc4';

type Direction = 'encrypt' | 'decrypt';
type Algorithm = 'DES' | '3DES' | 'Rabbit' | 'RC4';

const DEMO_KEY = 'devtoolbox-demo';
const DEMO_PLAINTEXT = '经典对称加密演示文本：Classic cipher demo.';

function encryptWithCryptoJs(algorithm: 'DES' | 'TripleDES' | 'Rabbit', text: string, passphrase: string): string {
  const cipher = algorithm === 'DES'
    ? CryptoJS.DES.encrypt(text, passphrase)
    : algorithm === 'TripleDES'
      ? CryptoJS.TripleDES.encrypt(text, passphrase)
      : CryptoJS.Rabbit.encrypt(text, passphrase);
  return cipher.toString();
}

function decryptWithCryptoJs(algorithm: 'DES' | 'TripleDES' | 'Rabbit', base64: string, passphrase: string): string {
  let plaintext = '';
  try {
    const decrypted = algorithm === 'DES'
      ? CryptoJS.DES.decrypt(base64.trim(), passphrase)
      : algorithm === 'TripleDES'
        ? CryptoJS.TripleDES.decrypt(base64.trim(), passphrase)
        : CryptoJS.Rabbit.decrypt(base64.trim(), passphrase);
    plaintext = decrypted.toString(CryptoJS.enc.Utf8);
  } catch {
    plaintext = '';
  }
  if (!plaintext) {
    throw new ToolError(
      { zh: '解密失败', en: 'Decryption failed' },
      {
        zh: '请确认口令与加密时一致、密文完整，且算法模式未选错。',
        en: 'Check that the passphrase matches encryption, the ciphertext is complete, and the algorithm is correct.',
      },
    );
  }
  return plaintext;
}

export default function SymCipherTool() {
  const { t } = useI18n();
  const [direction, setDirection] = useState<Direction>('encrypt');
  const [algorithm, setAlgorithm] = useState<Algorithm>('DES');
  const [passphrase, setPassphrase] = useState('');
  const [showKey, setShowKey] = useState(false);

  const isEncrypt = direction === 'encrypt';

  const transform = (input: string): string => {
    if (!input) {
      throw new ToolError(
        isEncrypt
          ? { zh: '请输入需要加密的文本', en: 'Enter the text to encrypt' }
          : { zh: '请输入需要解密的密文', en: 'Enter the ciphertext to decrypt' },
      );
    }
    if (!passphrase) {
      throw new ToolError(
        { zh: '请输入密钥/口令', en: 'Enter a key / passphrase' },
        {
          zh: '口令模式使用 OpenSSL EVP_BytesToKey 派生密钥，加密输出为 Salted__ Base64。',
          en: 'Passphrase mode derives the key with OpenSSL EVP_BytesToKey; output is Salted__ Base64.',
        },
      );
    }
    if (passphrase.length < 4) {
      throw new ToolError(
        { zh: '口令过短', en: 'Passphrase too short' },
        {
          zh: '建议至少 4 位，实际使用建议 12 位以上。',
          en: 'Minimum 4 characters; in practice use 12 or more.',
        },
      );
    }

    if (algorithm === 'RC4') {
      if (isEncrypt) {
        return bytesToBase64(rc4(passphrase, new TextEncoder().encode(input)));
      }
      let bytes: Uint8Array;
      try {
        bytes = base64ToBytes(input.trim());
      } catch {
        throw new ToolError(
          { zh: 'RC4 密文应为 Base64 文本', en: 'RC4 ciphertext should be Base64 text' },
          { zh: '请粘贴本工具加密得到的 Base64 内容。', en: 'Paste the Base64 produced by this tool.' },
        );
      }
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(rc4(passphrase, bytes));
      } catch {
        throw new ToolError(
          { zh: '解密失败或结果非 UTF-8', en: 'Decryption failed or the result is not UTF-8' },
          { zh: '请确认口令与加密时一致。', en: 'Check that the passphrase matches encryption.' },
        );
      }
    }

    const mode: 'DES' | 'TripleDES' | 'Rabbit' = algorithm === '3DES' ? 'TripleDES' : algorithm;
    return isEncrypt
      ? encryptWithCryptoJs(mode, input, passphrase)
      : decryptWithCryptoJs(mode, input, passphrase);
  };

  return (
    <div className="space-y-4">
      <TransformTool
        transform={transform}
        sample={DEMO_PLAINTEXT}
        resetOutputKey={`${algorithm}-${direction}`}
        inputLabel={isEncrypt ? { zh: '明文输入', en: 'Plaintext input' } : { zh: '密文输入（Base64）', en: 'Ciphertext input (Base64)' }}
        outputLabel={isEncrypt ? { zh: '密文结果', en: 'Ciphertext' } : { zh: '解密结果', en: 'Decrypted output' }}
        inputPlaceholder={isEncrypt ? { zh: '输入需要加密的文本', en: 'Enter the text to encrypt' } : { zh: '粘贴同算法、同口令加密的密文', en: 'Paste ciphertext from the same algorithm and passphrase' }}
        outputFilename={isEncrypt ? 'encrypted.txt' : 'decrypted.txt'}
        successMessage={isEncrypt ? { zh: '加密完成', en: 'Encrypted' } : { zh: '解密完成', en: 'Decrypted' }}
        showSwap={false}
        onSample={() => {
          if (!isEncrypt) setPassphrase(DEMO_KEY);
        }}
        options={
          <>
            <Segmented
              value={direction}
              onChange={setDirection}
              ariaLabel={t({ zh: '对称加密方向', en: 'Cipher direction' })}
              options={[
                { value: 'encrypt', label: t({ zh: '加密', en: 'Encrypt' }) },
                { value: 'decrypt', label: t({ zh: '解密', en: 'Decrypt' }) },
              ]}
            />
            <Segmented
              value={algorithm}
              onChange={setAlgorithm}
              ariaLabel={t({ zh: '算法', en: 'Algorithm' })}
              options={[
                { value: 'DES', label: 'DES' },
                { value: '3DES', label: '3DES' },
                { value: 'Rabbit', label: 'Rabbit' },
                { value: 'RC4', label: 'RC4' },
              ]}
            />
            <div className="flex items-center gap-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder={t({ zh: '口令', en: 'Passphrase' })}
                aria-label={t({ zh: '对称加密口令', en: 'Symmetric passphrase' })}
                autoComplete="off"
                className="h-8 w-40 text-xs"
              />
              <IconButton
                label={showKey ? t({ zh: '隐藏口令', en: 'Hide passphrase' }) : t({ zh: '显示口令', en: 'Show passphrase' })}
                size="sm"
                onClick={() => setShowKey((value) => !value)}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
              </IconButton>
            </div>
          </>
        }
        helpText={t({
          zh: 'DES/3DES/Rabbit 为口令模式（OpenSSL 加盐 EVP_BytesToKey），密文以 Salted__ Base64 输出，可与其他 OpenSSL 工具互转；RC4 密钥为口令 UTF-8 字节，密文为 Base64。',
          en: 'DES/3DES/Rabbit use passphrase mode (OpenSSL salted EVP_BytesToKey) and emit Salted__ Base64, interoperable with other OpenSSL tools; RC4 uses the passphrase UTF-8 bytes as key and outputs Base64.',
        })}
      />

      <ToolAlert
        tone="warning"
        title={{ zh: 'DES/3DES/RC4 已不适合保护高价值数据', en: 'DES/3DES/RC4 are no longer fit for protecting valuable data' }}
        hint={{
          zh: 'DES 密钥仅 56 位、RC4 存在已知偏差，仅供学习、解密历史密文或使用老旧设备时使用；新系统请优先选择 AES-GCM。所有计算均在浏览器本地完成，口令与内容不上传、不保存。',
          en: 'DES has only a 56-bit key and RC4 has known biases; use them for learning, legacy ciphertexts, or old devices only. Prefer AES-GCM for new systems. Everything runs locally in your browser — passphrases and content are neither uploaded nor stored.',
        }}
      />
    </div>
  );
}
