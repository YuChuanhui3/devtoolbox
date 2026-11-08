import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { useI18n } from '@/i18n/I18nProvider';
import { newId } from '@/lib/apiworkbench/id';
import { envInheritanceChain } from '@/lib/apiworkbench/store';
import { useWorkbench } from './WorkbenchContext';
import { VarTable } from './VarTable';
import type { WbEnvironment } from '@/lib/apiworkbench/types';

export function EnvironmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { doc, update } = useWorkbench();
  const [selectedId, setSelectedId] = useState<string | null>(doc.environments[0]?.id ?? null);

  const selected = doc.environments.find((e) => e.id === selectedId) ?? null;

  /** 把 candidate 当父层会不会成环：candidate 的链上已经有这个环境就不行。 */
  const inheritsFrom = (candidateId: string, envId: string) =>
    envInheritanceChain(doc.environments, candidateId).some((env) => env.id === envId);

  const chainNames = (envId: string) =>
    envInheritanceChain(doc.environments, envId).map((env) => `「${env.name}」`).join(' ← ');

  const writeEnvs = (envs: WbEnvironment[]) => {
    // 删掉父层后，指向它的环境要立刻回到「不继承」，不然界面上挂着一个不存在的父。
    const ids = new Set(envs.map((env) => env.id));
    const fixed = envs.map((env) => (env.inheritId && !ids.has(env.inheritId) ? { ...env, inheritId: undefined } : env));
    update((d) => ({
      ...d,
      environments: fixed,
      activeEnvId: fixed.some((e) => e.id === d.activeEnvId) ? d.activeEnvId : null,
    }));
  };

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
        zh: '请求里用 {{变量名}} 引用；环境优先于集合，环境还可以继承另一层环境。',
        en: 'Reference them in requests as {{name}}; environment beats collection, and an environment can inherit another.',
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
        <div className="min-w-0 space-y-3">
          <div className="grid min-w-0 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)_auto]">
            <Input
              value={selected.name}
              onChange={(e) => writeEnvs(doc.environments.map((x) => (x.id === selected.id ? { ...x, name: e.target.value } : x)))}
              aria-label={t({ zh: '环境名称', en: 'Environment name' })}
            />
            <Select
              size="sm"
              value={selected.inheritId ?? ''}
              onChange={(e) => writeEnvs(doc.environments.map((x) => (x.id === selected.id ? { ...x, inheritId: e.target.value || undefined } : x)))}
              aria-label={t({ zh: '继承自', en: 'Inherits from' })}
            >
              <option value="">{t({ zh: '不继承', en: 'No parent' })}</option>
              {doc.environments
                .filter((env) => env.id !== selected.id)
                .map((env) => (
                  <option key={env.id} value={env.id} disabled={inheritsFrom(env.id, selected.id)}>
                    {env.name}
                  </option>
                ))}
            </Select>
            <ConfirmButton
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
          <p className="text-[11px] leading-4 text-ink-3">
            {selected.inheritId
              ? t({
                  zh: `继承链：${chainNames(selected.id)}。同名变量以本层为准，父层只补本层没有的。`,
                  en: `Chain: ${chainNames(selected.id)}. A name defined here wins; the parent only fills the gaps.`,
                })
              : t({ zh: '不继承时本环境自带全部变量。灰掉的名字会形成环，不能选。', en: 'Without a parent this environment carries everything. Greyed-out names would close a loop.' })}
          </p>
          <div className="min-w-0 rounded-card border border-line bg-surface-2/40 p-2.5">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">
              {t({ zh: `变量（${selected.variables.length}）`, en: `Variables (${selected.variables.length})` })}
            </p>
            <VarTable
              vars={selected.variables}
              onChange={(variables) =>
                writeEnvs(doc.environments.map((x) => (x.id === selected.id ? { ...x, variables } : x)))
              }
            />
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
