import { describe, expect, test } from 'vitest';
import { ToolError, errorMessage, toToolError } from './errors';

describe('error utilities', () => {
  test('ToolError carries a message and hint', () => {
    const error = new ToolError('失败', '请重试');
    expect(error.message).toBe('失败');
    expect(error.hint).toBe('请重试');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ToolError');
  });

  test('toToolError returns ToolError unchanged', () => {
    const error = new ToolError('失败');
    expect(toToolError(error)).toBe(error);
  });

  test('toToolError wraps Error instances', () => {
    expect(toToolError(new Error('boom')).message).toBe('boom');
  });

  test('toToolError handles unknown values', () => {
    expect(toToolError('string').message).toBe('处理失败，请检查输入内容后重试。');
    expect(errorMessage(null)).toBe('处理失败，请检查输入内容后重试。');
  });
});
