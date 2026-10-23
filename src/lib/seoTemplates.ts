import type { L10n } from '@/i18n/locale';
import type { CategoryMeta, ToolMeta } from '@/types/tool';

const dropPeriod = (value: string): string => value.replace(/[。.]$/, '');

/** 工具页关键词化标题：在线{名}工具 / Online {nameEn} Tool。 */
export const toolSeoTitle = (tool: ToolMeta): L10n => ({
  zh: /工具$/.test(tool.name) ? `在线${tool.name}` : `在线${tool.name}工具`,
  en: `Online ${tool.nameEn ?? tool.name} Tool`,
});

export const toolSeoDescription = (tool: ToolMeta): L10n => ({
  zh: `${toolSeoTitle(tool).zh}：${dropPeriod(tool.description)}。纯浏览器本地处理，数据不上传，无需注册。`,
  en: `${toolSeoTitle(tool).en}: ${dropPeriod(tool.descriptionEn ?? tool.description)}. Runs 100% locally in your browser, no uploads, no sign-up.`,
});

export const toolSeoKeywords = (tool: ToolMeta): L10n => {
  const join = (extra: string[]) => [...new Set([tool.name, ...extra].filter(Boolean))].slice(0, 8).join(', ');
  return {
    zh: join([...(tool.aliases ?? []), ...(tool.tags ?? [])]),
    en: join([tool.nameEn ?? '', ...(tool.aliases ?? []).filter((a) => /^[\x00-\x7f]+$/.test(a))]),
  };
};

/** 「关于此工具」可见简介句（UI 与预渲染 shell 共用措辞）。 */
export const toolSeoIntro = (tool: ToolMeta): L10n => {
  const aliases = (tool.aliases ?? []).slice(0, 5);
  return {
    zh: aliases.length
      ? `这款${toolSeoTitle(tool).zh}也被称为${aliases.join('、')}。输入内容全部在浏览器本地处理，不上传服务器，打开即用、无需注册。`
      : `这款${toolSeoTitle(tool).zh}在浏览器本地处理所有内容，不上传服务器，打开即用、无需注册。`,
    en: aliases.length
      ? `This ${toolSeoTitle(tool).en} is also known as ${aliases.join(', ')}. Everything is processed locally in your browser — no uploads, ready to use without sign-up.`
      : `This ${toolSeoTitle(tool).en} processes everything locally in your browser — no uploads, ready to use without sign-up.`,
  };
};

export const categorySeoTitle = (category: CategoryMeta, count: number): L10n => ({
  zh: `在线${category.name.zh}工具（${count} 个）`,
  en: `Online ${category.name.en} (${count} tools)`,
});

export const categorySeoDescription = (category: CategoryMeta, count: number): L10n => ({
  zh: `免费在线${category.name.zh}工具合集，共 ${count} 个：${dropPeriod(category.description.zh)}。`,
  en: `Free online ${category.name.en}: ${count} tools. ${category.description.en}`,
});

export const categorySeoKeywords = (category: CategoryMeta, tools: ToolMeta[]): L10n => ({
  zh: [`${category.name.zh}工具`, ...tools.slice(0, 6).map((tool) => tool.name)].join(', '),
  en: [`${category.name.en} tools`, ...tools.slice(0, 6).map((tool) => tool.nameEn ?? tool.name)].join(', '),
});

export const TOOLS_PAGE_TITLE: L10n = { zh: '全部在线开发工具', en: 'All Online Developer Tools' };

export const TOOLS_PAGE_DESCRIPTION = (count: number): L10n => ({
  zh: `在线格式转换、编码加密、网络调试等 ${count} 个开发者工具大全，按分类浏览，纯浏览器本地处理。`,
  en: `Browse all ${count} free online developer tools: format converters, encoding, networking and more, all browser-local.`,
});
