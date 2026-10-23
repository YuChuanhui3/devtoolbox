import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ListTree } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

type JsonContainer = Record<string, unknown> | unknown[];

interface JsonTreeProps {
  value: unknown;
}

function isContainer(value: unknown): value is JsonContainer {
  return typeof value === 'object' && value !== null;
}

function childEntries(value: JsonContainer): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.map((item, index) => [`[${index}]`, item]);
  return Object.entries(value);
}

function childPath(parent: string, key: string): string {
  return key.startsWith('[') ? `${parent}${key}` : `${parent}.${key}`;
}

function collectExpandablePaths(
  value: unknown,
  path = '$',
  depth = 0,
  paths: string[] = [],
): string[] {
  if (!isContainer(value) || depth > 50 || paths.length >= 2000) return paths;
  const entries = childEntries(value);
  if (entries.length === 0) return paths;

  paths.push(path);
  for (const [key, child] of entries) {
    collectExpandablePaths(child, childPath(path, key), depth + 1, paths);
  }
  return paths;
}

function initialExpanded(value: unknown): Set<string> {
  const paths = new Set<string>();
  if (!isContainer(value)) return paths;

  const entries = childEntries(value);
  if (entries.length === 0) return paths;
  paths.add('$');

  if (entries.length <= 100) {
    for (const [key, child] of entries) {
      if (isContainer(child) && childEntries(child).length > 0) {
        paths.add(childPath('$', key));
      }
    }
  }
  return paths;
}

function PrimitiveValue({ value }: { value: unknown }) {
  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === 'string') {
    return (
      <span className="json-string">
        &quot;{value}&quot;
      </span>
    );
  }
  if (typeof value === 'number') return <span className="json-number">{String(value)}</span>;
  if (typeof value === 'boolean') {
    return <span className="json-boolean">{String(value)}</span>;
  }
  return <span className="text-ink-3">{String(value)}</span>;
}

interface TreeNodeProps {
  name: string | null;
  value: unknown;
  path: string;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}

function TreeNode({ name, value, path, depth, expanded, onToggle }: TreeNodeProps) {
  const { t } = useI18n();
  const container = isContainer(value);
  const entries = container ? childEntries(value) : [];
  const expandable = container && entries.length > 0;
  const open = expandable && expanded.has(path);
  const isArray = Array.isArray(value);
  const label = name ?? t({ zh: '根节点', en: 'root' });
  const summary = container
    ? isArray
      ? t({ zh: `数组 · ${entries.length} 项`, en: `array · ${entries.length} items` })
      : t({ zh: `对象 · ${entries.length} 个字段`, en: `object · ${entries.length} fields` })
    : '';

  return (
    <div role="treeitem" aria-expanded={expandable ? open : undefined} aria-label={`${label} ${path}`}>
      <div
        className="group flex items-start gap-1 rounded-lg py-[3px] pr-2 hover:bg-surface-2/70"
        style={{ paddingLeft: 4 + depth * 16 }}
        title={path}
      >
        {expandable ? (
          <button
            type="button"
            aria-label={`${t(open ? { zh: '折叠', en: 'Collapse' } : { zh: '展开', en: 'Expand' })} ${label}`}
            onClick={() => onToggle(path)}
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        )}

        {name === null ? (
          <span className="shrink-0 pt-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
            {t({ zh: '根节点', en: 'Root' })}
          </span>
        ) : (
          <span className="json-key shrink-0 font-mono text-[12.5px] leading-6">{name}</span>
        )}
        <span className="shrink-0 font-mono text-[12.5px] leading-6 text-ink-3">:</span>

        {container ? (
          <span className="ml-1 inline-flex min-w-0 flex-wrap items-center gap-x-2">
            <span className="font-mono text-[12.5px] leading-6 text-ink-2">
              {expandable ? (isArray ? '[' : '{') : isArray ? '[]' : '{}'}
            </span>
            {expandable ? <span className="text-[11px] leading-6 text-ink-3">{summary}</span> : null}
            {expandable && !open ? (
              <span className="font-mono text-[12.5px] leading-6 text-ink-3">
                {isArray ? '…]' : '…}'}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="min-w-0 break-all font-mono text-[12.5px] leading-6">
            <PrimitiveValue value={value} />
          </span>
        )}
      </div>

      {open ? (
        <div role="group">
          {entries.map(([key, child]) => (
            <TreeNode
              key={childPath(path, key)}
              name={isArray ? key : `"${key}"`}
              value={child}
              path={childPath(path, key)}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function JsonTree({ value }: JsonTreeProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(() => initialExpanded(value));
  const valueRef = useRef(value);

  useEffect(() => {
    if (valueRef.current === value) return;
    valueRef.current = value;
    setExpanded(initialExpanded(value));
  }, [value]);

  const allPaths = useMemo(() => collectExpandablePaths(value), [value]);

  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 max-h-[min(68vh,680px)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-[11px] text-ink-3">
        <span className="inline-flex items-center gap-1">
          <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
          {t({
            zh: `只读树形视图 · 共 ${allPaths.length} 个可展开节点`,
            en: `Read-only tree · ${allPaths.length} expandable node(s)`,
          })}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded(new Set(allPaths))}
            className="rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {t({ zh: '全部展开', en: 'Expand all' })}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(new Set())}
            className="rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {t({ zh: '全部折叠', en: 'Collapse all' })}
          </button>
        </span>
      </div>

      <div
        role="tree"
        aria-label={t({ zh: 'JSON 树形结构', en: 'JSON tree structure' })}
        className="code-scroll min-h-[240px] flex-1 overflow-auto p-2 font-mono"
      >
        {isContainer(value) && childEntries(value).length > 0 ? (
          <TreeNode
            name={null}
            value={value}
            path="$"
            depth={0}
            expanded={expanded}
            onToggle={toggle}
          />
        ) : (
          <div className="flex min-h-[220px] items-center justify-center px-4 text-center text-xs text-ink-3">
            {t({ zh: '当前 JSON 是基础类型：', en: 'The JSON is a primitive value: ' })}
            <PrimitiveValue value={value} />
          </div>
        )}
      </div>
    </div>
  );
}
