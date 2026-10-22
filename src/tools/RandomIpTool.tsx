import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Segmented';
import { ActionBar, CopyButton, CopyIconButton, DownloadButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { randomIpv4, randomIpv6, type IpScope } from '@/lib/ip';

export default function RandomIpTool() {
  const { t } = useI18n();
  const [family, setFamily] = useState<'4' | '6'>('4');
  const [scope, setScope] = useState<IpScope>('any');
  const [count, setCount] = useState(10);
  const [list, setList] = useState<string[]>([]);

  const generate = () => {
    setList(
      Array.from({ length: count }, () =>
        family === '4' ? randomIpv4({ scope }) : randomIpv6(),
      ),
    );
  };

  const allText = list.join('\n');

  return (
    <div className="space-y-4">
      <ActionBar>
        <Segmented
          value={family}
          onChange={setFamily}
          ariaLabel={t({ zh: '协议版本', en: 'Protocol version' })}
          options={[
            { value: '4', label: 'IPv4' },
            { value: '6', label: 'IPv6' },
          ]}
        />

        {family === '4' ? (
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            {t({ zh: '范围', en: 'Range' })}
            <Select
              value={scope}
              onChange={(event) => setScope(event.target.value as IpScope)}
              aria-label={t({ zh: '地址范围', en: 'Address range' })}
              className="h-8 text-xs"
              wrapperClassName="w-28"
            >
              <option value="any">{t({ zh: '任意地址', en: 'Any address' })}</option>
              <option value="public">{t({ zh: '公网地址', en: 'Public address' })}</option>
              <option value="private">{t({ zh: '内网地址', en: 'Private address' })}</option>
            </Select>
          </label>
        ) : null}

        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          {t({ zh: '数量', en: 'Count' })}
          <Input
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={(event) => setCount(Math.min(200, Math.max(1, Number(event.target.value) || 1)))}
            className="h-8 w-20 text-center text-xs"
            aria-label={t({ zh: '生成数量', en: 'Number to generate' })}
          />
        </label>

        <Button variant="primary" size="sm" onClick={generate}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '生成', en: 'Generate' })}
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <CopyButton text={allText} label={{ zh: '复制全部', en: 'Copy all' }} />
          <DownloadButton filename="random-ips.txt" content={allText} />
        </div>
      </ActionBar>

      <Panel
        title={t({ zh: '生成结果', en: 'Results' })}
        subtitle={list.length ? t({ zh: `${list.length} 个随机 IP 地址`, en: `${list.length} random IP addresses` }) : t({ zh: '点击「生成」开始', en: 'Click "Generate" to start' })}
        bodyClassName="p-0"
      >
        {list.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center px-4 text-xs text-ink-3">
            {t({ zh: '生成结果将在这里显示，可用于测试数据填充', en: 'Results appear here, useful for filling test data' })}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((ip, index) => (
              <li key={`${ip}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-6 shrink-0 text-center font-mono text-[11px] text-ink-3">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-ink">{ip}</code>
                <CopyIconButton text={ip} label={{ zh: `复制第 ${index + 1} 个 IP`, en: `Copy IP #${index + 1}` }} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '公网范围会自动避开回环、私有、链路本地与组播等保留地址段，仅供测试使用。', en: 'Public ranges skip reserved blocks such as loopback, private, link-local, and multicast; for testing only.' })}
      </p>
    </div>
  );
}
