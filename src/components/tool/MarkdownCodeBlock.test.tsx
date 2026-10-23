import { describe, expect, test, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { MarkdownCodeBlock } from './MarkdownCodeBlock';

function Harness({ code, language }: { code: string; language: string }) {
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <I18nProvider>
      <ToastProvider>
        <MarkdownCodeBlock
          code={code}
          language={language}
          value={value}
          onValueChange={setValue}
        />
      </ToastProvider>
    </I18nProvider>
  );
}

const block = (container: HTMLElement) => container.querySelector('pre code') as HTMLElement;

describe('MarkdownCodeBlock', () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  test('normalises the declared language and highlights the block', () => {
    const { container } = render(<Harness code="const a = 1;" language="js" />);
    expect(block(container).className).toBe('hljs language-javascript');
    expect(block(container).innerHTML).toContain('hljs-keyword');
  });

  test('falls back to auto detection when the declared language is unknown', () => {
    const { container } = render(<Harness code="def greet(name):\n    return name" language="weird" />);
    expect(block(container).className).toBe('hljs');
    expect(block(container).innerHTML).toContain('hljs-keyword');
  });

  test('re-highlights when another language is picked from the dropdown', () => {
    const { container } = render(<Harness code="def greet(name):\n    return name" language="js" />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Python' }));

    expect(block(container).className).toBe('hljs language-python');
    expect(block(container).innerHTML).toContain('hljs-title');
    expect(screen.getByRole('combobox')).toHaveTextContent('Python');
  });

  test('copies the raw code rather than the highlighted markup', async () => {
    const code = 'const a = "<b>";';
    render(<Harness code={code} language="js" />);
    fireEvent.click(screen.getByRole('button', { name: /复制|Copy/ }));

    await waitFor(() =>
      expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(code),
    );
  });
});
