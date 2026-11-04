import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { useI18n } from '@/i18n/I18nProvider';
import { newId } from '@/lib/apiworkbench/id';
import { useWorkbench } from './WorkbenchContext';
import { VarTable } from './VarTable';
import type { WbEnvironment } from '@/lib/apiworkbench/types';

export function EnvironmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { doc, update } = useWorkbench();
  const [selectedId, setSelectedId] = useState<string | null>(doc.environments[0]?.id ?? null);

  const selected = doc.environments.find((e) => e.id === selectedId) ?? null;

  const writeEnvs = (envs: WbEnvironment[]) =>
    update((d) => ({
      ...d,
      environments: envs,
      activeEnvId: envs.some((e) => e.id === d.activeEnvId) ? d.activeEnvId : null,
    }));

  const addEnv = () => {
    const env: WbEnvironment = { id: newId(), name: t({ zh: '新环境', en: 'New environment' }), variables: [] };
    writeEnvs([...doc.environments, env]);
    setSelectedId(env.id);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      align="top"
      maxWidth={640}
      title={t({ zh: '环境与变量', en: 'Environments & variables' })}
      description={t({
        zh: '请求里用 {{"{{变量名}}"}} 引用；同名变量环境优先于集合。',
        en: 'Reference them in requests as {{"{{name}}"}}; environment beats collection on name clashes.',
      })}
      bodyClassName="space-y-4"
    >
      <div className="flex flex-wrap gap-2">
        {doc.environments.length === 0 ? (
          <p className="text-xs text-ink-3">{t({ zh: '还没有环境，先创建一个。', en: 'No environments yet — create one first.' })}</p>
        ) : null}
        {doc.environments.map((env) => (
          <Button
            key={env.id}
            variant={env.id === selectedId ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setSelectedId(env.id)}
          >
            {env.name}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={addEnv}>
          <Plus className="h-3 w-3" aria-hidden="true" />
          {t({ zh: '新建环境', en: 'New environment' })}
        </Button>
      </div>

      {selected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              value={selected.name}
              onChange={(e) => writeEnvs(doc.environments.map((x) => (x.id === selected.id ? { ...x, name: e.target.value } : x)))}
              className="h-8 w-52 text-xs"
              aria-label={t({ zh: '环境名称', en: 'Environment name' })}
            />
            <ConfirmButton
              size="sm"
              confirmLabel={{ zh: '确认删除环境？', en: 'Click again to delete' }}
              onConfirm={() => {
                writeEnvs(doc.environments.filter((x) => x.id !== selected.id));
                setSelectedId(doc.environments.find((x) => x.id !== selected.id)?.id ?? null);
              }}
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              {t({ zh: '删除环境', en: 'Delete' })}
            </ConfirmButton>
          </div>
          <VarTable
            vars={selected.variables}
            onChange={(variables) =>
              writeEnvs(doc.environments.map((x) => (x.id === selected.id ? { ...x, variables } : x)))
            }
          />
        </div>
      ) : null}
    </Modal>
  );
}
