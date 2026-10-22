import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { ActionBar, CopyButton, CopyIconButton, DownloadButton } from '@/components/tool/ToolActions';
import { useI18n } from '@/i18n/I18nProvider';

interface UuidOptions {
  count: number;
  uppercase: boolean;
  hyphens: boolean;
}

const DEFAULT_OPTIONS: UuidOptions = { count: 5, uppercase: false, hyphens: true };

function uuidV4(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function generateUuids(options: UuidOptions): string[] {
  return Array.from({ length: options.count }, () => {
    let value = uuidV4();
    if (options.uppercase) value = value.toUpperCase();
    if (!options.hyphens) value = value.replace(/-/g, '');
    return value;
  });
}

export default function UuidTool() {
  const { t } = useI18n();
  const [options, setOptions] = useState<UuidOptions>(DEFAULT_OPTIONS);
  const [uuids, setUuids] = useState<string[]>(() => generateUuids(DEFAULT_OPTIONS));

  const update = <K extends keyof UuidOptions>(key: K, value: UuidOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  const allText = uuids.join('\n');

  return (
    <div className="space-y-4">
      <ActionBar>
        <Button variant="primary" onClick={() => setUuids(generateUuids(options))}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t({ zh: '生成 UUID', en: 'Generate UUIDs' })}
        </Button>

        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          {t({ zh: '数量', en: 'Count' })}
          <Input
            type="number"
            min={1}
            max={100}
            value={options.count}
            onChange={(event) =>
              update('count', Math.min(100, Math.max(1, Number(event.target.value) || 1)))
            }
            className="h-8 w-20 text-center text-xs"
            aria-label={t({ zh: '生成数量', en: 'Number to generate' })}
          />
        </label>

        <Checkbox
          checked={options.uppercase}
          onChange={(value) => update('uppercase', value)}
          label={t({ zh: '大写', en: 'Uppercase' })}
          className="text-xs"
        />
        <Checkbox
          checked={options.hyphens}
          onChange={(value) => update('hyphens', value)}
          label={t({ zh: '保留连字符', en: 'Keep hyphens' })}
          className="text-xs"
        />

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <CopyButton text={allText} label={t({ zh: '复制全部', en: 'Copy all' })} />
          <DownloadButton filename="uuids.txt" content={allText} />
        </div>
      </ActionBar>

      <Panel
        title={t({ zh: '生成结果', en: 'Results' })}
        subtitle={t({ zh: `${uuids.length} 个 UUID v4`, en: `${uuids.length} UUID v4 entries` })}
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-line">
          {uuids.map((uuid, index) => (
            <li key={`${uuid}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-6 shrink-0 text-center font-mono text-[11px] text-ink-3">
                {String(index + 1).padStart(2, '0')}
              </span>
              <code className="min-w-0 flex-1 break-all font-mono text-[13px] leading-6 text-ink">
                {uuid}
              </code>
              <CopyIconButton text={uuid} label={t({ zh: `复制第 ${index + 1} 个 UUID`, en: `Copy UUID ${index + 1}` })} />
            </li>
          ))}
        </ul>
      </Panel>

      <p className="text-center text-[11px] text-ink-3">
        {t({
          zh: 'UUID v4 使用密码学安全随机数生成，碰撞概率可忽略，适合作为数据库主键与请求标识。',
          en: 'UUID v4 uses cryptographically secure randomness; collisions are negligible, making it suitable for database keys and request IDs.',
        })}
      </p>
    </div>
  );
}
