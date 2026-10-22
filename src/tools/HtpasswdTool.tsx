import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { CopyButton, CopyIconButton, DownloadButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { generateHtpasswdLine, type HtpasswdEntry, type HtpasswdFormat } from '@/lib/htpasswd';

export default function HtpasswdTool() {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [format, setFormat] = useState<HtpasswdFormat>('bcrypt');
  const [cost, setCost] = useState('12');
  const [entries, setEntries] = useState<HtpasswdEntry[]>([]);
  const [error, setError] = useState<Localized | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const add = () => {
    setError(null);
    try {
      const entry = generateHtpasswdLine(username, password, format, Number(cost));
      setEntries((current) => [
        ...current.filter((item) => item.username !== entry.username),
        entry,
      ]);
      setPassword('');
      passwordRef.current?.focus();
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

  const fileContent = entries.map((entry) => entry.line).join('\n');

  return (
    <div className="space-y-4">
      <Panel
        title={t({ zh: 'htpasswd 条目生成', en: 'htpasswd entry generator' })}
        subtitle={t({
          zh: '用于 Apache / Nginx basic auth 的用户口令文件行',
          en: 'Lines for an Apache / Nginx basic auth user password file',
        })}
        bodyClassName="space-y-3 p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={format}
            onChange={setFormat}
            ariaLabel={t({ zh: '散列格式', en: 'Hash format' })}
            options={[
              { value: 'bcrypt', label: 'bcrypt' },
              { value: 'apr1', label: 'apr1 MD5' },
              { value: 'sha1', label: '{SHA}' },
              { value: 'plain', label: t({ zh: '明文', en: 'Plain' }) },
            ]}
          />
          {format === 'bcrypt' ? (
            <label className="flex items-center gap-1.5 text-xs text-ink-3">
              cost
              <Input
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                inputMode="numeric"
                aria-label="bcrypt cost"
                className="h-8 w-20 text-xs"
              />
            </label>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-ink-3">
            {t({ zh: '用户名', en: 'Username' })}
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t({ zh: '例如 admin', en: 'e.g. admin' })}
              autoComplete="off"
              className="mt-1"
            />
          </label>
          <label className="block text-xs text-ink-3">
            {t({ zh: '口令', en: 'Password' })}
            <Input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t({ zh: '输入访问口令', en: 'Enter the access password' })}
              autoComplete="new-password"
              className="mt-1"
            />
          </label>
        </div>

        <Button variant="primary" onClick={add}>
          {t({ zh: '生成并追加', en: 'Generate and append' })}
        </Button>
        {error ? <ToolAlert tone="error" title={error} /> : null}
      </Panel>

      <Panel
        title={t({ zh: 'htpasswd 文件内容', en: 'htpasswd file content' })}
        subtitle={
          entries.length
            ? t({ zh: `${entries.length} 个用户，重复用户名会被覆盖`, en: `${entries.length} users; duplicate usernames are overwritten` })
            : t({ zh: '尚未生成条目', en: 'No entries yet' })
        }
        actions={
          entries.length ? (
            <div className="flex items-center gap-1.5">
              <CopyIconButton text={fileContent} label={{ zh: '复制全部内容', en: 'Copy all' }} />
              <Button variant="ghost" size="sm" onClick={() => setEntries([])}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t({ zh: '清空', en: 'Clear' })}
              </Button>
            </div>
          ) : null
        }
        bodyClassName="space-y-3 p-4"
      >
        {entries.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center text-xs text-ink-3">
            {t({ zh: '生成的 user:hash 行会汇总在这里', en: 'Generated user:hash lines collect here' })}
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li key={entry.username} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-2.5 py-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-ink">{entry.line}</code>
                  <span className="shrink-0 text-[10px] text-ink-3">{entry.format}</span>
                  <CopyIconButton text={entry.line} label={t({ zh: `复制 ${entry.username}`, en: `Copy ${entry.username}` })} />
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <CopyButton text={fileContent} label={{ zh: '复制全文', en: 'Copy file' }} />
              <DownloadButton filename=".htpasswd" content={fileContent} />
            </div>
          </>
        )}
      </Panel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '格式建议：Apache 2.x 用 bcrypt 或 apr1；{SHA} 已不推荐、仅供老旧系统兼容。用户名与口令仅在浏览器本地计算，不会上传。',
          en: 'Recommendation: use bcrypt or apr1 on Apache 2.x; {SHA} is deprecated and only for legacy compatibility. Usernames and passwords are computed locally in your browser and never uploaded.',
        })}
      </p>
    </div>
  );
}
