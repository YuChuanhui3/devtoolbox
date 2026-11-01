import { ToolError } from './errors';

/** 交给 Prettier 处理的语法；HTML / CSS / JS 仍走 webformat 里的 js-beautify + Terser 通路。 */
export type PrettyLanguage = 'ts' | 'json' | 'yaml' | 'markdown';

export const PRETTY_LANGUAGES: PrettyLanguage[] = ['ts', 'json', 'yaml', 'markdown'];

export const PRETTY_LANGUAGE_LABEL: Record<PrettyLanguage, string> = {
  ts: 'TypeScript',
  json: 'JSON',
  yaml: 'YAML',
  markdown: 'Markdown',
};

export const PRETTY_HIGHLIGHT_LANGUAGE: Record<PrettyLanguage, string> = {
  ts: 'typescript',
  json: 'json',
  yaml: 'yaml',
  markdown: 'markdown',
};

export const PRETTY_EXTENSION: Record<PrettyLanguage, string> = {
  ts: 'ts',
  json: 'json',
  yaml: 'yml',
  markdown: 'md',
};

const PARSER: Record<PrettyLanguage, string> = {
  ts: 'typescript',
  json: 'json',
  yaml: 'yaml',
  markdown: 'markdown',
};

type PluginModule = { default?: unknown } | unknown;

function unwrap(module: PluginModule) {
  return typeof module === 'object' && module !== null && 'default' in module
    ? (module as { default: unknown }).default
    : module;
}

/** 每个语言只加载它需要的 Prettier 插件，插件体积大，全部走动态 import 分包。 */
async function loadPlugins(language: PrettyLanguage) {
  const prettier = unwrap(await import('prettier/standalone')) as {
    format: (source: string, options: Record<string, unknown>) => Promise<string>;
    __debug?: unknown;
  };
  const estree = language === 'yaml' || language === 'markdown' ? null : unwrap(await import('prettier/plugins/estree'));
  const parserPlugin =
    language === 'ts'
      ? unwrap(await import('prettier/plugins/typescript'))
      : language === 'json'
        ? unwrap(await import('prettier/plugins/babel'))
        : language === 'yaml'
          ? unwrap(await import('prettier/plugins/yaml'))
          : unwrap(await import('prettier/plugins/markdown'));

  const plugins = [parserPlugin, ...(estree ? [estree] : [])].filter(Boolean);
  return { prettier, plugins };
}

interface PrettierErrorShape {
  message?: string;
  loc?: { start?: { line?: number; column?: number } };
  codeFrame?: string;
  name?: string;
}

function toFormatError(language: PrettyLanguage, caught: unknown): ToolError {
  const error = caught as PrettierErrorShape;
  const line = error?.loc?.start?.line;
  const column = error?.loc?.start?.column;
  const label = PRETTY_LANGUAGE_LABEL[language];
  const raw = (error?.message ?? String(caught)).split('\n')[0];

  if (line && column) {
    return new ToolError(
      {
        zh: `${label} 语法错误：第 ${line} 行第 ${column} 列。`,
        en: `${label} syntax error: line ${line}, column ${column}.`,
      },
      {
        zh: raw || '请检查报错位置的语法后重试。',
        en: raw || 'Fix the syntax at the reported position and try again.',
      },
      { line, column },
    );
  }
  return new ToolError(
    { zh: `${label} 格式化失败。`, en: `Failed to format ${label}.` },
    raw || { zh: '请检查代码语法后重试。', en: 'Check the syntax and try again.' },
  );
}

export async function formatPretty(
  language: PrettyLanguage,
  source: string,
  tabWidth = 2,
): Promise<string> {
  const { prettier, plugins } = await loadPlugins(language);
  try {
    return await prettier.format(source, {
      parser: PARSER[language],
      plugins,
      tabWidth,
      printWidth: 100,
      semi: language === 'ts' || language === 'json',
    });
  } catch (caught) {
    throw toFormatError(language, caught);
  }
}
