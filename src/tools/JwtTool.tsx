import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Clock, KeyRound, ShieldAlert } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { InputPanel, StatsBar } from '@/components/tool/EditorPanels';
import { ActionBar, ClearButton, CopyButton, CopyIconButton, DownloadButton, SampleButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { base64ToText } from '@/lib/base64';
import { ToolError, toToolError } from '@/lib/errors';
import { highlightJson } from '@/lib/json';
import { countTextStats } from '@/lib/text';
import { SAMPLE_JWT } from '@/data/samples';

interface JwtResult {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  rawPayload: string;
}

function decodeSegment(segment: string, label: string): unknown {
  try {
    return JSON.parse(base64ToText(segment));
  } catch {
    throw new ToolError(
      { zh: `JWT ${label} 解码失败`, en: `Failed to decode JWT ${label}` },
      {
        zh: '请确认输入的是完整的 JWT，且 Header / Payload 为合法的 Base64URL JSON。',
        en: 'Make sure the input is a complete JWT with valid Base64URL JSON in Header / Payload.',
      },
    );
  }
}

function decodeJwt(token: string): JwtResult {
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new ToolError(
      { zh: 'JWT 结构不正确', en: 'Invalid JWT structure' },
      {
        zh: 'JWT 应由 Header.Payload.Signature 三段组成，以英文句点分隔。',
        en: 'A JWT consists of Header.Payload.Signature, separated by periods.',
      },
    );
  }

  const header = decodeSegment(parts[0], 'Header');
  const payload = decodeSegment(parts[1], 'Payload');

  if (!header || typeof header !== 'object' || Array.isArray(header)) {
    throw new ToolError(
      { zh: 'JWT Header 不是对象', en: 'JWT Header is not an object' },
      {
        zh: 'Header 应为 JSON 对象，例如 {"alg":"HS256","typ":"JWT"}。',
        en: 'Header should be a JSON object, e.g. {"alg":"HS256","typ":"JWT"}.',
      },
    );
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ToolError(
      { zh: 'JWT Payload 不是对象', en: 'JWT Payload is not an object' },
      { zh: 'Payload 应为 JSON 对象。', en: 'Payload should be a JSON object.' },
    );
  }

  return {
    header: header as Record<string, unknown>,
    payload: payload as Record<string, unknown>,
    signature: parts[2],
    rawPayload: JSON.stringify(payload, null, 2),
  };
}

export default function JwtTool() {
  const { t, locale } = useI18n();
  const [input, setInput] = useState('');
  const [result, setResult] = useState<JwtResult | null>(null);
  const [error, setError] = useState<ToolError | null>(null);
  const debouncedInput = useDebouncedValue(input, 200);

  useEffect(() => {
    const token = debouncedInput.trim();
    if (!token) {
      setResult(null);
      setError(null);
      return;
    }

    try {
      setResult(decodeJwt(token));
      setError(null);
    } catch (caught) {
      setResult(null);
      setError(toToolError(caught));
    }
  }, [debouncedInput]);

  const formatUnix = (timestamp: number) =>
    new Date(timestamp * 1000).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { hour12: false });

  const now = Math.floor(Date.now() / 1000);
  const payload = result?.payload ?? {};
  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  const iat = typeof payload.iat === 'number' ? payload.iat : null;
  const nbf = typeof payload.nbf === 'number' ? payload.nbf : null;
  const isExpired = exp !== null && exp < now;
  const isNotYetValid = nbf !== null && nbf > now;

  const headerJson = useMemo(
    () => (result ? JSON.stringify(result.header, null, 2) : ''),
    [result],
  );
  const stats = useMemo(() => countTextStats(input), [input]);
  const downloadContent = result
    ? JSON.stringify(
        { header: result.header, payload: result.payload, signature: result.signature },
        null,
        2,
      )
    : '';

  const claimRows = [
    ...(exp !== null
      ? [{ key: 'exp', label: t({ zh: 'exp 过期时间', en: 'exp expires' }), value: formatUnix(exp), expired: isExpired }]
      : []),
    ...(iat !== null ? [{ key: 'iat', label: t({ zh: 'iat 签发时间', en: 'iat issued' }), value: formatUnix(iat), expired: null }] : []),
    ...(nbf !== null ? [{ key: 'nbf', label: t({ zh: 'nbf 生效时间', en: 'nbf valid from' }), value: formatUnix(nbf), expired: null }] : []),
  ];

  return (
    <div className="space-y-4">
      <ActionBar>
        <span className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-3">
          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '输入后自动解析', en: 'Parses as you type' })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SampleButton onClick={() => setInput(SAMPLE_JWT)} />
          <ClearButton
            onClick={() => {
              setInput('');
              setResult(null);
              setError(null);
            }}
          />
          <CopyButton text={result?.rawPayload ?? ''} label={{ zh: '复制 Payload', en: 'Copy Payload' }} />
          <DownloadButton filename="jwt.json" content={downloadContent} mime="application/json;charset=utf-8" />
        </div>
      </ActionBar>

      {error ? <ToolAlert tone="error" title={error.localized} hint={error.hint} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          label="JWT Token"
          value={input}
          onChange={setInput}
          placeholder={{ zh: '粘贴 JWT，例如 eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', en: 'Paste a JWT, e.g. eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }}
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '字符', en: 'Chars' }), value: stats.chars },
                { label: t({ zh: '行数', en: 'Lines' }), value: stats.lines },
              ]}
            />
          }
        />

        <div className="space-y-4">
          {result ? (
            <>
              <Panel
                title="Header"
                actions={<CopyIconButton text={headerJson} label={t({ zh: '复制 Header', en: 'Copy Header' })} />}
                bodyClassName="p-0"
              >
                <pre
                  className="code-scroll max-h-40 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-5"
                  dangerouslySetInnerHTML={{ __html: highlightJson(headerJson) }}
                />
              </Panel>

              <Panel
                title="Payload"
                subtitle={t({ zh: `${Object.keys(result.payload).length} 个字段`, en: `${Object.keys(result.payload).length} fields` })}
                actions={<CopyIconButton text={result.rawPayload} label={t({ zh: '复制 Payload', en: 'Copy Payload' })} />}
                bodyClassName="p-0"
              >
                <pre
                  className="code-scroll max-h-64 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-5"
                  dangerouslySetInnerHTML={{ __html: highlightJson(result.rawPayload) }}
                />
              </Panel>

              <Panel title={t({ zh: '签名与时间', en: 'Signature & time' })} bodyClassName="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {exp === null ? (
                    <Badge tone="neutral">{t({ zh: '无 exp 字段', en: 'No exp claim' })}</Badge>
                  ) : isExpired ? (
                    <Badge tone="danger">{t({ zh: '已过期', en: 'Expired' })}</Badge>
                  ) : (
                    <Badge tone="success">{t({ zh: '未过期', en: 'Not expired' })}</Badge>
                  )}
                  {isNotYetValid ? <Badge tone="warning">{t({ zh: '尚未生效', en: 'Not yet valid' })}</Badge> : null}
                  <span className="text-[11px] text-ink-3">
                    {t({ zh: '基于本机时间判断', en: 'Judged against your local clock' })}
                  </span>
                </div>

                {claimRows.length > 0 ? (
                  <ul className="space-y-1.5">
                    {claimRows.map((row) => (
                      <li key={row.key} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="w-28 shrink-0 text-ink-3">{row.label}</span>
                        <span className="font-mono text-[11px] text-ink-2">{row.value}</span>
                        {row.expired !== null ? (
                          <span className={row.expired ? 'text-danger' : 'text-ok'}>
                            {row.expired
                              ? t({ zh: '已过期', en: 'Expired' })
                              : t({ zh: '未过期', en: 'Not expired' })}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-ink-3">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {t({ zh: 'Payload 中没有 exp / iat / nbf 时间字段', en: 'No exp / iat / nbf time claims in the Payload' })}
                  </p>
                )}

                <div className="rounded-xl bg-surface-2 p-2.5">
                  <p className="mb-1 text-[11px] font-medium text-ink-3">Signature</p>
                  <code className="block break-all font-mono text-[11px] leading-5 text-ink-2">
                    {result.signature}
                  </code>
                </div>
              </Panel>
            </>
          ) : (
            <Panel title={t({ zh: '解析结果', en: 'Decoded result' })} bodyClassName="p-4">
              <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
                <BadgeCheck className="h-8 w-8 text-ink-3" aria-hidden="true" />
                <p className="mt-2 text-xs text-ink-3">
                  {t({
                    zh: '输入 JWT 后自动展示 Header、Payload 与过期状态',
                    en: 'Paste a JWT to see its Header, Payload, and expiry status',
                  })}
                </p>
              </div>
            </Panel>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-warn/25 bg-warn-soft px-3.5 py-2.5 text-xs leading-5 text-warn">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {t({
            zh: '本工具仅解析 Token 内容，',
            en: 'This tool only decodes token content; ',
          })}
          <strong>{t({ zh: '不会验证签名', en: 'it does not verify signatures' })}</strong>
          {t({
            zh: '。请勿在此粘贴生产环境的敏感 Token。',
            en: '. Do not paste sensitive production tokens here.',
          })}
        </span>
      </div>
    </div>
  );
}
