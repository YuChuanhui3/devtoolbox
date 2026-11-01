import { Fingerprint, Hash, KeyRound } from 'lucide-react';
import { ToolkitTabs } from '@/components/tool/ToolkitTabs';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { HashPanel } from './hash-toolkit/HashPanel';
import { HtpasswdPanel } from './hash-toolkit/HtpasswdPanel';
import { PwdHashPanel } from './hash-toolkit/PwdHashPanel';

type HashToolkitMode = 'hash' | 'pwdhash' | 'htpasswd';

export default function HashToolkitTool() {
  const { t } = useI18n();
  const [mode, setMode] = useToolkitMode<HashToolkitMode>(['hash', 'pwdhash', 'htpasswd'], 'hash');

  return (
    <div className="space-y-4">
      <ToolkitTabs<HashToolkitMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '哈希工具箱模式', en: 'Hash toolkit mode' })}
          options={[
            {
              value: 'hash',
              label: t({ zh: '摘要计算', en: 'Digests' }),
              icon: <Hash className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'pwdhash',
              label: 'Bcrypt/Scrypt',
              icon: <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />,
            },
            {
              value: 'htpasswd',
              label: 'htpasswd',
              icon: <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />,
            },
          ]}
      />

      <LazyPanel active={mode === 'hash'}>
        <HashPanel active={mode === 'hash'} />
      </LazyPanel>
      <LazyPanel active={mode === 'pwdhash'}>
        <PwdHashPanel active={mode === 'pwdhash'} />
      </LazyPanel>
      <LazyPanel active={mode === 'htpasswd'}>
        <HtpasswdPanel active={mode === 'htpasswd'} />
      </LazyPanel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '三类哈希与口令工具合并为一个敏感工具箱：文本/文件/邮箱摘要计算、Bcrypt/Scrypt 口令散列与 htpasswd 条目生成 · 全部内容在本机计算、不上传，切换模式不会丢失各自的输入与结果',
          en: 'Three hash & password tools in one sensitive toolkit: text/file/email digests, Bcrypt/Scrypt password hashing, and htpasswd line generation · everything is computed locally and never uploaded, and switching modes keeps each panel\'s input and results',
        })}
      </p>
    </div>
  );
}
