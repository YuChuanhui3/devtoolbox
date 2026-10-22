import type { CategoryId, CategoryMeta } from '@/types/tool';

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'encode',
    name: { zh: '编码加密', en: 'Encoding & Crypto' },
    shortName: { zh: '编码加密', en: 'Encoding' },
    description: {
      zh: 'Base64、URL、Unicode、Hash、JWT 与 AES 等编码、摘要和加解密工具。',
      en: 'Encoding, digest and encryption tools such as Base64, URL, Unicode, hash, JWT and AES.',
    },
    icon: 'ShieldCheck',
    tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'dev',
    name: { zh: '开发调试', en: 'Developer Utilities' },
    shortName: { zh: '开发调试', en: 'Developer' },
    description: {
      zh: '时间戳、UUID、正则、进制、HTTP 参考、Cron 与文本对比等开发辅助能力。',
      en: 'Helpers for daily development: timestamps, UUID, regex, radix, HTTP references, cron and text diff.',
    },
    icon: 'Terminal',
    tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  {
    id: 'markdown',
    name: { zh: 'Markdown', en: 'Markdown' },
    shortName: { zh: 'Markdown', en: 'Markdown' },
    description: {
      zh: 'Markdown 实时渲染、分栏预览、同步滚动、自动保存与 HTML / MD 导出。',
      en: 'Live Markdown rendering with split preview, synced scrolling, autosave and HTML / MD export.',
    },
    icon: 'FileText',
    tone: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  },
  {
    id: 'data',
    name: { zh: '数据格式', en: 'Data Formats' },
    shortName: { zh: '数据格式', en: 'Data' },
    description: {
      zh: 'JSON、YAML、XML、CSV、Query 等常见数据格式的格式化、校验与互相转换。',
      en: 'Format, validate and convert common data formats: JSON, YAML, XML, CSV and query strings.',
    },
    icon: 'Database',
    tone: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  {
    id: 'image',
    name: { zh: '图像处理', en: 'Image Tools' },
    shortName: { zh: '图像处理', en: 'Image' },
    description: {
      zh: '浏览器本地完成图片压缩与 JPG / PNG / WebP 格式转换，文件不上传。',
      en: 'Compress and convert JPG / PNG / WebP entirely in the browser — files never leave your device.',
    },
    icon: 'Image',
    tone: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
  {
    id: 'network',
    name: { zh: '网络工具', en: 'Network Tools' },
    shortName: { zh: '网络工具', en: 'Network' },
    description: {
      zh: 'IP、子网、DNS、HTTP / WebSocket 调试与 UA、MAC、robots.txt 等网络类生成查询工具。',
      en: 'IP, subnet, DNS, HTTP / WebSocket debugging, plus generators for UA, MAC addresses and robots.txt.',
    },
    icon: 'Network',
    tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  {
    id: 'text',
    name: { zh: '文本处理', en: 'Text Tools' },
    shortName: { zh: '文本处理', en: 'Text' },
    description: {
      zh: '去重、排序、大小写、字数统计、多行编辑与 HTML 清理。',
      en: 'Dedupe, sort, change case, count words, edit multiline text and clean up HTML.',
    },
    icon: 'Type',
    tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },];

export const CATEGORY_MAP = new Map<CategoryId, CategoryMeta>(
  CATEGORIES.map((category) => [category.id, category]),
);

export const getCategory = (id: string): CategoryMeta | undefined =>
  CATEGORY_MAP.get(id as CategoryId);
