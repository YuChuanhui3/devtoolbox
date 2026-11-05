import { Kbd } from '@/components/ui/Kbd';
import { Modal } from '@/components/ui/Modal';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';

const TYPING_NOTE: L10n = { zh: '输入框里按不算', en: 'Not while typing' };

const ROWS: { keys: string[]; description: L10n; note?: L10n }[] = [
  { keys: [MOD, 'Enter'], description: { zh: '发送当前请求', en: 'Send the current request' } },
  { keys: [MOD, 'S'], description: { zh: '保存到集合', en: 'Save into the collection' } },
  { keys: [MOD, 'Shift', 'S'], description: { zh: '另存为副本', en: 'Save a copy' } },
  { keys: [MOD, 'O'], description: { zh: '打开导入（Postman / Hoppscotch / HAR）', en: 'Open import (Postman / Hoppscotch / HAR)' } },
  { keys: ['/'], description: { zh: '聚焦集合搜索', en: 'Focus the collection search' }, note: TYPING_NOTE },
  { keys: ['?'], description: { zh: '开合本说明', en: 'Toggle this list' }, note: TYPING_NOTE },
];

export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={460}
      title={t({ zh: '工作台快捷键', en: 'Workbench shortcuts' })}
      description={t({
        zh: '只在「请求」页签可见时生效：其他页签挂在后台，快捷键不该替它们发请求。',
        en: 'These only run while the Request tab is visible — the other tabs stay mounted in the background and must not receive them.',
      })}
    >
      <ul className="divide-y divide-line">
        {ROWS.map((row) => (
          <li key={row.description.zh} className="flex items-center justify-between gap-4 py-2.5">
            <span className="min-w-0 text-sm text-ink-2">
              {t(row.description)}
              {row.note ? <span className="ml-1 text-[11px] text-ink-3">（{t(row.note)}）</span> : null}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {row.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[11px] leading-5 text-ink-3">
        {t({
          zh: `${MOD}K 仍归全局工具搜索；弹窗打开时这些快捷键都不响应，交给弹窗自己的 Esc。`,
          en: `${MOD}K stays with the global tool palette; while a dialog is open none of these fire — the dialog keeps its own Esc.`,
        })}
      </p>
    </Modal>
  );
}
