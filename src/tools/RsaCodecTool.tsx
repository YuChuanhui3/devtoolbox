import { useState } from 'react';
import { Download, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { Textarea } from '@/components/ui/Textarea';
import { CopyIconButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import {
  generateRsaKeyPairPem,
  rsaDecryptOaep,
  rsaEncryptOaep,
  rsaSign,
  rsaVerify,
  type RsaBits,
  type SignatureScheme,
} from '@/lib/rsa';

type Operation = 'encrypt' | 'decrypt' | 'sign' | 'verify';

const OPERATION_LABEL: Record<Operation, L10n> = {
  encrypt: { zh: '公钥加密', en: 'Public-key encryption' },
  decrypt: { zh: '私钥解密', en: 'Private-key decryption' },
  sign: { zh: '私钥签名', en: 'Private-key signing' },
  verify: { zh: '公钥验签', en: 'Public-key verification' },
};

export default function RsaCodecTool() {
  const { t } = useI18n();
  const [bits, setBits] = useState<RsaBits>(2048);
  const [generating, setGenerating] = useState(false);
  const [publicKeyPem, setPublicKeyPem] = useState('');
  const [privateKeyPem, setPrivateKeyPem] = useState('');
  const [operation, setOperation] = useState<Operation>('encrypt');
  const [scheme, setScheme] = useState<SignatureScheme>('RSA2');
  const [message, setMessage] = useState('');
  const [signatureInput, setSignatureInput] = useState('');
  const [result, setResult] = useState('');
  const [verifyOk, setVerifyOk] = useState<boolean | null>(null);
  const [error, setError] = useState<Localized | null>(null);
  const [running, setRunning] = useState(false);

  const keygen = async () => {
    setGenerating(true);
    setError(null);
    try {
      const pair = await generateRsaKeyPairPem(bits);
      setPublicKeyPem(pair.publicKeyPem);
      setPrivateKeyPem(pair.privateKeyPem);
    } catch (e) {
      setError(toToolError(e).localized);
    } finally {
      setGenerating(false);
    }
  };

  const execute = async () => {
    setRunning(true);
    setError(null);
    setVerifyOk(null);
    setResult('');
    try {
      if (operation === 'encrypt') {
        setResult(await rsaEncryptOaep(message, publicKeyPem));
      } else if (operation === 'decrypt') {
        setResult(await rsaDecryptOaep(message, privateKeyPem));
      } else if (operation === 'sign') {
        setResult(await rsaSign(message, privateKeyPem, scheme));
      } else {
        const ok = await rsaVerify(message, signatureInput, publicKeyPem, scheme);
        setVerifyOk(ok);
      }
    } catch (e) {
      const toolError = toToolError(e);
      setError(
        toolError.hint
          ? t({
              zh: `${t(toolError.localized)}（${t(toolError.hint)}）`,
              en: `${t(toolError.localized)} (${t(toolError.hint)})`,
            })
          : t(toolError.localized),
      );
    } finally {
      setRunning(false);
    }
  };

  const isKeyInputNeeded = operation === 'decrypt' || operation === 'sign';

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: '密钥对管理', en: 'Key pair' })}
        subtitle={t({
          zh: 'Web Crypto 本地生成，PKCS#8 / SPKI PEM 格式，也可粘贴已有 PEM 私钥与公钥',
          en: 'Generated locally with Web Crypto as PKCS#8 / SPKI PEM; you can also paste existing PEM keys',
        })}
        bodyClassName="space-y-3 p-4"
        actions={
          <div className="flex items-center gap-1.5">
            <CopyIconButton text={publicKeyPem} label={{ zh: '复制公钥', en: 'Copy public key' }} />
            <CopyIconButton text={privateKeyPem} label={{ zh: '复制私钥', en: 'Copy private key' }} />
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={String(bits)}
            onChange={(value) => setBits(Number(value) as RsaBits)}
            ariaLabel={t({ zh: '密钥长度', en: 'Key length' })}
            options={[
              { value: '2048', label: 'RSA 2048' },
              { value: '4096', label: 'RSA 4096' },
            ]}
          />
          <Button variant="primary" onClick={() => void keygen()} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
            {generating ? t({ zh: '生成中…', en: 'Generating…' }) : t({ zh: '生成密钥对', en: 'Generate key pair' })}
          </Button>
          <span className="text-[11px] text-ink-3">
            {t({ zh: '4096 位生成可能需要十几秒', en: '4096-bit generation can take over ten seconds' })}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs text-ink-3">
            {t({ zh: '公钥（PEM，BEGIN PUBLIC KEY）', en: 'Public key (PEM, BEGIN PUBLIC KEY)' })}
            <Textarea
              value={publicKeyPem}
              onChange={(event) => setPublicKeyPem(event.target.value)}
              placeholder={t({ zh: '粘贴或生成公钥 PEM', en: 'Paste or generate the public key PEM' })}
              rows={7}
              className="mt-1 font-mono text-[11px]"
              spellCheck={false}
            />
          </label>
          <label className="block text-xs text-ink-3">
            {t({ zh: '私钥（PEM，BEGIN PRIVATE KEY）', en: 'Private key (PEM, BEGIN PRIVATE KEY)' })}
            <Textarea
              value={privateKeyPem}
              onChange={(event) => setPrivateKeyPem(event.target.value)}
              placeholder={t({ zh: '粘贴或生成私钥 PEM', en: 'Paste or generate the private key PEM' })}
              rows={7}
              className="mt-1 font-mono text-[11px]"
              spellCheck={false}
            />
          </label>
        </div>
        {error ? <ToolAlert tone="error" title={error} /> : null}
      </Panel>

      <Panel title={t({ zh: '加解密 / 签名验签', en: 'Encrypt / decrypt & sign / verify' })} bodyClassName="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={operation}
            onChange={(value) => {
              setOperation(value);
              setResult('');
              setVerifyOk(null);
              setError(null);
            }}
            ariaLabel={t({ zh: '操作', en: 'Operation' })}
            options={(Object.keys(OPERATION_LABEL) as Operation[]).map((value) => ({
              value,
              label: t(OPERATION_LABEL[value]),
            }))}
          />
          {operation === 'sign' || operation === 'verify' ? (
            <Segmented
              value={scheme}
              onChange={setScheme}
              ariaLabel={t({ zh: '签名算法', en: 'Signature algorithm' })}
              options={[
                { value: 'RSA1', label: 'RSA1（PKCS#1 v1.5）' },
                { value: 'RSA2', label: 'RSA2（PSS）' },
              ]}
            />
          ) : null}
        </div>

        <label className="block text-xs text-ink-3">
          {operation === 'decrypt'
            ? t({ zh: '密文（Base64）', en: 'Ciphertext (Base64)' })
            : operation === 'verify'
              ? t({ zh: '待验签原文', en: 'Original message' })
              : t({ zh: '原文', en: 'Message' })}
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            placeholder={
              operation === 'encrypt'
                ? t({
                    zh: 'RSA-OAEP 适合加密短小敏感内容（如 AES 会话密钥）',
                    en: 'RSA-OAEP suits short sensitive payloads such as an AES session key',
                  })
                : t({ zh: '输入内容', en: 'Enter content' })
            }
            className="mt-1"
          />
        </label>
        {operation === 'verify' ? (
          <label className="block text-xs text-ink-3">
            {t({ zh: '签名（Base64）', en: 'Signature (Base64)' })}
            <Textarea
              value={signatureInput}
              onChange={(event) => setSignatureInput(event.target.value)}
              rows={3}
              placeholder={t({ zh: '粘贴签名结果', en: 'Paste the signature' })}
              className="mt-1 font-mono text-[11px]"
            />
          </label>
        ) : null}
        {(operation === 'decrypt' || operation === 'sign') && !privateKeyPem ? (
          <ToolAlert
            tone="info"
            title={t({
              zh: `${t(OPERATION_LABEL[operation])}需要先在上方准备私钥`,
              en: `${OPERATION_LABEL[operation].en} requires a private key prepared above.`,
            })}
          />
        ) : null}
        {(operation === 'encrypt' || operation === 'verify') && !publicKeyPem ? (
          <ToolAlert
            tone="info"
            title={t({
              zh: `${t(OPERATION_LABEL[operation])}需要先在上方准备公钥`,
              en: `${OPERATION_LABEL[operation].en} requires a public key prepared above.`,
            })}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void execute()} disabled={running || !message || isKeyInputNeeded && !privateKeyPem || (!isKeyInputNeeded && !publicKeyPem)}>
            {running
              ? t({ zh: '处理中…', en: 'Working…' })
              : t({ zh: `执行${t(OPERATION_LABEL[operation])}`, en: `Run ${OPERATION_LABEL[operation].en.toLowerCase()}` })}
          </Button>
          {result && operation !== 'verify' ? (
            <>
              <CopyIconButton text={result} label={{ zh: '复制结果', en: 'Copy result' }} />
              <Button
                variant="secondary"
                onClick={() => {
                  const blobUrl = URL.createObjectURL(new Blob([result], { type: 'text/plain' }));
                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = `${operation}.txt`;
                  a.click();
                  URL.revokeObjectURL(blobUrl);
                }}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {t({ zh: '下载结果', en: 'Download result' })}
              </Button>
            </>
          ) : null}
        </div>

        {verifyOk !== null ? (
          <ToolAlert
            tone={verifyOk ? 'success' : 'error'}
            title={
              verifyOk
                ? { zh: '验签通过：签名与原文、公钥匹配', en: 'Signature valid: it matches the message and public key' }
                : { zh: '验签失败：签名不匹配', en: 'Signature invalid: no match' }
            }
            hint={
              verifyOk
                ? undefined
                : {
                    zh: '请确认签名算法（RSA1/RSA2）、公钥与签名原文与生成时一致。',
                    en: 'Check that the signature algorithm (RSA1/RSA2), public key, and original message match those used when signing.',
                  }
            }
          />
        ) : null}
        {result && operation !== 'verify' ? (
          <Textarea
            value={result}
            readOnly
            rows={4}
            className="font-mono text-[11px]"
            aria-label={t({ zh: '结果输出', en: 'Result output' })}
          />
        ) : null}
      </Panel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '加密使用 RSA-OAEP(SHA-256)；签名支持 RSA1（RSASSA-PKCS1-v1_5）与 RSA2（RSA-PSS），均使用 SHA-256。密钥与内容全部留在浏览器本地，不上传、不保存；RSA 单次加密长度受限，大内容建议用 AES 工具并只加密会话密钥。',
          en: 'Encryption uses RSA-OAEP(SHA-256); signing supports RSA1 (RSASSA-PKCS1-v1_5) and RSA2 (RSA-PSS), both with SHA-256. Keys and content stay local in your browser — never uploaded or stored. RSA encrypts only short payloads, so for large content use the AES tool and encrypt just the session key.',
        })}
      </p>
    </div>
  );
}
