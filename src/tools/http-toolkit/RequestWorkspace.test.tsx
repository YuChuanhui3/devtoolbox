import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/I18nProvider';
import { RequestWorkspace } from './RequestWorkspace';

vi.mock('./RequestPanel', () => ({
  RequestPanel: ({ active }: { active: boolean }) => <div><input aria-label="document URL" /><span>{active ? 'active document' : 'inactive document'}</span></div>,
}));

describe('RequestWorkspace', () => {
  it('keeps editor values when switching documents and selects a surviving document on close', () => {
    localStorage.setItem('devtoolbox-locale', 'en');
    render(<I18nProvider><RequestWorkspace active /></I18nProvider>);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'https://example.com/first' } });
    fireEvent.click(screen.getByRole('button', { name: /Open new request tab|打开新请求标签/ }));
    expect(screen.getByRole('textbox')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: /^(Request|请求) 1$/ }));
    expect(screen.getByRole('textbox')).toHaveValue('https://example.com/first');
    fireEvent.click(screen.getByRole('button', { name: /Close request 1|关闭请求 1/ }));
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.queryByRole('button', { name: /Close request|关闭请求/ })).toBeNull();
  });
});
