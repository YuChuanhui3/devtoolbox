import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageDropzone } from './ImageDropzone';

vi.mock('@/i18n/I18nProvider', () => ({ useI18n: () => ({ t: (value: { en: string }) => value.en }) }));

describe('image input', () => {
  it('accepts pasted images and respects single-file mode for paste and drop', () => {
    const onFiles = vi.fn();
    render(<ImageDropzone onFiles={onFiles} multiple={false} />);
    const images = [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })];
    const target = screen.getByRole('button');
    fireEvent.paste(target, { clipboardData: { files: images } });
    expect(onFiles).toHaveBeenLastCalledWith([images[0]]);
    fireEvent.drop(target, { dataTransfer: { files: images } });
    expect(onFiles).toHaveBeenLastCalledWith([images[0]]);
    fireEvent.paste(target, { clipboardData: { files: [new File(['text'], 'a.txt', { type: 'text/plain' })] } });
    expect(onFiles).toHaveBeenCalledTimes(2);
  });
});
