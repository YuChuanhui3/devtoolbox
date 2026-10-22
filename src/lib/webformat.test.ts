import { describe, expect, test } from 'vitest';
import { ToolError } from './errors';
import { tl } from '@/i18n/locale';
import {
  formatWebCode,
  minifyWebCode,
  WEB_EXTENSION,
  WEB_HIGHLIGHT_LANGUAGE,
  WEB_LANGUAGE_LABEL,
} from './webformat';

async function captureError(task: Promise<unknown>): Promise<ToolError> {
  try {
    await task;
  } catch (error) {
    expect(error).toBeInstanceOf(ToolError);
    return error as ToolError;
  }
  throw new Error('预期抛出 ToolError，但调用成功返回');
}

describe('web language metadata', () => {
  test('maps labels, highlight names and extensions', () => {
    expect(WEB_LANGUAGE_LABEL).toEqual({ html: 'HTML', css: 'CSS', js: 'JavaScript' });
    expect(WEB_HIGHLIGHT_LANGUAGE).toEqual({ html: 'xml', css: 'css', js: 'javascript' });
    expect(WEB_EXTENSION).toEqual({ html: 'html', css: 'css', js: 'js' });
  });

  test.each(['html', 'css', 'js'] as const)('rejects empty %s input', async (language) => {
    const formatError = await captureError(formatWebCode(language, '  \n  '));
    expect(formatError.message).toContain('请输入');

    const minifyError = await captureError(minifyWebCode(language, ''));
    expect(minifyError.message).toContain('请输入');
  });
});

describe('HTML formatting', () => {
  test('indents nested markup with 2 or 4 spaces', async () => {
    const source =
      '<html><head><title>T</title></head><body><div><p>Hello</p></div></body></html>';

    const two = await formatWebCode('html', source);
    expect(two).toContain('\n  <head>');
    expect(two).toContain('\n    <title>T</title>');
    expect(two.endsWith('\n')).toBe(true);

    const four = await formatWebCode('html', source, 4);
    expect(four).toContain('\n    <head>');
    expect(four).toContain('\n        <title>T</title>');
  });

  test('preserves doctype, comments, void elements and raw blocks', async () => {
    const source = `<!DOCTYPE html>
<!-- keep -->
<html>
  <body>
    <img src="a.png">
    <br>
    <script>
      const fake = "</scriptx>";
      console.log(fake);
    </script>
    <pre>  raw
  text</pre>
  </body>
</html>`;
    const output = await formatWebCode('html', source);

    expect(output.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(output).toContain('<!-- keep -->');
    expect(output).toContain('<img src="a.png">');
    expect(output).toContain('<br>');
    expect(output).toContain('</scriptx>');
    expect(output).toContain('  raw\n  text');
    expect(output).toContain('</script>');
  });

  test('accepts optional end tags and implied paragraph closing', async () => {
    const source =
      '<ul><li>One<li>Two</ul><table><tr><td>A<td>B</table><p>Text<div>Block</div><p>Last';
    await expect(formatWebCode('html', source)).resolves.toContain('<li>One');
    await expect(minifyWebCode('html', source)).resolves.toContain('<li>One');
  });

  test('treats a stray less-than sign as text', async () => {
    const output = await formatWebCode('html', '<p>1 < 2</p>');
    expect(output).toContain('1 < 2');
  });

  test('reports a mismatched closing tag with a location', async () => {
    const error = await captureError(formatWebCode('html', '<div>\n  <span></div>'));
    expect(error.message).toContain('尚未闭合');
    expect(error.hint).toContain('</span>');
    expect(error.location).toEqual({ line: 2, column: 9 });
    expect(error.message).toContain('第 2 行第 9 列');
  });

  test('reports stray closing tags', async () => {
    const error = await captureError(minifyWebCode('html', '<div></div></div>'));
    expect(error.message).toContain('没有对应的开始标签');
    expect(error.location?.line).toBe(1);
  });

  test('reports unclosed elements, comments, declarations and attributes', async () => {
    const cases: Array<{ source: string; message: string; hint?: string }> = [
      { source: '<section>\n  <p>Hi</p>', message: '<section> 未闭合', hint: '</section>' },
      { source: '<!-- oops', message: 'HTML 注释未闭合', hint: '-->' },
      { source: '<!DOCTYPE html', message: 'HTML 声明未闭合', hint: '>' },
      { source: '<div class="x>', message: 'HTML 标签未正确结束', hint: '引号' },
      { source: '<script>let a = 1;', message: '<script> 未闭合', hint: '</script>' },
      { source: '</>', message: 'HTML 结束标签格式不正确' },
    ];

    for (const item of cases) {
      const error = await captureError(formatWebCode('html', item.source));
      expect(error.message).toContain(item.message);
      if (item.hint) expect(error.hint).toContain(item.hint);
    }
  });
});

describe('HTML minification', () => {
  test('removes comments and redundant whitespace while keeping raw blocks', async () => {
    const source = `<!DOCTYPE html>
<div class="card">
  <!-- remove me -->
  <p>Hello <strong>World</strong> !</p>
  <pre>  keep
  me</pre>
  <script>
    const x = 1;
  </script>
</div>`;

    expect(await minifyWebCode('html', source)).toBe(
      '<!DOCTYPE html><div class="card"><p>Hello <strong>World</strong> !</p>' +
        '<pre>  keep\n  me</pre><script>\n    const x = 1;\n  </script></div>',
    );
  });

  test('keeps inline separators and conditional comments', async () => {
    const source =
      '<p><span>a</span> <span>b</span></p>' +
      '<div><!--[if IE]><span>IE</span><![endif]--><p>x</p></div>' +
      '<!--<![endif]-->';

    expect(await minifyWebCode('html', source)).toBe(source);
  });

  test('collapses text whitespace and trims edges', async () => {
    expect(await minifyWebCode('html', '<p>hello   world\n  again</p>')).toBe(
      '<p>hello world again</p>',
    );
    expect(await minifyWebCode('html', '<div> leading and trailing </div>')).toBe(
      '<div>leading and trailing</div>',
    );
  });

  test('keeps quotes containing greater-than signs intact', async () => {
    expect(await minifyWebCode('html', '<div data-x="a>b">  x </div>')).toBe(
      '<div data-x="a>b">x</div>',
    );
  });

  test('removes whitespace between block elements and optional tags', async () => {
    const source = '<ul>\n  <li>A</li>\n  <li>B</li>\n</ul>\n<p>One</p> <p>Two</p>';
    expect(await minifyWebCode('html', source)).toBe(
      '<ul><li>A</li><li>B</li></ul><p>One</p><p>Two</p>',
    );
  });

  test('preserves processing instructions', async () => {
    const output = await minifyWebCode('html', '<?xml version="1.0"?>\n<root> x </root>');
    expect(output.startsWith('<?xml version="1.0"?><root>')).toBe(true);
    expect(output).toContain('x');
  });
});

describe('CSS formatting', () => {
  test('formats rules, comments and media queries', async () => {
    const source =
      '/* theme */\n.a{color:red;margin:0 10px}\n@media (min-width: 600px){.a{display:none}}';
    const output = await formatWebCode('css', source);

    expect(output).toContain('/* theme */');
    expect(output).toContain('.a {\n  color: red;');
    expect(output).toContain('@media (min-width: 600px) {');
    expect(output).toContain('\n    display: none');
    expect(output.endsWith('\n')).toBe(true);
  });

  test('supports 4-space indentation', async () => {
    const output = await formatWebCode('css', '.a{color:red}', 4);
    expect(output).toContain('\n    color: red');
  });

  test('accepts escaped quotes inside strings', async () => {
    const output = await formatWebCode('css', 'a::after { content: "\\""; }');
    expect(output).toContain('content: "\\""');
  });

  test('reports unbalanced CSS constructs with positions', async () => {
    const cases: Array<{ source: string; message: string; hint?: string }> = [
      { source: 'a { color: red;', message: 'CSS 括号 { 未闭合', hint: '}' },
      { source: '.a { color: "red; }', message: 'CSS 字符串未闭合', hint: '引号' },
      { source: 'a { width: calc(100% - 10px; }', message: 'CSS 括号不匹配', hint: '括号' },
      { source: 'a {} }', message: 'CSS 出现多余的 }', hint: '成对' },
      { source: '/* oops', message: 'CSS 注释未闭合', hint: '*/' },
      { source: 'a {\n  content: "x\n y";\n}', message: 'CSS 字符串未闭合', hint: '跨行' },
    ];

    for (const item of cases) {
      const error = await captureError(formatWebCode('css', item.source));
      expect(error.message).toContain(item.message);
      expect(error.location).toBeDefined();
      if (item.hint) expect(error.hint).toContain(item.hint);
    }
  });
});

describe('CSS minification', () => {
  test('removes whitespace, comments and trailing semicolons', async () => {
    expect(await minifyWebCode('css', '.a { color: red; margin: 0 10px; }')).toBe(
      '.a{color:red;margin:0 10px}',
    );
    expect(
      await minifyWebCode('css', '@media (min-width: 600px) { .a { display: none; } }'),
    ).toBe('@media(min-width:600px){.a{display:none}}');
    expect(await minifyWebCode('css', '.a { color: /* drop */ red; }')).toBe('.a{color:red}');
  });

  test('preserves calc spacing, strings and license comments', async () => {
    expect(await minifyWebCode('css', 'a { width: calc(100% - 20px); }')).toBe(
      'a{width:calc(100% - 20px)}',
    );
    expect(await minifyWebCode('css', '.a::after { content: "a ; b"; }')).toBe(
      '.a::after{content:"a ; b"}',
    );
    expect(await minifyWebCode('css', 'a { content: "\\""; }')).toBe('a{content:"\\""}');
    expect(await minifyWebCode('css', '/*! keep */\n.a { color: red; }\n/* drop */')).toBe(
      '/*! keep */ .a{color:red}',
    );
  });

  test('validates before minifying', async () => {
    const error = await captureError(minifyWebCode('css', 'a { color: red;'));
    expect(error.message).toContain('CSS 括号 { 未闭合');
  });
});

describe('JavaScript formatting and minification', () => {
  test('minifies without renaming identifiers', async () => {
    const source =
      'function add(a, b) { return a + b; } // comment\nconst value = 1;\n' +
      'function greet(userName) { const greeting = "hi"; return greeting + userName; }';
    const output = await minifyWebCode('js', source);

    expect(output).toBe(
      'function add(a,b){return a+b}const value=1;' +
        'function greet(userName){const greeting="hi";return greeting+userName}',
    );
    expect(output).toContain('userName');
    expect(output).toContain('greeting');
    expect(output).not.toContain('// comment');
  });

  test('formats code and keeps comments', async () => {
    const source = 'function add(a,b){return a+b;} // hi\nconst x={a:1,b:[2,3]};';
    const output = await formatWebCode('js', source);

    expect(output).toContain('function add(a, b) {');
    expect(output).toContain('\n  return a + b;');
    expect(output).toContain('// hi');
    expect(output).toContain('const x = {');
    expect(output.endsWith('\n')).toBe(true);

    const four = await formatWebCode('js', source, 4);
    expect(four).toContain('\n    return a + b;');
  });

  test('supports ES modules and falls back to script mode', async () => {
    await expect(
      minifyWebCode('js', "import value from 'pkg';\nexport default value;"),
    ).resolves.toContain('export default value');

    const withStatement = await minifyWebCode('js', 'with (obj) { value = other; }');
    expect(withStatement).toContain('with(obj)');
  });

  test('reports syntax errors with line and column', async () => {
    const error = await captureError(formatWebCode('js', 'const a = 1;\nfunction () {}'));

    expect(error.message).toContain('JavaScript 语法错误');
    expect(error.message).toContain('第 2 行');
    expect(error.location?.line).toBe(2);
    expect(error.location?.column).toBeGreaterThan(1);
    expect(tl(error.hint!, 'zh')).toContain('括号');
  });

  test('validates before formatting minified code', async () => {
    const error = await captureError(minifyWebCode('js', 'const x = ;'));
    expect(error.message).toContain('第 1 行');
    expect(error.location).toEqual({ line: 1, column: 11 });
  });
});
