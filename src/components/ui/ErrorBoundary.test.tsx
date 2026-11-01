import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

let shouldThrow = true;

function Flaky() {
  if (shouldThrow) throw new Error('boom');
  return <p>recovered</p>;
}

beforeEach(() => {
  shouldThrow = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('捕获渲染错误并提供重试', async () => {
  render(
    <ErrorBoundary>
      <Flaky />
    </ErrorBoundary>,
  );
  expect(screen.getByText('这个工具运行时出错了')).toBeInTheDocument();
  expect(screen.getByText('boom')).toBeInTheDocument();

  shouldThrow = false;
  await userEvent.click(screen.getByText('重试'));
  expect(screen.getByText('recovered')).toBeInTheDocument();
});

it('resetKey 变化时自动恢复', async () => {
  const { rerender } = render(
    <ErrorBoundary resetKey="a">
      <Flaky />
    </ErrorBoundary>,
  );
  expect(screen.getByText('这个工具运行时出错了')).toBeInTheDocument();

  shouldThrow = false;
  rerender(
    <ErrorBoundary resetKey="b">
      <Flaky />
    </ErrorBoundary>,
  );
  expect(screen.getByText('recovered')).toBeInTheDocument();
});
