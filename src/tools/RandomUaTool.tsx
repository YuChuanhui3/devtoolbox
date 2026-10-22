import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ActionBar, CopyButton, CopyIconButton, DownloadButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { randomUserAgent, UA_BROWSERS, UA_OS_LIST, type UaBrowser, type UaOs } from '@/lib/uagen';

export default function RandomUaTool() {
  const { t } = useI18n();
  const [browser, setBrowser] = useState<'any' | UaBrowser>('any');
  const [os, setOs] = useState<'any' | UaOs>('any');
  const [count, setCount] = useState(5);
  const [list, setList] = useState<string[]>(() => Array.from({ length: 5 }, () => randomUserAgent()));

  const generate = () => {
    setList(
      Array.from({ length: count }, () =>
        randomUserAgent({ browser: browser === 'any' ? undefined : browser, os: os === 'any' ? undefined : os }),
      ),
    );
  };

  const allText = list.join('\n');

  return (
    <div className="space-y-4">
      <ActionBar>
        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          {t({ zh: '浏览器', en: 'Browser' })}
          <Select
            value={browser}
            onChange={(event) => setBrowser(event.target.value as 'any' | UaBrowser)}
            aria-label={t({ zh: '浏览器', en: 'Browser' })}
            className="h-8 text-xs"
            wrapperClassName="w-28"
          >
            <option value="any">{t({ zh: '随机', en: 'Random' })}</option>
            {UA_BROWSERS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </Select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          {t({ zh: '系统', en: 'OS' })}
          <Select
            value={os}
            onChange={(event) => setOs(event.target.value as 'any' | UaOs)}
            aria-label={t({ zh: '操作系统', en: 'Operating system' })}
            className="h-8 text-xs"
            wrapperClassName="w-32"
          >
            <option value="any">{t({ zh: '随机', en: 'Random' })}</option>
            {UA_OS_LIST.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </Select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          {t({ zh: '数量', en: 'Count' })}
          <Input
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(event) => setCount(Math.min(100, Math.max(1, Number(event.target.value) || 1)))}
            className="h-8 w-16 text-center text-xs"
            aria-label={t({ zh: '生成数量', en: 'Number to generate' })}
          />
        </label>

        <Button variant="primary" size="sm" onClick={generate}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '生成', en: 'Generate' })}
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <CopyButton text={allText} label={{ zh: '复制全部', en: 'Copy all' }} />
          <DownloadButton filename="user-agents.txt" content={allText} />
        </div>
      </ActionBar>

      <Panel
        title={t({ zh: '生成结果', en: 'Results' })}
        subtitle={t({ zh: `${list.length} 条 User-Agent`, en: `${list.length} User-Agent entries` })}
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-line">
          {list.map((ua, index) => (
            <li key={`${ua}-${index}`} className="flex items-start gap-3 px-4 py-2.5">
              <span className="mt-1 w-6 shrink-0 text-center font-mono text-[11px] text-ink-3">
                {String(index + 1).padStart(2, '0')}
              </span>
              <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-5 text-ink">{ua}</code>
              <CopyIconButton text={ua} label={{ zh: `复制第 ${index + 1} 条 UA`, en: `Copy UA #${index + 1}` }} />
            </li>
          ))}
        </ul>
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '按现代浏览器 UA 模板随机组合浏览器、版本与平台，iOS 上的非 Safari 浏览器同样输出 WebKit 外壳格式。', en: 'Randomly combines browser, version, and platform from modern UA templates; non-Safari browsers on iOS still emit the WebKit shell format.' })}
      </p>
    </div>
  );
}
