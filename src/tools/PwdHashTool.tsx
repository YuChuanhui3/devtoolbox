import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { Textarea } from '@/components/ui/Textarea';
import { CopyIconButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { generatePwdHash, verifyPwdHash, type PwdHashAlgorithm } from '@/lib/pwdhash';

type Mode = 'generate' | 'verify';

export default function PwdHashTool() {
  const { t } = useI18n();
  const [algorithm, setAlgorithm] = useState<PwdHashAlgorithm>('bcrypt');
  const [mode, setMode] = useState<Mode>('generate');
  const [secret, setSecret] = useState('');
  const [cost, setCost] = useState('10');
  const [scryptN, setScryptN] = useState('16384');
  const [hashInput, setHashInput] = useState('');
  const [output, setOutput] = useState('');
  const [verifyOk, setVerifyOk] = useState<boolean | null>(null);
  const [error, setError] = useState<Localized | null>(null);

  const isBcrypt = algorithm === 'bcrypt';

  const run = () => {
    setError(null);
    setVerifyOk(null);
    setOutput('');
    try {
      if (mode === 'generate') {
        if (isBcrypt) {
          setOutput(generatePwdHash('bcrypt', secret, Number(cost)));
        } else {
          setOutput(generatePwdHash('scrypt', secret, 0, { N: Number(scryptN), r: 8, p: 1 }));
        }
      } else {
        setVerifyOk(verifyPwdHash(algorithm, secret, hashInput));
      }
    } catch (e) {
      const toolError = toToolError(e);
      setError(
        toolError.hint
          ? t({
              zh: `${t(toolError.localized)}（${t(toolError.hint ?? '')}）`,
              en: `${t(toolError.localized)} (${t(toolError.hint ?? '')})`,
            })
          : t(toolError.localized),
      );
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: '口令散列（Bcrypt / Scrypt）', en: 'Password hash (Bcrypt / Scrypt)' })}
        subtitle={t({
          zh: '单向散列用于校验口令，不是加密；任何人都拿到散列也无法还原明文',
          en: 'One-way hashing verifies passwords; it is not encryption — a hash cannot be reversed to plaintext',
        })}
        bodyClassName="space-y-3 p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={algorithm}
            onChange={setAlgorithm}
            ariaLabel={t({ zh: '散列算法', en: 'Hash algorithm' })}
            options={[
              { value: 'bcrypt', label: 'Bcrypt' },
              { value: 'scrypt', label: 'Scrypt' },
            ]}
          />
          <Segmented
            value={mode}
            onChange={setMode}
            ariaLabel={t({ zh: '模式', en: 'Mode' })}
            options={[
              { value: 'generate', label: t({ zh: '生成散列', en: 'Generate hash' }) },
              { value: 'verify', label: t({ zh: '校验口令', en: 'Verify password' }) },
            ]}
          />
          {mode === 'generate' && isBcrypt ? (
            <label className="flex items-center gap-1.5 text-xs text-ink-3">
              {t({ zh: 'cost 因子', en: 'cost factor' })}
              <Input
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                inputMode="numeric"
                aria-label="bcrypt cost"
                className="h-8 w-20 text-xs"
              />
              <span>{t({ zh: '（4 ~ 15，默认 10）', en: '(4 ~ 15, default 10)' })}</span>
            </label>
          ) : null}
          {mode === 'generate' && !isBcrypt ? (
            <label className="flex items-center gap-1.5 text-xs text-ink-3">
              {t({ zh: 'N（CPU/内存成本，2 的幂）', en: 'N (CPU/memory cost, power of two)' })}
              <Input
                value={scryptN}
                onChange={(event) => setScryptN(event.target.value)}
                inputMode="numeric"
                aria-label="scrypt N"
                className="h-8 w-24 text-xs"
              />
              <span>{t({ zh: '（r=8、p=1）', en: '(r=8, p=1)' })}</span>
            </label>
          ) : null}
        </div>

        <label className="block text-xs text-ink-3">
          {t({ zh: '口令', en: 'Password' })}
          <Input
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder={
              mode === 'generate'
                ? t({ zh: '输入需要生成散列的口令', en: 'Enter the password to hash' })
                : t({ zh: '输入待校验的口令', en: 'Enter the password to verify' })
            }
            autoComplete="off"
            className="mt-1"
          />
        </label>
        {mode === 'verify' ? (
          <label className="block text-xs text-ink-3">
            {t({ zh: '已有散列', en: 'Existing hash' })}
            <Textarea
              value={hashInput}
              onChange={(event) => setHashInput(event.target.value)}
              rows={3}
              placeholder={
                isBcrypt
                  ? t({ zh: '$2b$10$… 或 $2y$…', en: '$2b$10$… or $2y$…' })
                  : t({ zh: 'scrypt$N$r$p$盐(HEX)$散列(HEX)', en: 'scrypt$N$r$p$salt(HEX)$hash(HEX)' })
              }
              className="mt-1 font-mono text-[11px]"
              spellCheck={false}
            />
          </label>
        ) : null}

        <Button variant="primary" onClick={run}>
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {mode === 'generate'
            ? t({ zh: '生成散列', en: 'Generate hash' })
            : t({ zh: '开始校验', en: 'Verify' })}
        </Button>

        {error ? <ToolAlert tone="error" title={error} /> : null}
        {verifyOk !== null ? (
          <ToolAlert
            tone={verifyOk ? 'success' : 'error'}
            title={
              verifyOk
                ? { zh: '校验通过：口令与散列匹配', en: 'Match: the password fits the hash' }
                : { zh: '校验失败：口令不匹配', en: 'No match: wrong password' }
            }
          />
        ) : null}
        {output ? (
          <div className="flex items-start gap-2">
            <Textarea
              value={output}
              readOnly
              rows={3}
              className="flex-1 font-mono text-[11px]"
              aria-label={t({ zh: '散列结果', en: 'Hash output' })}
            />
            <CopyIconButton text={output} label={{ zh: '复制散列', en: 'Copy hash' }} />
          </div>
        ) : null}
      </Panel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: 'Bcrypt 输出 $2b$…（可映射为 $2y$ 供 Apache 使用），Scrypt 采用本工具自描述的 scrypt$N$r$p$salt$hash 格式。高 cost/N 会更慢更安全；口令仅在浏览器本地计算，不会上传。',
          en: 'Bcrypt outputs $2b$… (remappable to $2y$ for Apache); Scrypt uses this tool\'s self-describing scrypt$N$r$p$salt$hash format. Higher cost/N is slower but safer; passwords are hashed locally in your browser and never uploaded.',
        })}
      </p>
    </div>
  );
}
