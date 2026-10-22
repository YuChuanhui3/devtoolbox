import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { ActionBar, CopyButton, CopyIconButton, DownloadButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';
import { generateMacs, type MacSeparator } from '@/lib/mac';

export default function MacAddressTool() {
  const { t } = useI18n();
  const [count, setCount] = useState(5);
  const [separator, setSeparator] = useState<MacSeparator>(':');
  const [uppercase, setUppercase] = useState(true);
  const [local, setLocal] = useState(true);
  const [multicast, setMulticast] = useState(false);
  const [oui, setOui] = useState('');
  const [list, setList] = useState<string[]>(() => generateMacs({ count: 5, local: true }));

  const generate = () => {
    setList(
      generateMacs({
        count,
        separator,
        uppercase,
        local,
        multicast,
        oui: oui.trim() ? oui.trim() : null,
      }),
    );
  };

  const allText = list.join('\n');

  return (
    <div className="space-y-4">
      <ActionBar>
        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          {t({ zh: '数量', en: 'Count' })}
          <Input
            type="number"
            min={1}
            max={500}
            value={count}
            onChange={(event) => setCount(Math.min(500, Math.max(1, Number(event.target.value) || 1)))}
            className="h-8 w-16 text-center text-xs"
            aria-label={t({ zh: '生成数量', en: 'Number to generate' })}
          />
        </label>

        <Select
          value={separator}
          onChange={(event) => setSeparator(event.target.value as MacSeparator)}
          aria-label={t({ zh: '分隔符', en: 'Separator' })}
          className="h-8 text-xs"
          wrapperClassName="w-24"
        >
          <option value=":">{t({ zh: '冒号 :', en: 'Colon :' })}</option>
          <option value="-">{t({ zh: '连字符 -', en: 'Hyphen -' })}</option>
          <option value=".">{t({ zh: '点分 .', en: 'Dot .' })}</option>
          <option value="none">{t({ zh: '无分隔', en: 'None' })}</option>
        </Select>

        <Checkbox checked={uppercase} onChange={setUppercase} label={t({ zh: '大写', en: 'Uppercase' })} className="text-xs" />
        <Checkbox
          checked={local}
          onChange={setLocal}
          label={t({ zh: '本地管理位', en: 'Locally administered bit' })}
          className="text-xs"
        />
        <Checkbox checked={multicast} onChange={setMulticast} label={t({ zh: '组播位', en: 'Multicast bit' })} className="text-xs" />

        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          {t({ zh: 'OUI 前缀', en: 'OUI prefix' })}
          <Input
            value={oui}
            onChange={(event) => setOui(event.target.value)}
            placeholder="AC:DE:48"
            className="h-8 w-28 font-mono text-xs"
            aria-label={t({ zh: 'OUI 前缀（3 字节）', en: 'OUI prefix (3 bytes)' })}
          />
        </label>

        <Button variant="primary" size="sm" onClick={generate}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {t({ zh: '生成', en: 'Generate' })}
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <CopyButton text={allText} label={{ zh: '复制全部', en: 'Copy all' }} />
          <DownloadButton filename="mac-addresses.txt" content={allText} />
        </div>
      </ActionBar>

      <Panel
        title={t({ zh: '生成结果', en: 'Results' })}
        subtitle={t({ zh: `${list.length} 个 MAC 地址`, en: `${list.length} MAC addresses` })}
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-line">
          {list.map((mac, index) => (
            <li key={`${mac}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-6 shrink-0 text-center font-mono text-[11px] text-ink-3">
                {String(index + 1).padStart(2, '0')}
              </span>
              <code className="min-w-0 flex-1 font-mono text-[13px] text-ink">{mac}</code>
              <CopyIconButton text={mac} label={{ zh: `复制第 ${index + 1} 个 MAC`, en: `Copy MAC #${index + 1}` }} />
            </li>
          ))}
        </ul>
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: '默认置「本地管理位」以避免与真实网卡地址冲突；组播位控制首字节最低位，OUI 前缀可指定 3 字节厂商段。', en: 'The "locally administered" bit is set by default to avoid clashing with real NIC addresses; the multicast bit controls the low bit of the first byte, and the OUI prefix sets a 3-byte vendor field.' })}
      </p>
    </div>
  );
}
