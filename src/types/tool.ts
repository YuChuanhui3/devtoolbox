export type CategoryId = 'data' | 'encode' | 'dev' | 'text' | 'image' | 'network';

export type Priority = 'P0' | 'P1' | 'P2';

export interface SubFeatureMeta {
  /** 对应工具箱 ?mode= 页签 id。 */
  id: string;
  name: L10n;
  /** 额外搜索词（小写即可），命中时搜索直达该页签。 */
  keywords?: string[];
}

export interface ToolMeta {
  id: string;
  name: string;
  /** 英文名（en 语言界面显示与搜索用），新增工具必填。 */
  nameEn?: string;
  category: CategoryId;
  description: string;
  descriptionEn?: string;
  tags: string[];
  aliases?: string[];
  /** 工具箱内可直达的页签（?mode= 寻址）。 */
  subFeatures?: SubFeatureMeta[];
  icon: string;
  priority: Priority;
  featured?: boolean;
  isNew?: boolean;
  /** 可能包含密钥、令牌等敏感输入，不自动保存草稿。 */
  sensitive?: boolean;
  /** 工具自行管理草稿存储（如 Markdown 编辑器）。 */
  customDraft?: boolean;
}

import type { L10n } from '@/i18n/locale';

export interface CategoryMeta {
  id: CategoryId;
  name: L10n;
  shortName: L10n;
  description: L10n;
  icon: string;
  /** Tailwind class names, kept as full literals so the compiler can see them. */
}

export interface RecentEntry {
  toolId: string;
  visitedAt: number;
}
