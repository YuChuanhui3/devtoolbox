import type { pki as ForgePki } from 'node-forge';
import { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { ActionBar, CopyButton, DownloadButton } from '@/components/tool/ToolActions';
import { ToolError } from '@/lib/errors';
import { derToPem } from '@/lib/pem';

interface CertResult {
  commonName: string;
  notBefore: Date;
  notAfter: Date;
  keyPem: string;
  certPem: string;
  serial: string;
}

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

interface AltNameEntry {
  type: 2 | 7;
  ip?: string;
  dns?: string;
  value?: string;
}

function parseSans(raw: string): AltNameEntry[] {
  const tokens = raw
    .split(/[,，\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens.map((token) =>
    IPV4_RE.test(token)
      ? { type: 7 as const, ip: token, value: token }
      : { type: 2 as const, dns: token, value: token },
  );
}

async function generateCert(options: {
  bits: number;
  commonName: string;
  organization: string;
  days: number;
  sans: string;
}): Promise<CertResult> {
  const commonName = options.commonName.trim();
  if (!commonName)
    throw new ToolError(
      { zh: '请填写通用名称（CN）', en: 'Please enter the common name (CN)' },
      { zh: '浏览器与 openssl 都依赖 CN 校验域名，例如 localhost 或 example.com。', en: 'Both browsers and openssl rely on the CN to validate the domain, e.g. localhost or example.com.' },
    );
  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 3650) {
    throw new ToolError(
      { zh: '有效天数需在 1 到 3650 之间', en: 'Valid days must be between 1 and 3650' },
      { zh: '自签名证书建议不超过 825 天（主流浏览器对长期证书更严格）。', en: 'Self-signed certificates should stay under 825 days (mainstream browsers are stricter for long-lived certs).' },
    );
  }

  // 只有真的点「生成证书」才需要 node-forge（约 300 kB）；放在校验之后，避免无效输入触发下载。
  type Forge = typeof import('node-forge');
  const loaded: { default?: Forge } & Forge = await import('node-forge');
  const forge = loaded.default ?? loaded;

  // node-forge 的纯 JS RSA 密钥生成极慢，交给 Web Crypto 生成后回填给 forge 做证书签名。
  const subtleKey = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: options.bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', subtleKey.privateKey);
  const spki = await crypto.subtle.exportKey('spki', subtleKey.publicKey);
  const keys = {
    privateKey: forge.pki.privateKeyFromPem(derToPem(new Uint8Array(pkcs8), 'PRIVATE KEY')),
    publicKey: forge.pki.publicKeyFromPem(derToPem(new Uint8Array(spki), 'PUBLIC KEY')),
  };
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = forge.util.bytesToHex(forge.random.getBytesSync(16)).toUpperCase();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(cert.validity.notBefore.getTime() + options.days * 86_400_000);

  const attrs: ForgePki.CertificateField[] = [
    { shortName: 'C', value: 'CN' },
    ...(options.organization.trim() ? [{ shortName: 'O', value: options.organization.trim() }] : []),
    { shortName: 'CN', value: commonName },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  const altNames = parseSans(options.sans);
  if (commonName && !altNames.some((item) => item.dns === commonName || item.ip === commonName)) {
    altNames.push(...parseSans(commonName));
  }
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      ...(options.bits >= 2048 ? { keyCertSign: false, cRLSign: false } : {}),
    },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    commonName,
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certPem: forge.pki.certificateToPem(cert),
    serial: cert.serialNumber,
  };
}

export default function SslCertTool() {
  const { t, locale } = useI18n();
  const [bits, setBits] = useState<'2048' | '4096'>('2048');
  const [commonName, setCommonName] = useState('localhost');
  const [organization, setOrganization] = useState('');
  const [days, setDays] = useState('365');
  const [sans, setSans] = useState('');
  const [result, setResult] = useState<CertResult | null>(null);
  const [error, setError] = useState<Localized | null>(null);
  const [hint, setHint] = useState<Localized | undefined>(undefined);
  const [isRunning, setIsRunning] = useState(false);

  const generate = async () => {
    setError(null);
    setHint(undefined);
    setIsRunning(true);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      setResult(
        await generateCert({
          bits: Number(bits),
          commonName,
          organization,
          days: Number(days),
          sans,
        }),
      );
    } catch (cause) {
      setResult(null);
      if (cause instanceof ToolError) {
        setError(cause.localized);
        setHint(cause.hint);
      } else {
        setError({ zh: '生成失败', en: 'Generation failed' });
        setHint(String(cause));
      }
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <ActionBar>
        <Button variant="primary" onClick={generate} disabled={isRunning}>
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          )}
          {isRunning ? t({ zh: '生成中（约几秒）…', en: 'Generating (a few seconds)…' }) : t({ zh: '生成证书', en: 'Generate certificate' })}
        </Button>
        <span className="px-1 text-xs text-ink-3">
          {t({ zh: 'RSA + SHA-256 自签名，全部在本地浏览器完成', en: 'RSA + SHA-256 self-signed, entirely in your local browser' })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {result ? <CopyButton text={result.certPem} label={{ zh: '复制证书', en: 'Copy certificate' }} /> : null}
          {result ? <CopyButton text={result.keyPem} label={{ zh: '复制私钥', en: 'Copy private key' }} /> : null}
        </div>
      </ActionBar>

      {error ? <ToolAlert tone="error" title={error} hint={hint} /> : null}
      {result ? (
        <ToolAlert
          tone="warning"
          title={{ zh: '自签名证书仅供本地开发使用', en: 'Self-signed certificates are for local development only' }}
          hint={{
            zh: '浏览器默认不信任，需在系统/浏览器证书存储中安装本证书（而非私钥）后才会显示安全锁图标；生产环境请使用受信任 CA 签发的证书。',
            en: 'Browsers do not trust it by default — install the certificate (not the private key) into your system/browser trust store to get the lock icon; use a CA-issued certificate in production.',
          }}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title={t({ zh: '证书参数', en: 'Certificate parameters' })} bodyClassName="space-y-4 p-4">
          <div>
            <p className="mb-2 text-sm text-ink-2">{t({ zh: '密钥长度', en: 'Key length' })}</p>
            <Segmented
              ariaLabel={t({ zh: '密钥长度', en: 'Key length' })}
              value={bits}
              onChange={setBits}
              options={[
                { value: '2048', label: 'RSA 2048' },
                { value: '4096', label: 'RSA 4096' },
              ]}
            />
            <p className="mt-1.5 text-xs text-ink-3">
              {t({ zh: '4096 位生成耗时明显更长，本地开发 2048 位已足够。', en: '4096-bit generation is noticeably slower; 2048 bits is enough for local development.' })}
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="ssl-cn" className="mb-1 block text-sm text-ink-2">
                {t({ zh: '通用名称 CN（必填）', en: 'Common name CN (required)' })}
              </label>
              <Input
                id="ssl-cn"
                value={commonName}
                onChange={(event) => setCommonName(event.target.value)}
                placeholder={t({ zh: 'localhost 或 example.com', en: 'localhost or example.com' })}
              />
            </div>
            <div>
              <label htmlFor="ssl-org" className="mb-1 block text-sm text-ink-2">
                {t({ zh: '组织名称 O（可选）', en: 'Organization O (optional)' })}
              </label>
              <Input
                id="ssl-org"
                value={organization}
                onChange={(event) => setOrganization(event.target.value)}
                placeholder="My Company"
              />
            </div>
            <div>
              <label htmlFor="ssl-days" className="mb-1 block text-sm text-ink-2">
                {t({ zh: '有效期（天）', en: 'Validity (days)' })}
              </label>
              <Input
                id="ssl-days"
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="ssl-san" className="mb-1 block text-sm text-ink-2">
                {t({ zh: '备用名称 SAN（可选，逗号分隔）', en: 'Subject Alternative Name SAN (optional, comma-separated)' })}
              </label>
              <Input
                id="ssl-san"
                value={sans}
                onChange={(event) => setSans(event.target.value)}
                placeholder="dev.example.com, 127.0.0.1"
              />
              <p className="mt-1 text-xs text-ink-3">
                {t({ zh: '现代浏览器只看 SAN；CN 会自动加入 SAN 列表。', en: 'Modern browsers only check SAN; the CN is added to the SAN list automatically.' })}
              </p>
            </div>
          </div>
        </Panel>

        <Panel
          title={t({ zh: '生成结果', en: 'Result' })}
          subtitle={result ? `CN=${result.commonName} · ${t({ zh: '序列号', en: 'serial' })} ${result.serial.slice(0, 12)}…` : t({ zh: '等待生成', en: 'Awaiting generation' })}
          bodyClassName="p-0"
        >
          {result ? (
            <div className="space-y-3 p-4">
              <p className="text-xs text-ink-3">
                {t({ zh: '有效期：', en: 'Validity: ' })}
                {result.notBefore.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')} —{' '}
                {result.notAfter.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}
              </p>
              <div className="space-y-3">
                <PemBlock label={t({ zh: '私钥 private_key.pem', en: 'Private key private_key.pem' })} pem={result.keyPem} filename="private_key.pem" />
                <PemBlock label={t({ zh: '证书 certificate.pem', en: 'Certificate certificate.pem' })} pem={result.certPem} filename="certificate.pem" />
              </div>
            </div>
          ) : (
            <div className="flex min-h-[280px] items-center justify-center px-4 text-xs text-ink-3">
              {t({ zh: '填写参数后点击「生成证书」，私钥与证书均保留在浏览器内存中', en: 'Fill in the parameters and click Generate certificate; the private key and certificate stay in browser memory' })}
            </div>
          )}
        </Panel>
      </div>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '私钥不会离开本机：不上传、不写入草稿存储。关闭页面即消失，请立即下载妥善保存。', en: 'The private key never leaves this machine: no uploads, no draft storage. It disappears when the page closes — download and store it safely right away.' })}
      </p>
    </div>
  );
}

function PemBlock({ label, pem, filename }: { label: string; pem: string; filename: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/60">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-xs font-medium text-ink-2">{label}</span>
        <div className="flex items-center gap-1">
          <CopyButton text={pem} label={{ zh: '复制', en: 'Copy' }} variant="ghost" size="sm" />
          <DownloadButton
            filename={filename}
            content={pem}
            mime="application/x-pem-file"
            label={{ zh: '下载', en: 'Download' }}
            variant="ghost"
            size="sm"
          />
        </div>
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[11px] leading-5 text-ink-2">
        {pem}
      </pre>
    </div>
  );
}
