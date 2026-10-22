import { readStorage, removeStorage, writeStorage } from './storage';

export const ANALYTICS_STORAGE_KEY = 'devtoolbox-analytics';

export interface AnalyticsSnapshot {
  version: 1;
  views: Record<string, number>;
  executions: Record<string, number>;
  errors: Record<string, number>;
  searches: number;
  firstUsedAt: number;
  lastUsedAt: number;
}

export interface AnalyticsSummary {
  totalViews: number;
  totalExecutions: number;
  totalErrors: number;
  searches: number;
  lastUsedAt: number | null;
  topTools: Array<{ toolId: string; count: number }>;
}

function emptySnapshot(): AnalyticsSnapshot {
  return {
    version: 1,
    views: {},
    executions: {},
    errors: {},
    searches: 0,
    firstUsedAt: 0,
    lastUsedAt: 0,
  };
}

function readCountMap(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (key && typeof count === 'number' && Number.isFinite(count) && count > 0) {
      counts[key] = Math.floor(count);
    }
  }
  return counts;
}

export function readAnalytics(): AnalyticsSnapshot {
  const raw = readStorage<unknown>(ANALYTICS_STORAGE_KEY, null);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return emptySnapshot();

  const value = raw as Partial<AnalyticsSnapshot>;
  return {
    version: 1,
    views: readCountMap(value.views),
    executions: readCountMap(value.executions),
    errors: readCountMap(value.errors),
    searches: typeof value.searches === 'number' && value.searches > 0 ? value.searches : 0,
    firstUsedAt: typeof value.firstUsedAt === 'number' ? value.firstUsedAt : 0,
    lastUsedAt: typeof value.lastUsedAt === 'number' ? value.lastUsedAt : 0,
  };
}

function updateSnapshot(update: (snapshot: AnalyticsSnapshot, now: number) => void): void {
  const snapshot = readAnalytics();
  const now = Date.now();
  if (!snapshot.firstUsedAt) snapshot.firstUsedAt = now;
  snapshot.lastUsedAt = now;
  update(snapshot, now);
  writeStorage(ANALYTICS_STORAGE_KEY, snapshot);
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

export function trackToolView(toolId: string): void {
  if (!toolId) return;
  updateSnapshot((snapshot) => increment(snapshot.views, toolId));
}

export function trackToolExecution(toolId: string, success = true): void {
  if (!toolId) return;
  updateSnapshot((snapshot) => {
    increment(snapshot.executions, toolId);
    if (!success) increment(snapshot.errors, toolId);
  });
}

export function trackSearch(): void {
  updateSnapshot((snapshot) => {
    snapshot.searches += 1;
  });
}

export function clearAnalytics(): void {
  removeStorage(ANALYTICS_STORAGE_KEY);
}

export function getAnalyticsSummary(): AnalyticsSummary {
  const snapshot = readAnalytics();
  const toolIds = new Set([...Object.keys(snapshot.views), ...Object.keys(snapshot.executions)]);
  const topTools = Array.from(toolIds)
    .map((toolId) => ({
      toolId,
      count: (snapshot.views[toolId] ?? 0) + (snapshot.executions[toolId] ?? 0),
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalViews: Object.values(snapshot.views).reduce((sum, count) => sum + count, 0),
    totalExecutions: Object.values(snapshot.executions).reduce((sum, count) => sum + count, 0),
    totalErrors: Object.values(snapshot.errors).reduce((sum, count) => sum + count, 0),
    searches: snapshot.searches,
    lastUsedAt: snapshot.lastUsedAt || null,
    topTools,
  };
}
