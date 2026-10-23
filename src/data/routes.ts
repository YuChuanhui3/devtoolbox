import type { L10n } from '@/i18n/locale';
import { CATEGORIES } from '@/data/categories';
import { TOOLS, getToolsByCategory } from '@/data/tools';
import {
  TOOLS_PAGE_DESCRIPTION,
  TOOLS_PAGE_TITLE,
  categorySeoDescription,
  categorySeoKeywords,
  categorySeoTitle,
  toolSeoDescription,
  toolSeoKeywords,
  toolSeoTitle,
} from '@/lib/seoTemplates';

export interface RouteEntry {
  path: string;
  title: L10n;
  description: L10n;
  keywords: L10n;
}

const HOME_TITLE: L10n = {
  zh: 'DevToolbox · 开发者在线工具箱',
  en: 'DevToolbox · Online Developer Toolbox',
};

export const ROUTES: RouteEntry[] = [
  {
    path: '/',
    title: HOME_TITLE,
    description: {
      zh: `开发者在线工具箱：免费在线格式转换工具合集——JSON 格式化、图片转换、编码加密、时间戳、正则测试、Markdown 实时渲染、图片压缩等 ${TOOLS.length} 个工具，纯浏览器本地处理。`,
      en: `Online toolbox for developers: free online format converters plus JSON formatting, encoding, timestamps, regex, Markdown and image compression — ${TOOLS.length} tools, fully local.`,
    },
    keywords: {
      zh: '在线工具,在线格式转换工具,开发者工具箱,JSON 格式化工具,免费工具箱',
      en: 'online tools, online format converter, developer toolbox, json formatter',
    },
  },
  {
    path: '/tools',
    title: TOOLS_PAGE_TITLE,
    description: TOOLS_PAGE_DESCRIPTION(TOOLS.length),
    keywords: {
      zh: '在线工具,在线格式转换工具,开发者工具大全,JSON 格式化,编码加密,网络工具',
      en: 'online tools, online format converter, developer tools list',
    },
  },
  {
    path: '/about',
    title: { zh: '关于本站', en: 'About' },
    description: {
      zh: '了解 DevToolbox 的定位、功能特色、技术栈与反馈方式。',
      en: 'Learn about DevToolbox: its mission, features, tech stack and how to send feedback.',
    },
    keywords: { zh: 'DevToolbox,在线工具箱,开发者工具', en: 'DevToolbox, online toolbox, developer tools' },
  },
  {
    path: '/privacy',
    title: { zh: '隐私说明', en: 'Privacy Notes' },
    description: {
      zh: '了解 DevToolbox 如何处理你的数据，以及如何清空本地记录。',
      en: 'How DevToolbox handles your data and how to clear local records.',
    },
    keywords: { zh: '隐私,本地处理,localStorage', en: 'privacy, local processing, localStorage' },
  },
  ...CATEGORIES.map((category) => ({
    path: `/category/${category.id}`,
    title: categorySeoTitle(category, getToolsByCategory(category.id).length),
    description: categorySeoDescription(category, getToolsByCategory(category.id).length),
    keywords: categorySeoKeywords(category, getToolsByCategory(category.id)),
  })),
  ...TOOLS.map((tool) => ({
    path: `/tools/${tool.id}`,
    title: toolSeoTitle(tool),
    description: toolSeoDescription(tool),
    keywords: toolSeoKeywords(tool),
  })),
];
