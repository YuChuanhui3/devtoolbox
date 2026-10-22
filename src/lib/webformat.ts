import beautify from 'js-beautify';
import { ToolError, errorHint } from './errors';
import { offsetToLineColumn } from './text';

export type WebLanguage = 'html' | 'css' | 'js';
export type WebAction = 'format' | 'minify';

export const WEB_LANGUAGE_LABEL: Record<WebLanguage, string> = {
  html: 'HTML',
  css: 'CSS',
  js: 'JavaScript',
};

export const WEB_HIGHLIGHT_LANGUAGE: Record<WebLanguage, string> = {
  html: 'xml',
  css: 'css',
  js: 'javascript',
};

export const WEB_EXTENSION: Record<WebLanguage, string> = {
  html: 'html',
  css: 'css',
  js: 'js',
};

function assertInput(source: string, language: WebLanguage): void {
  if (!source.trim()) {
    throw new ToolError(
      {
        zh: `请输入 ${WEB_LANGUAGE_LABEL[language]} 代码`,
        en: `Enter ${WEB_LANGUAGE_LABEL[language]} code`,
      },
      {
        zh: '粘贴代码后点击「格式化」或「压缩」。',
        en: 'Paste code and click "Format" or "Minify".',
      },
    );
  }
}

function syntaxError(
  source: string,
  offset: number,
  message: string,
  hint: string,
): ToolError {
  const location = offsetToLineColumn(source, offset);
  return new ToolError(
    {
      zh: `${message}：第 ${location.line} 行第 ${location.column} 列。`,
      en: `${message}: line ${location.line}, column ${location.column}.`,
    },
    hint,
    location,
  );
}

interface HtmlToken {
  type: 'text' | 'tag' | 'comment' | 'doctype';
  raw: string;
  start: number;
  name?: string;
  closing?: boolean;
  selfClosing?: boolean;
  preserve?: boolean;
}

const HTML_VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'command',
  'embed',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const HTML_RAW_ELEMENTS = new Set(['pre', 'textarea', 'script', 'style']);

const HTML_OPTIONAL_END_TAGS = new Set([
  'body',
  'colgroup',
  'dd',
  'dt',
  'head',
  'html',
  'li',
  'optgroup',
  'option',
  'p',
  'rp',
  'rt',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
]);

const HTML_P_CLOSERS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

const HTML_BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'colgroup',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hgroup',
  'hr',
  'html',
  'li',
  'main',
  'menu',
  'nav',
  'ol',
  'optgroup',
  'option',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

function findTagEnd(source: string, start: number): number {
  let quote = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index;
    }
  }
  return -1;
}

function findRawClosingTag(
  source: string,
  lowerSource: string,
  name: string,
  from: number,
): { start: number; end: number } | null {
  const needle = `</${name}`;
  let index = lowerSource.indexOf(needle, from);
  while (index >= 0) {
    const boundary = source[index + needle.length];
    if (boundary === '>' || boundary === '/' || /\s/.test(boundary)) {
      const end = findTagEnd(source, index);
      if (end >= 0) return { start: index, end };
    }
    index = lowerSource.indexOf(needle, index + needle.length);
  }
  return null;
}

function tokenizeHtml(source: string): HtmlToken[] {
  const lowerSource = source.toLowerCase();
  const tokens: HtmlToken[] = [];
  let index = 0;

  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      if (end < 0) {
        throw syntaxError(source, index, 'HTML 注释未闭合', '请补全注释结束标记 -->。');
      }
      tokens.push({ type: 'comment', raw: source.slice(index, end + 3), start: index });
      index = end + 3;
      continue;
    }

    if (
      source[index] === '<' &&
      (source.startsWith('<!', index) || source.startsWith('<?', index))
    ) {
      const end = findTagEnd(source, index);
      if (end < 0) {
        throw syntaxError(source, index, 'HTML 声明未闭合', '请检查 <!DOCTYPE> 或处理指令是否缺少 >。');
      }
      tokens.push({ type: 'doctype', raw: source.slice(index, end + 1), start: index });
      index = end + 1;
      continue;
    }

    if (source[index] === '<' && /[a-zA-Z/]/.test(source[index + 1] ?? '')) {
      const start = index;
      const end = findTagEnd(source, start);
      if (end < 0) {
        throw syntaxError(
          source,
          start,
          'HTML 标签未正确结束',
          '请检查标签是否缺少 >，或属性值引号是否未闭合。',
        );
      }
      const raw = source.slice(start, end + 1);

      if (raw.startsWith('</')) {
        const match = /^<\/\s*([a-zA-Z][\w:-]*)/.exec(raw);
        if (!match) {
          throw syntaxError(source, start, 'HTML 结束标签格式不正确', '结束标签应写成 </div> 的形式。');
        }
        tokens.push({
          type: 'tag',
          raw,
          start,
          name: match[1].toLowerCase(),
          closing: true,
          selfClosing: false,
        });
        index = end + 1;
        continue;
      }

      const match = /^<\s*([a-zA-Z][\w:-]*)/.exec(raw);
      if (!match) {
        throw syntaxError(source, start, 'HTML 开始标签格式不正确', '标签名需以英文字母开头。');
      }
      const name = match[1].toLowerCase();
      const selfClosing = /\/\s*>$/.test(raw) || HTML_VOID_ELEMENTS.has(name);
      tokens.push({ type: 'tag', raw, start, name, closing: false, selfClosing });
      index = end + 1;

      if (!selfClosing && HTML_RAW_ELEMENTS.has(name)) {
        const closing = findRawClosingTag(source, lowerSource, name, index);
        if (!closing) {
          throw syntaxError(
            source,
            start,
            `HTML 标签 <${name}> 未闭合`,
            `请补全结束标签 </${name}>。`,
          );
        }
        if (closing.start > index) {
          tokens.push({
            type: 'text',
            raw: source.slice(index, closing.start),
            start: index,
            preserve: true,
          });
        }
        tokens.push({
          type: 'tag',
          raw: source.slice(closing.start, closing.end + 1),
          start: closing.start,
          name,
          closing: true,
          selfClosing: false,
        });
        index = closing.end + 1;
      }
      continue;
    }

    let next = source.indexOf('<', index + 1);
    if (next < 0) next = source.length;
    tokens.push({ type: 'text', raw: source.slice(index, next), start: index });
    index = next;
  }

  return tokens;
}

function shouldImplicitlyClose(openName: string, nextName: string): boolean {
  if (openName === 'p' && HTML_P_CLOSERS.has(nextName)) return true;
  if (openName === 'li' && nextName === 'li') return true;
  if ((openName === 'dt' || openName === 'dd') && (nextName === 'dt' || nextName === 'dd')) {
    return true;
  }
  if (openName === 'tr' && nextName === 'tr') return true;
  if ((openName === 'td' || openName === 'th') && (nextName === 'td' || nextName === 'th')) {
    return true;
  }
  if (openName === 'option' && (nextName === 'option' || nextName === 'optgroup')) return true;
  if (openName === 'optgroup' && nextName === 'optgroup') return true;
  if (
    (openName === 'thead' || openName === 'tbody' || openName === 'tfoot') &&
    (nextName === 'thead' || nextName === 'tbody' || nextName === 'tfoot')
  ) {
    return true;
  }
  return false;
}

function validateHtmlTokens(tokens: HtmlToken[], source: string): void {
  const stack: Array<{ name: string; start: number }> = [];

  for (const token of tokens) {
    if (token.type !== 'tag' || !token.name) continue;

    if (token.closing) {
      if (HTML_VOID_ELEMENTS.has(token.name)) continue;

      const top = stack[stack.length - 1];
      if (top?.name === token.name) {
        stack.pop();
        continue;
      }

      let matchIndex = -1;
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].name === token.name) {
          matchIndex = index;
          break;
        }
      }

      if (matchIndex < 0) {
        throw syntaxError(
          source,
          token.start,
          `HTML 结束标签 </${token.name}> 没有对应的开始标签`,
          '请检查是否多写了结束标签，或开始标签已被误删。',
        );
      }

      const unclosed = stack.slice(matchIndex + 1);
      const blocking = unclosed.find((item) => !HTML_OPTIONAL_END_TAGS.has(item.name));
      if (blocking) {
        throw syntaxError(
          source,
          token.start,
          `HTML 标签闭合不匹配：</${token.name}> 出现时 <${blocking.name}> 尚未闭合`,
          `请先补全 </${blocking.name}>，再闭合 </${token.name}>。`,
        );
      }

      stack.length = matchIndex;
      continue;
    }

    if (token.selfClosing) continue;

    while (stack.length > 0 && shouldImplicitlyClose(stack[stack.length - 1].name, token.name)) {
      stack.pop();
    }
    stack.push({ name: token.name, start: token.start });
  }

  const unclosed = [...stack].reverse().find((item) => !HTML_OPTIONAL_END_TAGS.has(item.name));
  if (unclosed) {
    throw syntaxError(
      source,
      unclosed.start,
      `HTML 标签 <${unclosed.name}> 未闭合`,
      `请补全结束标签 </${unclosed.name}>。`,
    );
  }
}

function isBlockToken(token: HtmlToken | null): boolean {
  return Boolean(
    token &&
      token.type === 'tag' &&
      token.name &&
      (HTML_BLOCK_TAGS.has(token.name) || HTML_OPTIONAL_END_TAGS.has(token.name)),
  );
}

function minifyHtml(source: string): string {
  assertInput(source, 'html');
  const tokens = tokenizeHtml(source);
  validateHtmlTokens(tokens, source);

  let output = '';
  let pendingSpace = false;
  let previous: HtmlToken | null = null;

  const flushSpace = (currentIsBlock: boolean) => {
    if (!pendingSpace) return;
    pendingSpace = false;
    if (!output || !previous) return;
    if (previous.type === 'doctype' || isBlockToken(previous) || currentIsBlock) return;
    output += ' ';
  };

  for (const token of tokens) {
    if (token.type === 'comment') {
      if (token.raw.startsWith('<!--[if') || token.raw.startsWith('<!--<![endif')) {
        flushSpace(false);
        output += token.raw;
        previous = token;
      }
      continue;
    }

    if (token.type === 'tag' || token.type === 'doctype') {
      flushSpace(isBlockToken(token));
      output += token.raw;
      previous = token;
      continue;
    }

    if (token.preserve) {
      pendingSpace = false;
      output += token.raw;
      previous = token;
      continue;
    }

    const leadingSpace = /^\s/.test(token.raw);
    const trailingSpace = /\s$/.test(token.raw);
    const trimmed = token.raw.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      pendingSpace = true;
      continue;
    }

    if (leadingSpace) pendingSpace = true;
    flushSpace(false);
    output += trimmed;
    pendingSpace = trailingSpace;
    previous = token;
  }

  return output.trim();
}

function formatHtml(source: string, indent: number): string {
  assertInput(source, 'html');
  const tokens = tokenizeHtml(source);
  validateHtmlTokens(tokens, source);
  try {
    return beautify.html(source, {
      indent_size: indent,
      indent_inner_html: true,
      preserve_newlines: true,
      max_preserve_newlines: 2,
      wrap_line_length: 0,
      end_with_newline: true,
    });
  } catch (error) {
    throw new ToolError(
      { zh: 'HTML 格式化失败', en: 'HTML formatting failed' },
      errorHint(error, { zh: '请检查 HTML 结构是否完整。', en: 'Check that the HTML structure is complete.' }),
    );
  }
}

function validateCssSyntax(source: string): void {
  const stack: Array<{ char: string; start: number }> = [];
  const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) {
        throw syntaxError(source, index, 'CSS 注释未闭合', '请补全注释结束标记 */。');
      }
      index = end + 2;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      let cursor = index + 1;
      let closed = false;
      while (cursor < source.length) {
        if (source[cursor] === '\\') {
          cursor += 2;
          continue;
        }
        if (source[cursor] === quote) {
          closed = true;
          break;
        }
        if (source[cursor] === '\n') break;
        cursor += 1;
      }
      if (!closed) {
        throw syntaxError(
          source,
          index,
          'CSS 字符串未闭合',
          '请补全字符串引号；CSS 字符串不能直接跨行，必要时使用 \\A 换行。',
        );
      }
      index = cursor + 1;
      continue;
    }

    if (char in pairs) {
      stack.push({ char, start: index });
      index += 1;
      continue;
    }

    if (char === '}' || char === ')' || char === ']') {
      const top = stack[stack.length - 1];
      if (!top) {
        throw syntaxError(source, index, `CSS 出现多余的 ${char}`, '请检查括号是否成对出现。');
      }
      if (pairs[top.char] !== char) {
        throw syntaxError(
          source,
          index,
          `CSS 括号不匹配：需要 ${pairs[top.char]}，却遇到 ${char}`,
          '请检查选择器、声明块和函数调用的括号。',
        );
      }
      stack.pop();
    }

    index += 1;
  }

  const unclosed = stack[stack.length - 1];
  if (unclosed) {
    throw syntaxError(
      source,
      unclosed.start,
      `CSS 括号 ${unclosed.char} 未闭合`,
      `请补全对应的 ${pairs[unclosed.char]}。`,
    );
  }
}

const CSS_NO_SPACE_AROUND = new Set(['{', '}', ';', ',', ':', '(', ')', '>']);

function minifyCss(source: string): string {
  assertInput(source, 'css');
  validateCssSyntax(source);

  let output = '';
  let pendingSpace = false;
  let index = 0;

  const append = (chunk: string) => {
    if (!chunk) return;
    const previous = output[output.length - 1] ?? '';
    if (pendingSpace && output && !CSS_NO_SPACE_AROUND.has(previous) && !CSS_NO_SPACE_AROUND.has(chunk[0])) {
      output += ' ';
    }
    pendingSpace = false;
    output += chunk;
  };

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      pendingSpace = true;
      index += 1;
      continue;
    }

    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      const raw = source.slice(index, end + 2);
      if (raw.startsWith('/*!')) {
        append(raw);
      } else if (output) {
        pendingSpace = true;
      }
      index = end + 2;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === '\\') {
          cursor += 2;
          continue;
        }
        if (source[cursor] === quote) {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      append(source.slice(index, cursor));
      index = cursor;
      continue;
    }

    if (char === '}' && output.endsWith(';')) {
      output = output.slice(0, -1);
    }
    append(char);
    index += 1;
  }

  return output.trim();
}

function formatCss(source: string, indent: number): string {
  assertInput(source, 'css');
  validateCssSyntax(source);
  try {
    return beautify.css(source, {
      indent_size: indent,
      preserve_newlines: true,
      max_preserve_newlines: 2,
      end_with_newline: true,
    });
  } catch (error) {
    throw new ToolError(
      { zh: 'CSS 格式化失败', en: 'CSS formatting failed' },
      errorHint(error, { zh: '请检查 CSS 语法是否完整。', en: 'Check that the CSS syntax is complete.' }),
    );
  }
}

interface TerserErrorLike {
  message?: string;
  line?: number;
  col?: number;
  pos?: number;
}

function toJsError(source: string, error: unknown): ToolError {
  if (error instanceof ToolError) return error;
  const details = error as TerserErrorLike;
  let line = typeof details.line === 'number' ? details.line : undefined;
  let column = typeof details.col === 'number' ? details.col + 1 : undefined;

  if (line === undefined && typeof details.pos === 'number') {
    const location = offsetToLineColumn(source, details.pos);
    line = location.line;
    column = location.column;
  }

  const summary = details.message ? `（${details.message}）` : '';
  const location = line ? `：第 ${line} 行${column ? `第 ${column} 列` : ''}` : '';
  return new ToolError(
    {
      zh: `JavaScript 语法错误${location}${summary}`,
      en: `JavaScript syntax error${location}${summary}`,
    },
    {
      zh: '请检查括号、引号、逗号或语句是否完整，并确认语法与运行环境兼容。',
      en: 'Check that brackets, quotes, commas, and statements are complete, and that the syntax is compatible with your runtime.',
    },
    line ? { line, column: column ?? 1 } : undefined,
  );
}

async function runTerser(source: string, module: boolean): Promise<string> {
  // 只有 JS 需要 terser（约 600 kB）：静态导入会让 HTML/CSS 用户白下载一次。
  const { minify: terserMinify } = await import('terser').catch(
    () => {
      throw new ToolError(
        { zh: '压缩模块加载失败', en: 'Failed to load the minifier module' },
        { zh: '懒加载分包没下载下来，请刷新页面后重试。', en: 'The lazily loaded chunk failed to download; refresh the page and try again.' },
      );
    },
  );
  const result = await terserMinify(source, {
    module,
    ecma: 2020,
    compress: false,
    mangle: false,
    format: {
      comments: false,
      ascii_only: false,
      semicolons: true,
    },
  });
  if (typeof result.code !== 'string') {
    throw new ToolError(
      { zh: 'JavaScript 处理失败', en: 'JavaScript processing failed' },
      { zh: '压缩器没有返回结果，请稍后重试。', en: 'The minifier returned no result; please try again later.' },
    );
  }
  return result.code.trim();
}

async function minifyJs(source: string): Promise<string> {
  assertInput(source, 'js');
  let lastError: unknown;
  for (const module of [true, false]) {
    try {
      return await runTerser(source, module);
    } catch (error) {
      if (error instanceof ToolError) throw error;
      lastError = error;
    }
  }
  throw toJsError(source, lastError);
}

async function formatJs(source: string, indent: number): Promise<string> {
  await minifyJs(source);
  try {
    return beautify.js(source, {
      indent_size: indent,
      preserve_newlines: true,
      max_preserve_newlines: 2,
      brace_style: 'collapse',
      end_with_newline: true,
    });
  } catch (error) {
    throw new ToolError(
      { zh: 'JavaScript 格式化失败', en: 'JavaScript formatting failed' },
      errorHint(error, { zh: '请检查代码是否完整。', en: 'Check that the code is complete.' }),
    );
  }
}

export async function formatWebCode(
  language: WebLanguage,
  source: string,
  indent = 2,
): Promise<string> {
  switch (language) {
    case 'html':
      return formatHtml(source, indent);
    case 'css':
      return formatCss(source, indent);
    case 'js':
      return formatJs(source, indent);
  }
}

export async function minifyWebCode(language: WebLanguage, source: string): Promise<string> {
  switch (language) {
    case 'html':
      return minifyHtml(source);
    case 'css':
      return minifyCss(source);
    case 'js':
      return minifyJs(source);
  }
}
