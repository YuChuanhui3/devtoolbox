import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { downloadAll, downloadBlob, downloadText, safeFilename } from './download';

const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock');
const revokeObjectURL = vi.fn();
const click = vi.fn();

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
  HTMLAnchorElement.prototype.click = click;
});

afterEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  click.mockClear();
});

describe('download utilities', () => {
  test('downloadBlob creates an object URL and clicks an anchor', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    downloadBlob('test.txt', blob);
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
  });

  test('downloadText wraps text in a typed Blob', () => {
    downloadText('a.json', '{"a":1}', 'application/json');
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
  });

  test('downloadAll downloads each item sequentially', async () => {
    await downloadAll(
      [
        { filename: 'a.txt', blob: new Blob(['a']) },
        { filename: 'b.txt', blob: new Blob(['b']) },
      ],
      0,
    );
    expect(click).toHaveBeenCalledTimes(2);
  });

  test('safeFilename strips illegal characters and applies fallback', () => {
    expect(safeFilename('a/b:c*?.txt')).toBe('a-b-c-.txt');
    expect(safeFilename('   ')).toBe('result');
    expect(safeFilename('ok.txt')).toBe('ok.txt');
  });
});
