import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useI18n } from '@/i18n/I18nProvider';
import type { OAuthToken } from '@/lib/apiworkbench/oauth';

interface Props {
  /** 有待定的令牌就弹；null 表示这条路径上没东西要确认。 */
  token: OAuthToken | null;
  onKeep: (token: OAuthToken) => void;
  onDiscard: () => void;
}

/**
 * 存令牌前的确认。
 *
 * 令牌一旦交出去就是本机浏览器里的一份明文：写进 localStorage 之后，导出集合时
 * 它可能被一起带走，共享机器上它就一直躺在那儿。所以「取到了」不等于「要存下来」，
 * 这一步由人决定；两条路径（面板里直接取、授权码回跳换）都走这同一个弹窗。
 */
export function TokenConsentModal({ token, onKeep, onDiscard }: Props) {
  const { t } = useI18n();
  const expiresAt = typeof token?.expiresAt === 'number' ? token.expiresAt : null;
  return (
    <Modal
      open={Boolean(token)}
      onClose={onDiscard}
      maxWidth={460}
      title={t({ zh: '要把这个访问令牌存到本机吗？', en: 'Keep this access token on this machine?' })}
    >
      <div className="space-y-3">
        <p className="text-xs leading-5 text-ink-2">
          {t({
            zh: '存下来只是写进这个浏览器的本地存储，明文、不加密，本站不会把它发往任何地方。不存就当场丢弃，你可以复制走自己用。',
            en: 'Keeping it writes the token into this browser\u2019s local storage as plain text, unencrypted; nothing is sent anywhere. Discarding it drops it on the spot so you can copy it elsewhere instead.',
          })}
        </p>
        {token ? (
          <div className="min-w-0 space-y-1.5 rounded-xl border border-line bg-surface-2/60 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ok" aria-hidden="true" />
              <span className="text-[11px] font-medium text-ink-3">{token.tokenType || 'Bearer'}</span>
              {expiresAt !== null ? (
                <Badge tone={expiresAt <= Date.now() ? 'warning' : 'neutral'}>
                  {expiresAt <= Date.now()
                    ? t({ zh: '已过期', en: 'Expired' })
                    : t({ zh: `到 ${new Date(expiresAt).toLocaleString()}`, en: `until ${new Date(expiresAt).toLocaleString()}` })}
                </Badge>
              ) : (
                <Badge tone="neutral">{t({ zh: '无有效期', en: 'No expiry' })}</Badge>
              )}
            </div>
            <p className="break-all font-mono text-[11px] text-ink-2">
              {token.accessToken.slice(0, 12)}…{token.accessToken.slice(-6)}
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            {t({ zh: '不存，丢弃', en: 'Discard' })}
          </Button>
          <Button variant="primary" size="sm" onClick={() => token && onKeep(token)}>
            {t({ zh: '存到本机', en: 'Keep on this machine' })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
