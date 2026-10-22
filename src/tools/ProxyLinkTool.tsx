import { useState, type ReactNode } from 'react';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { CopyButton, CopyIconButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { ToolError, toToolError } from '@/lib/errors';
import {
  buildSsLink,
  buildSsrLink,
  buildVmessLink,
  parseSsLink,
  parseSsrLink,
  parseVmessLink,
  type ProxyProtocol,
} from '@/lib/proxyLink';

type Mode = 'parse' | 'build';

interface FieldDef {
  key: string;
  label: Localized;
  placeholder?: string;
}

const FIELD_DEFS: Record<ProxyProtocol, FieldDef[]> = {
  vmess: [
    { key: 'ps', label: { zh: '备注（ps）', en: 'Remarks (ps)' } },
    { key: 'add', label: { zh: '地址（add）', en: 'Address (add)' } },
    { key: 'port', label: { zh: '端口（port）', en: 'Port (port)' } },
    { key: 'id', label: { zh: '用户 ID（uuid）', en: 'User ID (uuid)' } },
    { key: 'aid', label: { zh: '额外 ID（aid）', en: 'Extra ID (aid)' } },
    { key: 'scy', label: { zh: '加密（scy）', en: 'Encryption (scy)' } },
    { key: 'net', label: { zh: '传输协议（net）', en: 'Transport (net)' } },
    { key: 'type', label: { zh: '头类型（type）', en: 'Header type (type)' } },
    { key: 'host', label: 'Host' },
    { key: 'path', label: 'Path' },
    { key: 'tls', label: 'TLS' },
    { key: 'sni', label: 'SNI' },
  ],
  ss: [
    { key: 'method', label: { zh: '加密方式（method）', en: 'Cipher (method)' }, placeholder: 'aes-256-gcm' },
    { key: 'password', label: { zh: '口令（password）', en: 'Password (password)' } },
    { key: 'server', label: { zh: '服务器（host）', en: 'Server (host)' } },
    { key: 'port', label: { zh: '端口', en: 'Port' } },
    { key: 'name', label: { zh: '备注名称', en: 'Display name' } },
  ],
  ssr: [
    { key: 'server', label: { zh: '服务器', en: 'Server' } },
    { key: 'port', label: { zh: '端口', en: 'Port' } },
    { key: 'protocol', label: { zh: '协议（protocol）', en: 'Protocol (protocol)' }, placeholder: 'origin' },
    { key: 'method', label: { zh: '加密（method）', en: 'Cipher (method)' }, placeholder: 'aes-256-cfb' },
    { key: 'obfs', label: { zh: '混淆（obfs）', en: 'Obfuscation (obfs)' }, placeholder: 'plain' },
    { key: 'password', label: { zh: '口令', en: 'Password' } },
    { key: 'protocolParam', label: { zh: '协议参数（protoparam）', en: 'Protocol param (protoparam)' } },
    { key: 'obfsParam', label: { zh: '混淆参数（obfsparam）', en: 'Obfs param (obfsparam)' } },
    { key: 'name', label: { zh: '备注（remarks）', en: 'Remarks (remarks)' } },
  ],
};

const SAMPLES: Record<ProxyProtocol, string> = {
  vmess: 'vmess://',
  ss: 'ss://',
  ssr: 'ssr://',
};

export default function ProxyLinkTool() {
  const { t } = useI18n();
  const [protocol, setProtocol] = useState<ProxyProtocol>('vmess');
  const [mode, setMode] = useState<Mode>('parse');
  const [link, setLink] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [parsed, setParsed] = useState<Record<string, unknown> | null>(null);
  const [built, setBuilt] = useState('');
  const [error, setError] = useState<Localized | null>(null);

  const describeError = (e: unknown): Localized => {
    const toolError = toToolError(e);
    return toolError.hint
      ? t({
          zh: `${t(toolError.localized)}（${t(toolError.hint)}）`,
          en: `${t(toolError.localized)} (${t(toolError.hint)})`,
        })
      : t(toolError.localized);
  };

  const parse = () => {
    setError(null);
    setBuilt('');
    try {
      if (!link.trim()) throw new ToolError({ zh: '请粘贴要解析的链接', en: 'Paste a link to parse' });
      const result =
        protocol === 'vmess' ? parseVmessLink(link) : protocol === 'ss' ? parseSsLink(link) : parseSsrLink(link);
      setParsed(result as Record<string, unknown>);
      const next: Record<string, string> = {};
      for (const def of FIELD_DEFS[protocol]) {
        const raw = (result as Record<string, unknown>)[def.key];
        next[def.key] = raw === undefined || raw === null ? '' : String(raw);
      }
      setFields(next);
    } catch (e) {
      setParsed(null);
      setError(describeError(e));
    }
  };

  const build = () => {
    setError(null);
    try {
      const linkOut =
        protocol === 'vmess'
          ? buildVmessLink(fields)
          : protocol === 'ss'
            ? buildSsLink(fields as never)
            : buildSsrLink(fields as never);
      setBuilt(linkOut);
      setLink(linkOut);
    } catch (e) {
      setBuilt('');
      setError(describeError(e));
    }
  };

  const parsedRows = parsed
    ? Object.entries(parsed).filter(([, value]) => value !== '' && value !== undefined && value !== null)
    : [];

  let formBody: ReactNode = (
    <div className="grid gap-3 sm:grid-cols-2">
      {FIELD_DEFS[protocol].map((def) => (
        <label key={def.key} className="block text-xs text-ink-3">
          {t(def.label)}
          <Input
            value={fields[def.key] ?? ''}
            onChange={(event) => setFields((current) => ({ ...current, [def.key]: event.target.value }))}
            placeholder={def.placeholder}
            className="mt-1 font-mono text-xs"
            autoComplete="off"
          />
        </label>
      ))}
    </div>
  );
  if (protocol !== 'vmess') formBody = <div>{formBody}</div>;

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: '节点链接解析 / 生成', en: 'Node link parse / build' })}
        subtitle={t({ zh: '仅做 Base64 编解码与字段展示，不联网、不上传、不保存', en: 'Base64 encode/decode and field display only — no network, no uploads, no storage' })}
        bodyClassName="space-y-3 p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={protocol}
            onChange={(value) => {
              setProtocol(value);
              setParsed(null);
              setBuilt('');
              setError(null);
              setFields({});
            }}
            ariaLabel={t({ zh: '代理协议', en: 'Proxy protocol' })}
            options={[
              { value: 'vmess', label: 'VMess' },
              { value: 'ss', label: 'Shadowsocks' },
              { value: 'ssr', label: 'SSR' },
            ]}
          />
          <Segmented
            value={mode}
            onChange={(value) => {
              setMode(value);
              setError(null);
            }}
            ariaLabel={t({ zh: '模式', en: 'Mode' })}
            options={[
              { value: 'parse', label: t({ zh: '解析链接', en: 'Parse link' }) },
              { value: 'build', label: t({ zh: '生成链接', en: 'Build link' }) },
            ]}
          />
        </div>

        {mode === 'parse' ? (
          <div className="space-y-2">
            <Textarea
              value={link}
              onChange={(event) => setLink(event.target.value)}
              rows={4}
              mono
              spellCheck={false}
              placeholder={t({ zh: `粘贴 ${SAMPLES[protocol]} 开头的节点链接`, en: `Paste a node link starting with ${SAMPLES[protocol]}` })}
            />
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={parse}>
                {t({ zh: '解析', en: 'Parse' })}
              </Button>
              {parsedRows.length ? <CopyButton text={link} label={{ zh: '复制原链接', en: 'Copy original link' }} /> : null}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {formBody}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={build}>
                {t({ zh: '生成链接', en: 'Build link' })}
              </Button>
              {built ? (
                <>
                  <CopyButton text={built} label={{ zh: '复制链接', en: 'Copy link' }} />
                  <CopyIconButton text={built} label={{ zh: '复制链接图标', en: 'Copy link icon' }} />
                </>
              ) : null}
            </div>
            {built ? (
              <Textarea
                value={built}
                readOnly
                rows={3}
                mono
                className="text-[11px]"
                aria-label={t({ zh: '生成结果', en: 'Generated output' })}
              />
            ) : null}
          </div>
        )}
        {error ? <ToolAlert tone="error" title={error} /> : null}
      </Panel>

      {parsedRows.length ? (
        <Panel title={t({ zh: '解析结果', en: 'Parsed result' })} subtitle={t({ zh: 'VMess 保留原始 JSON 字段', en: 'VMess keeps the original JSON fields' })} bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {parsedRows.map(([key, value]) => (
              <li key={key} className="flex items-start gap-3 px-4 py-2.5">
                <span className="w-32 shrink-0 text-xs text-ink-3">{key}</span>
                <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </code>
                <CopyIconButton text={String(value)} label={t({ zh: `复制 ${key}`, en: `Copy ${key}` })} />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: 'VMess：Base64(JSON)；SS：支持 SIP002（Base64(method:口令)@host:port#名）与传统格式；SSR：Base64URL 冒号字段加可选参数。节点凭据属于敏感信息，请仅在本地处理。',
          en: 'VMess: Base64(JSON); SS: SIP002 (Base64(method:password)@host:port#name) and legacy formats; SSR: Base64URL colon-separated fields plus optional params. Node credentials are sensitive — process them locally only.',
        })}
      </p>
    </div>
  );
}
