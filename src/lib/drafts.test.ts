import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRAFTS_STORAGE_KEY,
  MAX_DRAFT_COUNT,
  MAX_DRAFT_LENGTH,
  clearToolDrafts,
  countToolDrafts,
  getToolDraft,
  readDrafts,
  removeToolDraft,
  saveToolDraft,
} from './drafts';

describe('drafts', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and reads a tool draft', () => {
    expect(saveToolDraft('base64', 'hello')).toBe(true);

    const draft = getToolDraft('base64');
    expect(draft?.input).toBe('hello');
    expect(typeof draft?.updatedAt).toBe('number');
    expect(countToolDrafts()).toBe(1);
  });

  it('ignores malformed storage content', () => {
    window.localStorage.setItem(DRAFTS_STORAGE_KEY, '{not-json');
    expect(readDrafts()).toEqual({});

    window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify([]));
    expect(readDrafts()).toEqual({});

    window.localStorage.setItem(
      DRAFTS_STORAGE_KEY,
      JSON.stringify({
        valid: { input: 'ok', updatedAt: 1 },
        missingTime: { input: 'x' },
        wrongInput: { input: 2, updatedAt: 3 },
        '': { input: 'empty id', updatedAt: 4 },
      }),
    );

    expect(readDrafts()).toEqual({ valid: { input: 'ok', updatedAt: 1 } });
  });

  it('returns null for empty or unknown tool ids', () => {
    expect(getToolDraft('')).toBeNull();
    expect(getToolDraft('unknown')).toBeNull();
  });

  it('removes a single draft and the storage key when empty', () => {
    saveToolDraft('base64', 'hello');
    removeToolDraft('base64');

    expect(getToolDraft('base64')).toBeNull();
    expect(window.localStorage.getItem(DRAFTS_STORAGE_KEY)).toBeNull();

    removeToolDraft('base64');
    removeToolDraft('');
  });

  it('clears all drafts', () => {
    saveToolDraft('base64', 'hello');
    saveToolDraft('json-formatter', '{}');

    clearToolDrafts();

    expect(countToolDrafts()).toBe(0);
  });

  it('removes an existing draft when the input becomes empty or too large', () => {
    saveToolDraft('base64', 'hello');
    expect(saveToolDraft('base64', '')).toBe(false);
    expect(getToolDraft('base64')).toBeNull();

    saveToolDraft('base64', 'hello');
    expect(saveToolDraft('base64', 'x'.repeat(MAX_DRAFT_LENGTH + 1))).toBe(false);
    expect(getToolDraft('base64')).toBeNull();
  });

  it('rejects empty tool ids', () => {
    expect(saveToolDraft('', 'hello')).toBe(false);
    expect(countToolDrafts()).toBe(0);
  });

  it('prunes the oldest drafts when exceeding the limit', () => {
    const now = vi.spyOn(Date, 'now');
    let time = 1_000;
    now.mockImplementation(() => time++);

    for (let index = 0; index <= MAX_DRAFT_COUNT; index += 1) {
      saveToolDraft(`tool-${index}`, `value-${index}`);
    }

    now.mockRestore();

    expect(countToolDrafts()).toBe(MAX_DRAFT_COUNT);
    expect(getToolDraft('tool-0')).toBeNull();
    expect(getToolDraft('tool-1')).not.toBeNull();
    expect(getToolDraft(`tool-${MAX_DRAFT_COUNT}`)).not.toBeNull();
  });

  it('returns false when storage is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(saveToolDraft('base64', 'hello')).toBe(false);
    setItem.mockRestore();
  });
});
