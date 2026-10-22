import type { L10n, Localized } from '@/i18n/locale';

export interface RegexTemplate {
  label: Localized;
  pattern: string;
  flags: string;
  description: L10n;
}

export const REGEX_TEMPLATES: RegexTemplate[] = [
  {
    label: { zh: '手机号', en: 'Phone number' },
    pattern: '1[3-9]\\d{9}',
    flags: 'g',
    description: { zh: '中国大陆 11 位手机号', en: '11-digit mainland China mobile number' },
  },
  {
    label: { zh: '邮箱', en: 'Email' },
    pattern: '[\\w.%+-]+@[\\w.-]+\\.[A-Za-z]{2,}',
    flags: 'g',
    description: { zh: '常见邮箱地址', en: 'Common email address' },
  },
  {
    label: 'URL',
    pattern: 'https?://[^\\s]+',
    flags: 'g',
    description: { zh: 'HTTP / HTTPS 链接', en: 'HTTP / HTTPS link' },
  },
  {
    label: { zh: '身份证号', en: 'ID card number' },
    pattern: '\\d{17}[\\dXx]',
    flags: 'g',
    description: { zh: '18 位身份证号', en: '18-digit national ID number' },
  },
  {
    label: { zh: '中文字符', en: 'Chinese characters' },
    pattern: '[\\u4e00-\\u9fa5]+',
    flags: 'g',
    description: { zh: '连续中文字符', en: 'Consecutive Chinese characters' },
  },
  {
    label: { zh: 'IP 地址', en: 'IP address' },
    pattern: '(?:\\d{1,3}\\.){3}\\d{1,3}',
    flags: 'g',
    description: { zh: 'IPv4 地址（宽松匹配）', en: 'IPv4 address (loose match)' },
  },
  {
    label: { zh: '日期', en: 'Date' },
    pattern: '\\d{4}-\\d{2}-\\d{2}',
    flags: 'g',
    description: { zh: 'YYYY-MM-DD 日期', en: 'YYYY-MM-DD date' },
  },
  {
    label: { zh: '整数', en: 'Integer' },
    pattern: '-?\\d+',
    flags: 'g',
    description: { zh: '正整数、负整数与 0', en: 'Positive integers, negative integers, and 0' },
  },
  {
    label: { zh: '小数', en: 'Decimal' },
    pattern: '-?\\d+\\.\\d+',
    flags: 'g',
    description: { zh: '带小数点的数字', en: 'Numbers with a decimal point' },
  },
  {
    label: { zh: '强密码', en: 'Strong password' },
    pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[\\W_]).{8,}$',
    flags: 'g',
    description: { zh: '至少 8 位，含大小写、数字与符号', en: 'At least 8 characters with upper/lowercase letters, digits, and symbols' },
  },
];

export const REGEX_FLAGS: Array<{ value: string; label: string; description: L10n }> = [
  { value: 'g', label: 'g', description: { zh: '全局匹配', en: 'Global match' } },
  { value: 'i', label: 'i', description: { zh: '忽略大小写', en: 'Case-insensitive' } },
  { value: 'm', label: 'm', description: { zh: '多行模式', en: 'Multiline mode' } },
  { value: 's', label: 's', description: { zh: '点号匹配换行', en: 'Dot matches newline' } },
  { value: 'u', label: 'u', description: { zh: 'Unicode 模式', en: 'Unicode mode' } },
];
