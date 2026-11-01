import { describe, expect, it } from 'vitest';
import { ToolError } from './errors';
import { formatPretty, PRETTY_LANGUAGES } from './prettyformat';

describe('formatPretty', () => {
  it('formats every advertised language', async () => {
    const samples: Record<string, string> = {
      ts: 'const  x:number=1\nfunction f(a:number){return a}',
      json: '{"a":1,"b":[2,3]}',
      yaml: 'a:   {b: 1,  c: [1,2]}',
      markdown: '#   Title\n*   item',
    };
    for (const language of PRETTY_LANGUAGES) {
      const output = await formatPretty(language as never, samples[language]);
      expect(output.trim().length).toBeGreaterThan(0);
      expect(output).not.toBe(samples[language]);
    }
  });

  it('honours the indent width', async () => {
    const output = await formatPretty('ts', 'if (a) {\nb\n}', 4);
    expect(output).toContain('\n    b');
  });

  it('reports syntax errors with a line and column', async () => {
    await expect(formatPretty('json', '{\n  "a": ,\n}')).rejects.toMatchObject({
      name: 'ToolError',
      location: { line: 2 },
    });
  });

  it('keeps ToolError type for unparseable YAML', async () => {
    await expect(formatPretty('yaml', 'a: [1,\n')).rejects.toBeInstanceOf(ToolError);
  });
});
