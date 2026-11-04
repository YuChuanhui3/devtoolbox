import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { useI18n } from '@/i18n/I18nProvider';
import { newId } from '@/lib/apiworkbench/id';
import type { WbVar } from '@/lib/apiworkbench/types';

export function VarTable({ vars, onChange }: { vars: WbVar[]; onChange: (next: WbVar[]) => void }) {
  const { t } = useI18n();
  const patch = (index: number, next: Partial<WbVar>) =>
    onChange(vars.map((v, i) => (i === index ? { ...v, ...next } : v)));

  return (
    <div className="space-y-2">
      {vars.length === 0 ? (
        <p className="text-xs text-ink-3">{t({ zh: '暂无变量', en: 'No variables yet' })}</p>
      ) : null}
      {vars.map((v, index) => (
        <div key={v.id} className="flex flex-wrap items-center gap-2">
          <Checkbox
            checked={v.enabled}
            onChange={(checked) => patch(index, { enabled: checked })}
            label={<span className="sr-only">{t({ zh: '启用变量', en: 'Enable variable' })}</span>}
          />
          <Input
            value={v.key}
            onChange={(e) => patch(index, { key: e.target.value })}
            placeholder="name"
            mono
            className="h-8 w-36 text-xs"
            aria-label={t({ zh: `变量名 ${index + 1}`, en: `Variable name ${index + 1}` })}
          />
          <Input
            value={v.value}
            onChange={(e) => patch(index, { value: e.target.value })}
            placeholder="value"
            mono
            type={v.secret ? 'password' : 'text'}
            className="h-8 min-w-40 flex-1 text-xs"
            aria-label={t({ zh: `变量值 ${index + 1}`, en: `Variable value ${index + 1}` })}
          />
          <Checkbox
            checked={!!v.secret}
            onChange={(checked) => patch(index, { secret: checked })}
            label={<span className="text-[11px]">{t({ zh: '密钥', en: 'Secret' })}</span>}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(vars.filter((_, i) => i !== index))}
            aria-label={t({ zh: '删除变量', en: 'Remove variable' })}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange([...vars, { id: newId(), key: '', value: '', enabled: true }])}
      >
        <Plus className="h-3 w-3" aria-hidden="true" />
        {t({ zh: '添加变量', en: 'Add variable' })}
      </Button>
    </div>
  );
}
