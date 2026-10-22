import { describe, expect, test } from 'vitest';
import { formatDateTime, parseCron } from './cron';

describe('cron utilities', () => {
  test('parses a 5-field weekday expression', () => {
    const result = parseCron('0 9 * * 1-5');
    expect(result.fieldCount).toBe(5);
    expect(result.hasSeconds).toBe(false);
    expect(result.description).toContain('每周一至周五');
    expect(result.description).toContain('09:00:00');
    expect(result.nextRuns).toHaveLength(5);
    expect(result.fields).toHaveLength(6);
    expect(result.fields[0]).toMatchObject({ label: '秒', value: '0' });
  });

  test('parses a 6-field expression with Quartz question mark', () => {
    const result = parseCron('0 0 9 * * ?');
    expect(result.fieldCount).toBe(6);
    expect(result.hasSeconds).toBe(true);
    expect(result.description).toBe('每天 09:00:00 执行');
        expect(result.nextRuns).toHaveLength(5);
  });

  test('describes interval and monthly expressions', () => {
    expect(parseCron('*/5 * * * *').description).toBe('每天 每5分钟 执行');
    expect(parseCron('0 0 1 * *').description).toBe('每月1日 00:00:00 执行');
    expect(parseCron('30 2 * * 0').description).toBe('每周日 02:30:00 执行');
  });

  test('rejects empty and malformed expressions', () => {
    expect(() => parseCron('')).toThrow('请输入 Cron 表达式');
    expect(() => parseCron('0 0 9 * * ? 2026')).toThrow('Cron 字段数量不正确');
    expect(() => parseCron('0 99 * * *')).toThrow(/Cron 表达式不正确/);
  });

  test('formatDateTime formats local date and time', () => {
    const date = new Date(2026, 9, 22, 9, 5, 7);
    expect(formatDateTime(date)).toBe('2026-10-22 09:05:07');
  });
});
