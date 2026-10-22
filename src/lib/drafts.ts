import { readStorage, removeStorage, writeStorage } from './storage';

export const DRAFTS_STORAGE_KEY = 'devtoolbox-drafts';
export const MAX_DRAFT_LENGTH = 200_000;
export const MAX_DRAFT_COUNT = 40;

export interface ToolDraft {
  input: string;
  updatedAt: number;
}

export type DraftMap = Record<string, ToolDraft>;

function isToolDraft(value: unknown): value is ToolDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Partial<ToolDraft>;
  return typeof draft.input === 'string' && typeof draft.updatedAt === 'number';
}

export function readDrafts(): DraftMap {
  const raw = readStorage<unknown>(DRAFTS_STORAGE_KEY, {});
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};

  const drafts: DraftMap = {};
  for (const [toolId, value] of Object.entries(raw)) {
    if (toolId && isToolDraft(value)) drafts[toolId] = value;
  }
  return drafts;
}

export function getToolDraft(toolId: string): ToolDraft | null {
  if (!toolId) return null;
  return readDrafts()[toolId] ?? null;
}

export function saveToolDraft(toolId: string, input: string): boolean {
  if (!toolId || !input || input.length > MAX_DRAFT_LENGTH) {
    if (toolId) removeToolDraft(toolId);
    return false;
  }

  const drafts = readDrafts();
  drafts[toolId] = { input, updatedAt: Date.now() };

  const entries = Object.entries(drafts).sort(([, a], [, b]) => a.updatedAt - b.updatedAt);
  while (entries.length > MAX_DRAFT_COUNT) {
    const [oldestId] = entries.shift()!;
    delete drafts[oldestId];
  }

  return writeStorage(DRAFTS_STORAGE_KEY, drafts);
}

export function removeToolDraft(toolId: string): void {
  if (!toolId) return;
  const drafts = readDrafts();
  if (!(toolId in drafts)) return;
  delete drafts[toolId];
  if (Object.keys(drafts).length === 0) {
    removeStorage(DRAFTS_STORAGE_KEY);
    return;
  }
  writeStorage(DRAFTS_STORAGE_KEY, drafts);
}

export function clearToolDrafts(): void {
  removeStorage(DRAFTS_STORAGE_KEY);
}

export function countToolDrafts(): number {
  return Object.keys(readDrafts()).length;
}
