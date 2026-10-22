import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { Input } from '@/components/ui/Input';
import { TransformTool } from '@/components/tool/TransformTool';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { ToolError } from '@/lib/errors';
import { type7Decrypt, type7Encrypt } from '@/lib/type7';

type Direction = 'encrypt' | 'decrypt';

export default function Type7Tool() {
  const { t } = useI18n();
  const [direction, setDirection] = useState<Direction>('decrypt');
  const [seed, setSeed] = useState('');
  const isEncrypt = direction === 'encrypt';

  const transform = (input: string): string => {
    if (!input.trim())
      throw new ToolError(
        isEncrypt ? { zh: '请输入明文口令', en: 'Enter the plaintext password' } : { zh: '请输入 Type 7 密文', en: 'Enter the Type 7 ciphertext' },
      );
    if (isEncrypt) {
      const parsed = seed.trim() ? Number(seed.trim()) : undefined;
      return type7Encrypt(input, parsed);
    }
    return type7Decrypt(input);
  };

  return (
    <div className="space-y-4">
      <TransformTool
        transform={transform}
        sample={isEncrypt ? 'cisco123' : '104D001A0F123E'}
        resetOutputKey={direction}
        inputLabel={isEncrypt ? { zh: '明文口令', en: 'Plaintext password' } : { zh: 'Type 7 密文', en: 'Type 7 ciphertext' }}
        outputLabel={isEncrypt ? { zh: '加密结果', en: 'Encrypted output' } : { zh: '解密结果', en: 'Decrypted output' }}
        inputPlaceholder={
          isEncrypt
            ? { zh: '输入需要加密的口令', en: 'Enter the password to encrypt' }
            : {
                zh: '粘贴 show run 中的 7 开头密文，如 0458050B10284F，可带 “password 7” 前缀',
                en: 'Paste a 7-prefixed ciphertext from show run, e.g. 0458050B10284F; a “password 7” prefix is allowed',
              }
        }
        outputFilename="type7.txt"
        successMessage={{ zh: '处理完成', en: 'Done' }}
        showSwap={false}
        onSwap={() => setDirection(isEncrypt ? 'decrypt' : 'encrypt')}
        options={
          <>
            <Segmented
              value={direction}
              onChange={setDirection}
              ariaLabel={t({ zh: 'Type 7 方向', en: 'Type 7 direction' })}
              options={[
                { value: 'encrypt', label: t({ zh: '加密', en: 'Encrypt' }) },
                { value: 'decrypt', label: t({ zh: '解密', en: 'Decrypt' }) },
              ]}
            />
            {isEncrypt ? (
              <label className="flex items-center gap-1.5 text-xs text-ink-3">
                {t({ zh: '种子（0 ~ 52，留空随机）', en: 'Seed (0 ~ 52, blank = random)' })}
                <Input
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  inputMode="numeric"
                  aria-label={t({ zh: 'Type 7 种子', en: 'Type 7 seed' })}
                  className="h-8 w-20 text-xs"
                />
              </label>
            ) : null}
          </>
        }
        helpText={t({
          zh: 'Cisco IOS Type 7（XL）是可逆的弱混淆：密文 = 明文 XOR 53 字符替换表（从种子位开始滚动）。仅供恢复遗忘的设备口令与学习用途。',
          en: 'Cisco IOS type-7 (XL) is reversible weak obfuscation: ciphertext = plaintext XOR a 53-character substitution table (rotating from the seed position). Only for recovering forgotten device passwords and for learning.',
        })}
      />

      <ToolAlert
        tone="warning"
        title={{ zh: 'Type 7 不是安全加密', en: 'Type 7 is not secure encryption' }}
        hint={{
          zh: '任何拿到配置片段的人都可用本工具秒级还原口令；生产环境请启用 secret（MD5/SHA-256 派生）。所有换算在本地完成，不上传。',
          en: 'Anyone with a config snippet can reverse the password in seconds using this tool; enable secrets (MD5/SHA-256 derived) in production. All conversions run locally and are never uploaded.',
        }}
      />
    </div>
  );
}
