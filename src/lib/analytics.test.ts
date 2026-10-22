import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_STORAGE_KEY,
  clearAnalytics,
  getAnalyticsSummary,
  readAnalytics,
  trackSearch,
  trackToolExecution,
  trackToolView,
} from './analytics';

describe('analytics', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts with an empty snapshot and summary', () => {
    const snapshot = readAnalytics();
    expect(snapshot.views).toEqual({});
    expect(snapshot.executions).toEqual({});
    expect(snapshot.errors).toEqual({});
    expect(snapshot.searches).toBe(0);

    const summary = getAnalyticsSummary();
    expect(summary.totalViews).toBe(0);
    expect(summary.totalExecutions).toBe(0);
    expect(summary.lastUsedAt).toBeNull();
    expect(summary.topTools).toEqual([]);
  });

  it('tracks views, executions, errors and searches', () => {
    trackToolView('base64');
    trackToolView('base64');
    trackToolView('json-formatter');
    trackToolExecution('base64');
    trackToolExecution('json-formatter', false);
    trackSearch();
    trackSearch();

    const summary = getAnalyticsSummary();
    expect(summary.totalViews).toBe(3);
    expect(summary.totalExecutions).toBe(2);
    expect(summary.totalErrors).toBe(1);
    expect(summary.searches).toBe(2);
    expect(summary.lastUsedAt).not.toBeNull();
    expect(summary.topTools).toEqual([
      { toolId: 'base64', count: 3 },
      { toolId: 'json-formatter', count: 2 },
    ]);
  });

  it('ignores empty tool ids', () => {
    trackToolView('');
    trackToolExecution('');

    expect(getAnalyticsSummary().totalViews).toBe(0);
    expect(getAnalyticsSummary().totalExecutions).toBe(0);
  });

  it('sanitizes malformed snapshots', () => {
    window.localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify([]));
    expect(readAnalytics().views).toEqual({});

    window.localStorage.setItem(ANALYTICS_STORAGE_KEY, '{oops');
    expect(readAnalytics().searches).toBe(0);

    window.localStorage.setItem(
      ANALYTICS_STORAGE_KEY,
      JSON.stringify({
        views: { good: 2, float: 1.9, negative: -3, text: '4', nan: Number.NaN },
        executions: null,
        errors: { base64: 1 },
        searches: -1,
        firstUsedAt: 'yesterday',
        lastUsedAt: 42,
      }),
    );

    const snapshot = readAnalytics();
    expect(snapshot.views).toEqual({ good: 2, float: 1 });
    expect(snapshot.executions).toEqual({});
    expect(snapshot.errors).toEqual({ base64: 1 });
    expect(snapshot.searches).toBe(0);
    expect(snapshot.firstUsedAt).toBe(0);
    expect(snapshot.lastUsedAt).toBe(42);
  });

  it('keeps the first usage timestamp stable and updates the last one', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(1_000).mockReturnValue(5_000);

    trackToolView('base64');
    trackSearch();

    const snapshot = readAnalytics();
    expect(snapshot.firstUsedAt).toBe(1_000);
    expect(snapshot.lastUsedAt).toBe(5_000);
  });

  it('limits the top tools list to five entries', () => {
    for (let index = 0; index < 7; index += 1) {
      trackToolView(`tool-${index}`);
    }
    trackToolView('tool-6');
    trackToolView('tool-6');

    const summary = getAnalyticsSummary();
    expect(summary.topTools).toHaveLength(5);
    expect(summary.topTools[0]).toEqual({ toolId: 'tool-6', count: 3 });
  });

  it('clears analytics data', () => {
    trackToolView('base64');
    clearAnalytics();

    expect(window.localStorage.getItem(ANALYTICS_STORAGE_KEY)).toBeNull();
    expect(getAnalyticsSummary().totalViews).toBe(0);
  });
});
