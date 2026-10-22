import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  Minus,
  Quote,
  Strikethrough,
  Table,
} from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n } from '@/i18n/locale';

export type MarkdownAction =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'link'
  | 'image'
  | 'code'
  | 'table'
  | 'list'
  | 'quote'
  | 'hr';

const ACTIONS: Array<{ action: MarkdownAction; label: L10n; icon: typeof Bold }> = [
  { action: 'h1', label: { zh: '一级标题', en: 'Heading 1' }, icon: Heading1 },
  { action: 'h2', label: { zh: '二级标题', en: 'Heading 2' }, icon: Heading2 },
  { action: 'h3', label: { zh: '三级标题', en: 'Heading 3' }, icon: Heading3 },
  { action: 'bold', label: { zh: '加粗 ⌘B', en: 'Bold ⌘B' }, icon: Bold },
  { action: 'italic', label: { zh: '斜体 ⌘I', en: 'Italic ⌘I' }, icon: Italic },
  { action: 'strike', label: { zh: '删除线', en: 'Strikethrough' }, icon: Strikethrough },
  { action: 'link', label: { zh: '插入链接', en: 'Insert link' }, icon: LinkIcon },
  { action: 'image', label: { zh: '插入图片', en: 'Insert image' }, icon: ImageIcon },
  { action: 'code', label: { zh: '插入代码块', en: 'Insert code block' }, icon: Code2 },
  { action: 'table', label: { zh: '插入表格', en: 'Insert table' }, icon: Table },
  { action: 'list', label: { zh: '无序列表', en: 'Bulleted list' }, icon: List },
  { action: 'quote', label: { zh: '引用', en: 'Blockquote' }, icon: Quote },
  { action: 'hr', label: { zh: '分割线', en: 'Divider' }, icon: Minus },
];

export function MarkdownToolbar({ onAction }: { onAction: (action: MarkdownAction) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
      {ACTIONS.map((item, index) => {
        const Icon = item.icon;
        const showDivider = index === 3 || index === 6 || index === 8 || index === 11;
        return (
          <span key={item.action} className="flex items-center">
            {showDivider ? <span className="mx-0.5 h-5 w-px shrink-0 bg-line" /> : null}
            <IconButton
              label={t(item.label)}
              size="sm"
              className="h-8 w-8 shrink-0"
              onClick={() => onAction(item.action)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          </span>
        );
      })}
    </div>
  );
}
