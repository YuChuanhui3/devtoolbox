import type { Localized } from '@/i18n/locale';

export interface ReferenceItem {
  key: string;
  title: Localized;
  category: string;
  description: Localized;
  example?: string;
  tags?: string[];
  /** 参数 / 选项说明，如 [-l, 长格式列表]；用于命令、API 等需要逐项解释的参考数据。 */
  params?: Array<[flag: string, meaning: Localized]>;
}

export interface ReferenceFilter {
  id: string;
  label: Localized;
}

export interface ReferenceDataset {
  items: ReferenceItem[];
  filters: ReferenceFilter[];
  keyLabel: Localized;
  searchPlaceholder: Localized;
  emptyText: Localized;
  intro?: Localized;
}
