import { Modal } from '@/components/ui/Modal';
import { Kbd } from '@/components/ui/Kbd';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS: Array<{ keys: string[]; description: L10n }> = [
  { keys: [MOD, 'K'], description: { zh: '打开全局搜索', en: 'Open global search' } },
  {
    keys: [MOD, 'Enter'],
    description: { zh: '执行当前工具（如适用）', en: 'Run the current tool (if applicable)' },
  },
  { keys: ['↑', '↓'], description: { zh: '在搜索结果中上下选择', en: 'Move through search results' } },
  { keys: ['Enter'], description: { zh: '打开选中的工具', en: 'Open the selected tool' } },
  { keys: [MOD, 'B'], description: { zh: 'Markdown 编辑器中加粗', en: 'Bold in the Markdown editor' } },
  { keys: [MOD, 'I'], description: { zh: 'Markdown 编辑器中斜体', en: 'Italic in the Markdown editor' } },
  {
    keys: [MOD, 'S'],
    description: { zh: 'Markdown 编辑器中下载 .md', en: 'Download .md in the Markdown editor' },
  },
  { keys: ['Esc'], description: { zh: '关闭弹层 / 搜索面板', en: 'Close dialogs / search panel' } },
];

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const { t } = useI18n();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t({ zh: '键盘快捷键', en: 'Keyboard Shortcuts' })}
      description={t({ zh: '提升日常使用效率', en: 'Speed up your daily workflow' })}
    >
      <ul className="divide-y divide-line">
        {SHORTCUTS.map((shortcut) => (
          <li key={shortcut.description.zh} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-sm text-ink-2">{t(shortcut.description)}</span>
            <span className="flex shrink-0 items-center gap-1">
              {shortcut.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[11px] leading-5 text-ink-3">
        {t({
          zh: '快捷键在输入框聚焦时仍会响应全局搜索与关闭操作；Markdown 快捷键仅在编辑器聚焦时生效。',
          en: 'Global search and close shortcuts still work while an input is focused; Markdown shortcuts only apply when the editor is focused.',
        })}
      </p>
    </Modal>
  );
}
