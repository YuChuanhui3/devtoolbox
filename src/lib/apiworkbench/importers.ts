import { ToolError } from '../errors';
import type { L10n, Localized } from '@/i18n/locale';
import { walkRequests } from './tree';
import { importPostman, postmanNoteText } from './transfer';
import { importHar, harNoteText } from './har';
import type { WbCollection } from './types';

/**
 * 两种外来集合格式的统一个入口。每种格式各自的文件在别的模块里，这里只做两件事：
 * 认文件、把各家机器码（`folder-script`、`method-TEAPOT`）换成能显示的中英文。
 */

export type ImportFormat = 'postman' | 'har';

export const IMPORT_FORMATS: Array<{ id: ImportFormat; label: L10n; source: L10n }> = [
  { id: 'postman', label: { zh: 'Postman', en: 'Postman' }, source: { zh: '集合 → Export 得到的 v2.1 JSON', en: 'the v2.1 JSON from Collections → Export' } },
  { id: 'har', label: { zh: 'HAR', en: 'HAR' }, source: { zh: '浏览器 Network 面板导出的 .har', en: 'a .har exported from the browser Network panel' } },
];

export interface ImportedBundle {
  format: ImportFormat;
  collections: WbCollection[];
  ignored: Localized[];
  requestCount: number;
}

const NOTE_OF: Record<ImportFormat, (note: string) => Localized> = {
  postman: postmanNoteText,
  har: harNoteText,
};

function dict(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isHar(doc: Record<string, unknown>): boolean {
  const log = dict(doc.log);
  if (log && Array.isArray(log.entries)) return true;
  return doc.log === undefined && Array.isArray(doc.entries);
}

function isPostman(doc: Record<string, unknown>): boolean {
  return Array.isArray(doc.item) && (doc.info !== undefined || typeof doc._postman_id === 'string');
}

function detectValue(parsed: unknown): ImportFormat | null {
  const doc = dict(parsed);
  if (!doc) return null;
  if (isHar(doc)) return 'har';
  if (isPostman(doc)) return 'postman';
  return null;
}

/**
 * 认文件形状，不认扩展名：`.json` 两种格式都可能是。认不出返回 null，
 * 由调用方决定是报错还是让用户手选——猜错格式比说不清更糟。
 */
export function detectImportFormat(raw: string): ImportFormat | null {
  try {
    return detectValue(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new ToolError({ zh: '不是合法 JSON', en: 'Not valid JSON' });
  }
}

/** `format='auto'` 时先认文件；认不出就报「两种都不是」并把每种该长什么样说清。 */
export function importWorkbenchFile(raw: string, format: ImportFormat | 'auto' = 'auto'): ImportedBundle {
  // 非法 JSON 与「合法但形状不认得」是两种错，下一步动作也不同，不能都推给「认不出格式」。
  const picked = format === 'auto' ? detectValue(readJson(raw)) : format;
  if (!picked) {
    throw new ToolError(
      { zh: '认不出这个文件是哪种格式', en: 'Unrecognised file format' },
      {
        zh: `支持：${IMPORT_FORMATS.map((item) => `${item.label.zh}（${item.source.zh}）`).join('；')}。curl 命令请用在请求编辑器里的「导入 curl」。`,
        en: `Supported: ${IMPORT_FORMATS.map((item) => `${item.label.en} (${item.source.en})`).join('; ')}. For a curl command use Import curl in the request editor.`,
      },
    );
  }
  if (picked === 'postman') {
    const { collection, ignored } = importPostman(raw);
    return {
      format: picked,
      collections: [collection],
      ignored: ignored.map(NOTE_OF.postman),
      requestCount: walkRequests(collection.root).length,
    };
  }
  const { collection, ignored } = importHar(raw);
  return {
    format: picked,
    collections: [collection],
    ignored: ignored.map(NOTE_OF.har),
    requestCount: walkRequests(collection.root).length,
  };
}
