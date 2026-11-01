import { FileKey2, KeyRound, Lock, LockKeyhole } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { AesPanel } from './crypto-toolkit/AesPanel';
import { JwtPanel } from './crypto-toolkit/JwtPanel';
import { RsaPanel } from './crypto-toolkit/RsaPanel';
import { SymCipherPanel } from './crypto-toolkit/SymCipherPanel';

type CryptoToolkitMode = 'aes' | 'symcipher' | 'rsa' | 'jwt';

export default function CryptoToolkitTool() {
  const { t } = useI18n();
  const [mode, setMode] = useToolkitMode<CryptoToolkitMode>(['aes', 'symcipher', 'rsa', 'jwt'], 'aes');

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented<CryptoToolkitMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '加解密工具箱模式', en: 'Crypto toolkit mode' })}
          options={[
            {
              value: 'aes',
              label: 'AES',
              icon: <Lock className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'symcipher',
              label: t({ zh: '经典对称', en: 'Classic' }),
              icon: <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'rsa',
              label: 'RSA',
              icon: <FileKey2 className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'jwt',
              label: 'JWT',
              icon: <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
        />
      </div>

      <div className={mode === 'aes' ? 'contents' : 'hidden'}>
        <AesPanel active={mode === 'aes'} />
      </div>
      <div className={mode === 'symcipher' ? 'contents' : 'hidden'}>
        <SymCipherPanel active={mode === 'symcipher'} />
      </div>
      <div className={mode === 'rsa' ? 'contents' : 'hidden'}>
        <RsaPanel active={mode === 'rsa'} />
      </div>
      <div className={mode === 'jwt' ? 'contents' : 'hidden'}>
        <JwtPanel active={mode === 'jwt'} />
      </div>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '四类加解密工具合并为一个工具箱：AES-GCM/CBC、DES/3DES/Rabbit/RC4、RSA 密钥对与签名验签、JWT 解析 · 密钥与内容全部在浏览器本地处理，不上传、不保存，切换模式不会丢失各自的输入与结果',
          en: 'Four crypto tools in one toolkit: AES-GCM/CBC, DES/3DES/Rabbit/RC4, RSA key pairs and signing, and JWT decoding · keys and content stay local in your browser, never uploaded or stored, and switching modes keeps each panel\'s input and results',
        })}
      </p>
    </div>
  );
}
