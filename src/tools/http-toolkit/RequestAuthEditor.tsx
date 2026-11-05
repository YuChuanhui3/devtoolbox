import { useState, type ReactNode } from 'react';
import { KeyRound, LogIn, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/tool/ToolActions';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { useToast } from '@/components/ui/Toast';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { copyText } from '@/lib/clipboard';
import { toToolError } from '@/lib/errors';
import { beginAuthCode, fetchToken, type OAuthToken } from '@/lib/apiworkbench/oauth';
import type { WbAuth, WbAuthType } from '@/lib/apiworkbench/types';
import { TokenConsentModal } from './TokenConsentModal';

const GRANTS = [
  { value: 'client_credentials', zh: '客户端凭据', en: 'Client credentials' },
  { value: 'password', zh: '密码', en: 'Password' },
  { value: 'authorization_code', zh: '授权码 + PKCE', en: 'Auth code + PKCE' },
] as const;

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="block text-[11px] font-medium text-ink-3">
        {label}
        {hint ? <span className="ml-1 font-normal text-ink-3">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

/** 回调地址必须落在本站：HashRouter 下授权码会挂在 hash 的查询串里。 */
export function suggestedRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/tools/http-simulator?mode=request`;
}

interface Props {
  auth: WbAuth;
  /** 当前集合 + 环境的合并 scope：Token URL、client_id 等都可写 {{var}}。 */
  scope: Record<string, string>;
  /** 授权码流程要记住令牌属于哪个请求。 */
  requestId: string;
  onChange: (next: WbAuth) => void;
}

export function RequestAuthEditor({ auth, scope, requestId, onChange }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Localized | null>(null);
  /** 取到但还没决定要不要落盘的令牌：存不存由人点头。 */
  const [pendingToken, setPendingToken] = useState<OAuthToken | null>(null);

  const patch = (next: Partial<WbAuth>) => {
    setError(null);
    onChange({ ...auth, ...next });
  };

  const grant = auth.grantType ?? 'client_credentials';
  const offline = typeof window !== 'undefined' && window.location.protocol === 'file:';
  const expired = typeof auth.expiresAt === 'number' && auth.expiresAt <= Date.now();

  const applyToken = (token: OAuthToken) => {
    setPendingToken(null);
    onChange({
      ...auth,
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      ...(typeof token.expiresAt === 'number' ? { expiresAt: token.expiresAt } : { expiresAt: undefined }),
    });
  };

  /** 不存就丢弃，但别让人白跑一趟授权：顺手复制到剪贴板，复制不了就说清楚。 */
  const discardToken = async () => {
    const token = pendingToken;
    setPendingToken(null);
    if (!token) return;
    const copied = await copyText(token.accessToken);
    toast.info(t(copied
      ? { zh: '令牌没有存到本机，已复制到剪贴板', en: 'The token was not stored; it is on your clipboard' }
      : { zh: '令牌没有存到本机，浏览器也拒绝了剪贴板，这次就丢弃了', en: 'The token was not stored and the clipboard was denied, so it is gone' }));
  };

  const runTokenRequest = async () => {
    setBusy(true);
    setError(null);
    try {
      setPendingToken(await fetchToken(auth.tokenUrl ?? '', {
        grantType: grant === 'password' ? 'password' : 'client_credentials',
        clientId: auth.clientId ?? '',
        clientSecret: auth.clientSecret,
        scope: auth.scope,
        username: auth.username,
        password: auth.password,
      }, { scope }));
    } catch (caught) {
      setError(toToolError(caught).localized);
    } finally {
      setBusy(false);
    }
  };

  const startAuthCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await beginAuthCode({
        requestId,
        authUrl: auth.authUrl ?? '',
        tokenUrl: auth.tokenUrl ?? '',
        clientId: auth.clientId ?? '',
        clientSecret: auth.clientSecret,
        scope: auth.scope,
        redirectUri: auth.redirectUri || suggestedRedirectUri(),
      });
      // 整页跳走：sessionStorage 里的 verifier/state 要活过这次导航，弹窗做不到。
      window.location.assign(url);
    } catch (caught) {
      setError(toToolError(caught).localized);
      setBusy(false);
    }
  };

  const tokenRow = auth.accessToken ? (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface-2/60 px-2.5 py-1.5">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ok" aria-hidden="true" />
      <span className="min-w-0 truncate font-mono text-[11px] text-ink-2" title={`${auth.tokenType ?? 'Bearer'} ${auth.accessToken}`}>
        {auth.tokenType ?? 'Bearer'} · {auth.accessToken.slice(0, 6)}…{auth.accessToken.slice(-4)}
      </span>
      {typeof auth.expiresAt === 'number' ? (
        <Badge tone={expired ? 'warning' : 'neutral'}>
          {expired
            ? t({ zh: '已过期', en: 'Expired' })
            : t({ zh: `到 ${new Date(auth.expiresAt).toLocaleTimeString(undefined, { hour12: false })}`, en: `until ${new Date(auth.expiresAt).toLocaleTimeString(undefined, { hour12: false })}` })}
        </Badge>
      ) : (
        <Badge tone="neutral">{t({ zh: '无有效期', en: 'No expiry' })}</Badge>
      )}
      <span className="ml-auto flex items-center gap-1">
        <CopyButton text={auth.accessToken} label={{ zh: '复制令牌', en: 'Copy token' }} />
        <Button variant="ghost" size="sm" onClick={() => patch({ accessToken: undefined, expiresAt: undefined })} aria-label={t({ zh: '清除令牌', en: 'Clear token' })}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </span>
    </div>
  ) : null;

  return (
    <div className="min-w-0 space-y-2.5">
      <Segmented<WbAuthType>
        size="sm"
        value={auth.type}
        onChange={(type) => patch({ type })}
        ariaLabel={t({ zh: '认证方式', en: 'Auth type' })}
        options={[
          { value: 'none', label: t({ zh: '无', en: 'None' }) },
          { value: 'basic', label: 'Basic' },
          { value: 'bearer', label: 'Bearer' },
          { value: 'api-key', label: t({ zh: 'API Key', en: 'API Key' }) },
          { value: 'oauth2', label: 'OAuth 2.0' },
        ]}
      />

      {error ? <ToolAlert tone="error" title={error} /> : null}

      {auth.type === 'none' ? (
        <p className="text-[11px] text-ink-3">{t({ zh: '不加任何认证头。需要认证请在上面选一种。', en: 'No auth headers are added. Pick a type above.' })}</p>
      ) : null}

      {auth.type === 'basic' ? (
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <Field label={t({ zh: '用户名', en: 'Username' })}>
            <Input size="sm" value={auth.username ?? ''} onChange={(e) => patch({ username: e.target.value })} placeholder="username" mono />
          </Field>
          <Field label={t({ zh: '密码', en: 'Password' })}>
            <Input size="sm" type="password" value={auth.password ?? ''} onChange={(e) => patch({ password: e.target.value })} placeholder="password 或 {{password}}" mono />
          </Field>
        </div>
      ) : null}

      {auth.type === 'bearer' ? (
        <Field label={t({ zh: 'Token', en: 'Token' })}>
          <Input size="sm" type="password" value={auth.token ?? ''} onChange={(e) => patch({ token: e.target.value })} placeholder="token 或 {{token}}" mono />
        </Field>
      ) : null}

      {auth.type === 'api-key' ? (
        <div className="min-w-0 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-ink-3">{t({ zh: '注入位置', en: 'Add to' })}</span>
            <Segmented<'header' | 'query'>
              size="sm"
              value={auth.in === 'query' ? 'query' : 'header'}
              onChange={(inWhere) => patch({ in: inWhere })}
              ariaLabel={t({ zh: 'API Key 注入位置', en: 'API key location' })}
              options={[
                { value: 'header', label: t({ zh: '请求头', en: 'Header' }) },
                { value: 'query', label: t({ zh: '查询参数', en: 'Query' }) },
              ]}
            />
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <Field label={auth.in === 'query' ? t({ zh: '参数名', en: 'Parameter key' }) : t({ zh: '请求头名', en: 'Header name' })}>
              <Input size="sm" value={auth.key ?? ''} onChange={(e) => patch({ key: e.target.value })} placeholder={auth.in === 'query' ? 'api_key' : 'X-API-Key'} mono />
            </Field>
            <Field label={t({ zh: '值', en: 'Value' })}>
              <Input size="sm" type="password" value={auth.value ?? ''} onChange={(e) => patch({ value: e.target.value })} placeholder="value 或 {{apiKey}}" mono />
            </Field>
            {auth.in !== 'query' ? (
              <Field label={t({ zh: '前缀', en: 'Prefix' })} hint={t({ zh: '可留空', en: 'optional' })}>
                <Input size="sm" value={auth.headerPrefix ?? ''} onChange={(e) => patch({ headerPrefix: e.target.value })} placeholder="Bearer" mono />
              </Field>
            ) : null}
          </div>
          {auth.in === 'query' ? (
            <p className="text-[11px] text-ink-3">{t({ zh: '值会原样追加到查询串末尾，只转义百分号保留的字符。', en: 'The value is appended to the query string as-is, escaping only what percent-encoding reserves.' })}</p>
          ) : null}
        </div>
      ) : null}

      {auth.type === 'oauth2' ? (
        <div className="min-w-0 space-y-2.5">
          <Segmented<(typeof GRANTS)[number]['value']>
            size="sm"
            value={grant}
            onChange={(grantType) => patch({ grantType })}
            ariaLabel={t({ zh: '授权类型', en: 'Grant type' })}
            options={GRANTS.map((g) => ({ value: g.value, label: t({ zh: g.zh, en: g.en }) }))}
          />
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <Field label={t({ zh: 'Client ID', en: 'Client ID' })}>
              <Input size="sm" value={auth.clientId ?? ''} onChange={(e) => patch({ clientId: e.target.value })} placeholder="client_id 或 {{clientId}}" mono />
            </Field>
            <Field label={t({ zh: 'Client Secret', en: 'Client Secret' })} hint={t({ zh: '公共客户端可留空', en: 'optional for public clients' })}>
              <Input size="sm" type="password" value={auth.clientSecret ?? ''} onChange={(e) => patch({ clientSecret: e.target.value })} placeholder="{{clientSecret}}" mono />
            </Field>
            <Field label={t({ zh: 'Scope', en: 'Scope' })} hint={t({ zh: '空格分隔', en: 'space separated' })}>
              <Input size="sm" value={auth.scope ?? ''} onChange={(e) => patch({ scope: e.target.value })} placeholder="read write" mono />
            </Field>
            <Field label={t({ zh: 'Token URL', en: 'Token URL' })}>
              <Input size="sm" value={auth.tokenUrl ?? ''} onChange={(e) => patch({ tokenUrl: e.target.value })} placeholder="https://idp.example.com/oauth/token" mono />
            </Field>
          </div>

          {grant === 'password' ? (
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              <Field label={t({ zh: '用户名', en: 'Username' })}>
                <Input size="sm" value={auth.username ?? ''} onChange={(e) => patch({ username: e.target.value })} placeholder="username" mono />
              </Field>
              <Field label={t({ zh: '密码', en: 'Password' })}>
                <Input size="sm" type="password" value={auth.password ?? ''} onChange={(e) => patch({ password: e.target.value })} placeholder="password" mono />
              </Field>
            </div>
          ) : null}

          {grant === 'authorization_code' ? (
            <div className="min-w-0 space-y-2">
              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                <Field label={t({ zh: 'Authorize URL', en: 'Authorize URL' })}>
                  <Input size="sm" value={auth.authUrl ?? ''} onChange={(e) => patch({ authUrl: e.target.value })} placeholder="https://idp.example.com/oauth/authorize" mono />
                </Field>
                <Field label={t({ zh: 'Redirect URI', en: 'Redirect URI' })}>
                  <div className="flex gap-1.5">
                    <Input size="sm" value={auth.redirectUri ?? ''} onChange={(e) => patch({ redirectUri: e.target.value })} placeholder={suggestedRedirectUri()} mono />
                    <Button variant="ghost" size="sm" onClick={() => patch({ redirectUri: suggestedRedirectUri() })}>
                      {t({ zh: '用本站', en: 'Use this site' })}
                    </Button>
                  </div>
                </Field>
              </div>
              {offline ? (
                <ToolAlert
                  tone="warning"
                  title={t({ zh: '离线单文件包跑在 file://，没有可用的回调地址', en: 'The offline single file runs on file://, which has no usable redirect URI' })}
                  hint={t({ zh: '授权码模式只能在部署后的站点用；这里请改客户端凭据或密码模式。', en: 'The code flow needs the hosted site; use client credentials or the password grant here.' })}
                />
              ) : (
                <p className="text-[11px] text-ink-3">
                  {t({
                    zh: '跳走前请先保存请求：整页往返会重开编辑器，回来后按请求 id 回填令牌。授权服务器必须把上面这个 Redirect URI 加进白名单。',
                    en: 'Save the request first — the round trip reloads the page, and the token comes back to the request with this id. The identity provider must allowlist the redirect URI above.',
                  })}
                </p>
              )}
            </div>
          ) : null}

          {tokenRow}

          <div className="flex flex-wrap items-center gap-2">
            {grant === 'authorization_code' ? (
              <Button variant="secondary" size="sm" onClick={() => void startAuthCode()} disabled={busy || offline || !auth.authUrl?.trim() || !auth.clientId?.trim()}>
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '打开授权页', en: 'Open authorize page' })}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => void runTokenRequest()} disabled={busy || !auth.tokenUrl?.trim() || !auth.clientId?.trim()}>
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                {busy ? t({ zh: '取令牌中…', en: 'Requesting…' }) : t({ zh: '获取令牌', en: 'Get token' })}
              </Button>
            )}
            {auth.accessToken && grant !== 'authorization_code' ? (
              <Button variant="ghost" size="sm" onClick={() => void runTokenRequest()} disabled={busy}>
                {t({ zh: '重新获取', en: 'Refresh' })}
              </Button>
            ) : null}
          </div>
          <p className="text-[11px] text-ink-3">
            {t({
              zh: '取令牌是一次真实的直连请求，授权服务器要允许本站跨域；令牌只有在上面弹窗里点「存到本机」才会写进浏览器，本站不上传任何东西。',
              en: 'Fetching a token is a real direct request, so the authorization server must allow this origin; the token is only written to this browser when you choose Keep on this machine, and nothing is ever uploaded.',
            })}
          </p>
        </div>
      ) : null}

      <TokenConsentModal token={pendingToken} onKeep={applyToken} onDiscard={() => void discardToken()} />
    </div>
  );
}
