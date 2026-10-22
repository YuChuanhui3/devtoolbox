import parser from 'cron-parser';
import { ToolError } from './errors';

export interface CronFieldInfo {
  label: string;
  value: string;
  description: string;
}

export interface CronResult {
  description: string;
  nextRuns: Date[];
  fields: CronFieldInfo[];
  fieldCount: number;
  hasSeconds: boolean;
}

const FIELD_LABELS = ['秒', '分', '时', '日', '月', '周'];
const WEEKDAY_NAMES: Record<string, string> = {
  '0': '周日',
  '1': '周一',
  '2': '周二',
  '3': '周三',
  '4': '周四',
  '5': '周五',
  '6': '周六',
  '7': '周日',
  SUN: '周日',
  MON: '周一',
  TUE: '周二',
  WED: '周三',
  THU: '周四',
  FRI: '周五',
  SAT: '周六',
};

function describePart(part: string, names?: Record<string, string>): string {
  const mapValue = (value: string) => names?.[value.toUpperCase()] ?? value;

  if (part === '*') return '每';
  if (part === '?') return '每';

  if (part.includes('/')) {
    const [range, step] = part.split('/');
    if (range === '*') return `每${step}`;
    return `${describePart(range, names)}，每${step}`;
  }

  if (part.includes(',')) {
    return part
      .split(',')
      .map((item) => describePart(item, names))
      .join('、');
  }

  if (part.includes('-')) {
    const [start, end] = part.split('-');
    return `${mapValue(start)}至${mapValue(end)}`;
  }

  return mapValue(part);
}

function pad(value: string): string {
  return value.padStart(2, '0');
}

function describeTime(second: string, minute: string, hour: string): string {
  if (second === '*' && minute === '*' && hour === '*') return '每秒';
  if (minute === '*' && hour === '*') return '每分钟';
  if (hour === '*' && /^\*\/\d+$/.test(minute) && (second === '0' || second === '*')) {
    return `每${minute.split('/')[1]}分钟`;
  }
  if (hour === '*') {
    if (minute === '*') return '每分钟';
    const minuteText = /^\d+$/.test(minute) ? `每小时第 ${minute} 分` : `每小时${describePart(minute)}分`;
    return second === '0' ? minuteText : `${minuteText}${describePart(second)}秒`;
  }

  if (/^\d+$/.test(hour) && /^\d+$/.test(minute)) {
    if (!/^\d+$/.test(second)) {
      return `${pad(hour)}:${pad(minute)}（${describePart(second)}秒）`;
    }
    return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
  }

  return `${describePart(hour)}时${describePart(minute)}分${describePart(second)}秒`;
}

function buildDescription(second: string, minute: string, hour: string, dom: string, month: string, dow: string): string {
  const dateParts: string[] = [];
  if (month !== '*' && month !== '?') dateParts.push(`每年${describePart(month)}月`);
  if (dom !== '*' && dom !== '?') dateParts.push(`每月${describePart(dom)}日`);
  if (dow !== '*' && dow !== '?') {
    const dowText = describePart(dow, WEEKDAY_NAMES);
    dateParts.push(
      dowText.startsWith('每') ? `每周（${dowText}）` : `每周${dowText.replace(/^周/, '')}`,
    );
  }

  const dateText = dateParts.length > 0 ? dateParts.join('，') : '每天';
  return `${dateText} ${describeTime(second, minute, hour)} 执行`;
}

export function parseCron(expression: string, count = 5): CronResult {
  const trimmed = expression.trim();
  if (!trimmed) {
    throw new ToolError(
      { zh: '请输入 Cron 表达式', en: 'Enter a Cron expression' },
      { zh: '例如 0 9 * * * 表示每天 09:00 执行。', en: 'For example, 0 9 * * * runs daily at 09:00.' },
    );
  }

  const rawFields = trimmed.split(/\s+/);
  if (rawFields.length !== 5 && rawFields.length !== 6) {
    throw new ToolError(
      {
        zh: `Cron 字段数量不正确：当前 ${rawFields.length} 个`,
        en: `Incorrect number of Cron fields: ${rawFields.length} found`,
      },
      {
        zh: '支持 5 位（分 时 日 月 周）或 6 位（秒 分 时 日 月 周）表达式。',
        en: 'Supports 5 fields (minute hour day month weekday) or 6 fields (second minute hour day month weekday).',
      },
    );
  }

  const hasSeconds = rawFields.length === 6;
  const fields = hasSeconds ? rawFields : ['0', ...rawFields];
  const normalized = fields.join(' ').replace(/\?/g, '*');
  const [second, minute, hour, dom, month, dow] = fields;

  let nextRuns: Date[] = [];
  try {
    const interval = parser.parseExpression(normalized, { currentDate: new Date() });
    for (let index = 0; index < count; index += 1) {
      nextRuns.push(interval.next().toDate());
    }
  } catch (error) {
    throw new ToolError(
      {
        zh: `Cron 表达式不正确：${error instanceof Error ? error.message : '无法解析'}`,
        en: `Invalid Cron expression: ${error instanceof Error ? error.message : '无法解析'}`,
      },
      {
        zh: '请检查每个字段的取值是否在合法范围内，例如分钟 0-59、小时 0-23、月份 1-12。',
        en: 'Check that each field value is within its valid range, e.g. minute 0-59, hour 0-23, month 1-12.',
      },
    );
  }

  const fieldInfos: CronFieldInfo[] = fields.map((value, index) => ({
    label: FIELD_LABELS[index],
    value,
    description: describePart(value, index === 5 ? WEEKDAY_NAMES : undefined),
  }));

  return {
    description: buildDescription(second, minute, hour, dom, month, dow),
    nextRuns,
    fields: fieldInfos,
    fieldCount: rawFields.length,
    hasSeconds,
  };
}

export function formatDateTime(date: Date): string {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ];
  const time = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ];
  return `${parts.join('-')} ${time.join(':')}`;
}
