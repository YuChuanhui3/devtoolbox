import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileDiff,
  GitCompareArrows,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { IconButton } from '@/components/ui/IconButton';
import { Panel } from '@/components/ui/Panel';
import { InputPanel, StatsBar } from '@/components/tool/EditorPanels';
import { ActionBar, ClearButton, CopyButton, SampleButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { useToolContext } from '@/components/tool/ToolContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { removeToolDraft } from '@/lib/drafts';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import {
  collectJsonDiffContainerIds,
  compareJson,
  flattenJsonDiff,
  formatJsonDiff,
  type JsonDiffNode,
  type JsonDiffSide,
  type JsonDiffStatus,
  type JsonValueKind,
} from '@/lib/jsonDiff';
import { countTextStats } from '@/lib/text';
import { cn } from '@/lib/cn';
import { SAMPLE_JSON_DIFF_LEFT, SAMPLE_JSON_DIFF_RIGHT } from '@/data/samples';

const DEBOUNCE_DELAY = 300;

const STATUS_TEXT_CLASS: Partial<Record<JsonDiffStatus, string>> = {
  added: 'text-ok',
  removed: 'text-danger',
  modified: 'text-warn',
};

interface DraftPair {
  left: string;
  right: string;
}

function readDraftPair(raw: string): DraftPair | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const pair = parsed as { left?: unknown; right?: unknown };
    if (typeof pair.left !== 'string' || typeof pair.right !== 'string') return null;
    return { left: pair.left, right: pair.right };
  } catch {
    return null;
  }
}

function valueClass(kind: JsonValueKind): string {
  switch (kind) {
    case 'string':
      return 'json-string';
    case 'number':
      return 'json-number';
    case 'boolean':
      return 'json-boolean';
    case 'null':
      return 'json-null';
    default:
      return 'text-ink-3';
  }
}

function sideToneClass(node: JsonDiffNode, side: JsonDiffSide): string {
  const exists = side === 'left' ? Boolean(node.left) : Boolean(node.right);
  if (!exists) return 'bg-surface-2/40';
  if (node.status === 'added') return 'bg-ok-soft/60';
  if (node.status === 'removed') return 'bg-danger-soft/60';
  if (node.status === 'modified') return 'bg-warn-soft/70';
  return '';
}

function statusSymbol(status: JsonDiffStatus): string | null {
  if (status === 'added') return '+';
  if (status === 'removed') return '−';
  if (status === 'modified') return '~';
  return null;
}

interface DiffCellProps {
  node: JsonDiffNode;
  side: JsonDiffSide;
  depth: number;
  collapsed: boolean;
  onToggle: (id: string) => void;
}

function DiffCell({ node, side, depth, collapsed, onToggle }: DiffCellProps) {
  const { t } = useI18n();
  const info = side === 'left' ? node.left : node.right;
  if (!info) return <div className="h-6" aria-hidden="true" />;

  const hasChildren = node.children.length > 0;
  const canToggle = hasChildren && (side === 'left' ? Boolean(node.left) : !node.left);
  const symbol = statusSymbol(node.status);
  const textTone = STATUS_TEXT_CLASS[node.status];

  return (
    <div
      className="flex h-6 min-w-0 items-center gap-1.5 whitespace-nowrap"
      style={{ paddingLeft: depth * 16 }}
    >
      <span className="flex h-5 w-4 shrink-0 items-center justify-center">
        {canToggle ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={!collapsed}
            aria-label={t({
              zh: `${collapsed ? '展开' : '折叠'} ${node.path}`,
              en: `${collapsed ? 'Expand' : 'Collapse'} ${node.path}`,
            })}
            className="inline-flex h-5 w-4 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </span>

      {symbol ? (
        <span aria-hidden="true" className={cn('shrink-0 font-semibold', textTone)}>
          {symbol}
        </span>
      ) : null}

      <span
        className={cn('max-w-[24ch] shrink-0 truncate', node.status === 'unchanged' ? 'json-key' : textTone)}
        title={node.path}
      >
        {node.key}
      </span>
      <span className="shrink-0 text-ink-3">:</span>
      <span
        className={cn('min-w-0 truncate', textTone ?? valueClass(info.kind))}
        title={info.preview}
      >
        {info.preview}
      </span>

      {node.orderChanged && side === 'left' ? (
        <span className="shrink-0 rounded-lg border border-warn/30 bg-warn-soft px-1 text-[10px] font-sans text-warn">
          {t({ zh: '键顺序不同', en: 'Key order differs' })}
        </span>
      ) : null}
    </div>
  );
}

function ResultPlaceholder({
  icon,
  title,
  description,
  titleClassName,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  titleClassName?: string;
}) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-6 text-center">
      {icon}
      <p className={cn('text-sm font-medium text-ink', titleClassName)}>{title}</p>
      <p className="max-w-md text-xs leading-5 text-ink-3">{description}</p>
    </div>
  );
}

export default function JsonDiffTool() {
  const { t } = useI18n();
  const toolContext = useToolContext();
  const restoredPairRef = useRef<DraftPair | null>(readDraftPair(toolContext?.initialInput ?? ''));
  const [left, setLeftState] = useState(() => restoredPairRef.current?.left ?? SAMPLE_JSON_DIFF_LEFT);
  const [right, setRightState] = useState(
    () => restoredPairRef.current?.right ?? SAMPLE_JSON_DIFF_RIGHT,
  );
  const [ignoreKeyOrder, setIgnoreKeyOrder] = useState(true);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const debouncedLeft = useDebouncedValue(left, DEBOUNCE_DELAY);
  const debouncedRight = useDebouncedValue(right, DEBOUNCE_DELAY);
  const ready = Boolean(debouncedLeft.trim() && debouncedRight.trim());

  const analysis = useMemo(() => {
    if (!ready) return null;
    return compareJson(debouncedLeft, debouncedRight, { ignoreKeyOrder });
  }, [ready, debouncedLeft, debouncedRight, ignoreKeyOrder]);

  const okResult = analysis?.ok ? analysis : null;
  const stats = okResult?.stats ?? null;
  const totalChanges = stats ? stats.added + stats.removed + stats.modified : 0;
  const hasDiff = Boolean(stats && totalChanges > 0);
  const hasErrors = Boolean(analysis && !analysis.ok);
  const isEqual = Boolean(analysis?.ok && analysis.equal);
  const diffText = useMemo(
    () => (okResult ? formatJsonDiff(okResult.root, okResult.stats) : ''),
    [okResult],
  );

  const leftError =
    analysis && !analysis.ok ? analysis.errors.find((error) => error.side === 'left') : undefined;
  const rightError =
    analysis && !analysis.ok ? analysis.errors.find((error) => error.side === 'right') : undefined;

  const leftStats = useMemo(() => countTextStats(left), [left]);
  const rightStats = useMemo(() => countTextStats(right), [right]);

  const rows = useMemo(
    () => (okResult ? flattenJsonDiff(okResult.root, { collapsed, onlyChanges }) : []),
    [okResult, collapsed, onlyChanges],
  );

  const { markDirty } = useDraftAutosave(
    () => (left || right ? JSON.stringify({ left, right }) : null),
    [left, right],
    () => {
      setLeftState('');
      setRightState('');
      setCollapsed(new Set());
    },
  );

  const setLeft = (value: string) => {
    markDirty();
    setLeftState(value);
  };

  const setRight = (value: string) => {
    markDirty();
    setRightState(value);
  };

  const handleSample = () => {
    markDirty();
    setLeftState(SAMPLE_JSON_DIFF_LEFT);
    setRightState(SAMPLE_JSON_DIFF_RIGHT);
    setCollapsed(new Set());
  };

  const handleSwap = () => {
    markDirty();
    setLeftState(right);
    setRightState(left);
  };

  const handleClear = () => {
    markDirty();
    setLeftState('');
    setRightState('');
    setCollapsed(new Set());
    if (toolContext) removeToolDraft(toolContext.tool.id);
  };

  const handleToggle = (id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => setCollapsed(new Set());

  const collapseAll = () => {
    if (!okResult) return;
    const containerIds = collectJsonDiffContainerIds(okResult.root);
    setCollapsed(new Set(containerIds.filter((id) => id !== okResult.root.id)));
  };

  const subtitle: Localized = !analysis
    ? ready
      ? { zh: '正在分析两侧 JSON…', en: 'Analyzing both JSON documents…' }
      : left || right
        ? { zh: '等待两侧 JSON 输入完整', en: 'Waiting for valid JSON on both sides' }
        : { zh: '左右两侧各输入一个 JSON 后自动对比', en: 'Enter a JSON on each side to compare automatically' }
    : !analysis.ok
      ? { zh: '请修正输入的 JSON 语法错误', en: 'Fix the JSON syntax errors' }
      : analysis.equal
        ? { zh: '两侧 JSON 结构完全一致', en: 'Both JSON structures match exactly' }
        : { zh: `共发现 ${totalChanges} 处差异`, en: `${totalChanges} differences found` };

  const statusLabel: Localized = !ready
    ? { zh: '两侧 JSON 输入完整后自动对比', en: 'Compares automatically once both sides have JSON' }
    : !analysis
      ? { zh: '正在分析…', en: 'Analyzing…' }
      : !analysis.ok
        ? { zh: '存在 JSON 语法错误', en: 'JSON syntax errors found' }
        : analysis.equal
          ? { zh: '两侧 JSON 结构一致', en: 'Both JSON structures match' }
          : {
              zh: `新增 ${analysis.stats.added} · 删除 ${analysis.stats.removed} · 修改 ${analysis.stats.modified}`,
              en: `${analysis.stats.added} added · ${analysis.stats.removed} removed · ${analysis.stats.modified} modified`,
            };

  return (
    <div className="space-y-4">
      <ActionBar>
        <span
          role="status"
          aria-live="polite"
          className={cn(
            'inline-flex items-center gap-1.5 px-1 text-xs',
            hasErrors ? 'text-danger' : isEqual ? 'text-ok' : 'text-ink-3',
          )}
        >
          {hasErrors ? (
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          ) : isEqual ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <GitCompareArrows className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          )}
          {t(statusLabel)}
        </span>

        <span className="mx-1 hidden h-4 w-px bg-line sm:block" />

        <Checkbox
          checked={ignoreKeyOrder}
          onChange={setIgnoreKeyOrder}
          label={t({ zh: '忽略键顺序', en: 'Ignore key order' })}
          className="text-xs"
        />
        <Checkbox
          checked={onlyChanges}
          onChange={setOnlyChanges}
          label={t({ zh: '仅显示变更', en: 'Show changes only' })}
          className="text-xs"
        />

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={handleSwap}>
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '交换两侧', en: 'Swap sides' })}
          </Button>
          <SampleButton onClick={handleSample} />
          <ClearButton onClick={handleClear} />
          <CopyButton text={diffText} label={t({ zh: '复制差异', en: 'Copy diff' })} disabled={!hasDiff} />
        </div>
      </ActionBar>

      {leftError || rightError ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {leftError ? (
            <ToolAlert
              tone="error"
              title={t({ zh: `左侧：${t(leftError.message)}`, en: `Left: ${t(leftError.message)}` })}
              hint={leftError.hint}
            />
          ) : (
            <div className="hidden lg:block" />
          )}
          {rightError ? (
            <ToolAlert
              tone="error"
              title={t({ zh: `右侧：${t(rightError.message)}`, en: `Right: ${t(rightError.message)}` })}
              hint={rightError.hint}
            />
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          label={t({ zh: '原始 JSON（左）', en: 'Original JSON (left)' })}
          value={left}
          onChange={setLeft}
          placeholder={t({ zh: '粘贴原始 JSON，例如 {"name": "qwen", "version": "1.0.0"}', en: 'Paste the original JSON, e.g. {"name": "qwen", "version": "1.0.0"}' })}
          minHeight={260}
          showLineNumbers
          errorLine={leftError?.line ?? null}
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '行数', en: 'Lines' }), value: leftStats.lines },
                { label: t({ zh: '字符', en: 'Chars' }), value: leftStats.chars },
              ]}
            />
          }
        />

        <InputPanel
          label={t({ zh: '对比 JSON（右）', en: 'Compared JSON (right)' })}
          value={right}
          onChange={setRight}
          placeholder={t({ zh: '粘贴对比 JSON，例如 {"name": "qwen", "version": "1.1.0"}', en: 'Paste the JSON to compare, e.g. {"name": "qwen", "version": "1.1.0"}' })}
          minHeight={260}
          showLineNumbers
          errorLine={rightError?.line ?? null}
          footer={
            <StatsBar
              items={[
                { label: t({ zh: '行数', en: 'Lines' }), value: rightStats.lines },
                { label: t({ zh: '字符', en: 'Chars' }), value: rightStats.chars },
              ]}
            />
          }
        />
      </div>

      <Panel
        title={t({ zh: '差异结果', en: 'Diff result' })}
        subtitle={t(subtitle)}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {stats && hasDiff ? (
              <>
                <Badge tone="success">+ {stats.added}</Badge>
                <Badge tone="danger">− {stats.removed}</Badge>
                <Badge tone="warning">~ {stats.modified}</Badge>
                <span className="mx-0.5 hidden h-4 w-px bg-line sm:block" />
              </>
            ) : null}
            {okResult ? (
              <>
                <IconButton
                  label={t({ zh: '展开全部节点', en: 'Expand all nodes' })}
                  size="sm"
                  onClick={expandAll}
                  disabled={collapsed.size === 0}
                >
                  <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
                <IconButton label={t({ zh: '折叠全部节点', en: 'Collapse all nodes' })} size="sm" onClick={collapseAll}>
                  <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
              </>
            ) : null}
          </div>
        }
        noPadding
        footer={
          hasDiff ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
              <span>{t({ zh: '绿色=新增 · 红色=删除 · 黄色=修改', en: 'Green = added · Red = removed · Yellow = modified' })}</span>
              <span>{ignoreKeyOrder ? t({ zh: '已忽略键顺序', en: 'Key order ignored' }) : t({ zh: '键顺序参与比较', en: 'Key order compared' })}</span>
              <span className="ml-auto tabular-nums">
                {t({ zh: `${rows.length} 行可见`, en: `${rows.length} rows visible` })}
              </span>
            </div>
          ) : null
        }
      >
        {!analysis ? (
          <ResultPlaceholder
            icon={<FileDiff className="h-6 w-6 text-ink-3" aria-hidden="true" />}
            title={t({ zh: '等待 JSON 输入', en: 'Waiting for JSON input' })}
            description={t({
              zh: '左右两侧都输入合法 JSON 后，会按结构展示新增、删除与修改的键值对，缩进和空白差异自动忽略。',
              en: 'Once both sides hold valid JSON, added, removed, and changed key/value pairs are shown by structure; indentation and whitespace differences are ignored.',
            })}
          />
        ) : !analysis.ok ? (
          <ResultPlaceholder
            icon={<XCircle className="h-6 w-6 text-danger" aria-hidden="true" />}
            title={t({ zh: '存在 JSON 语法错误', en: 'JSON syntax errors found' })}
            description={t({
              zh: '请根据上方左右两侧的错误提示修正输入，错误行已在编辑器中高亮。',
              en: 'Fix your input using the error messages above; the failing lines are highlighted in the editors.',
            })}
          />
        ) : analysis.equal ? (
          <ResultPlaceholder
            icon={<CheckCircle2 className="h-6 w-6 text-ok" aria-hidden="true" />}
            title={t({ zh: '两侧 JSON 完全一致', en: 'Both JSON documents match' })}
            description={
              ignoreKeyOrder
                ? t({
                    zh: '两份 JSON 的值、类型与嵌套结构完全相同，键顺序与空白差异已被忽略。',
                    en: 'Both JSON documents have identical values, types, and nesting; key order and whitespace differences were ignored.',
                  })
                : t({
                    zh: '两份 JSON 的值、类型、嵌套结构以及键顺序完全相同。',
                    en: 'Both JSON documents have identical values, types, nesting, and key order.',
                  })
            }
            titleClassName="text-ok"
          />
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <p className="border-b border-line bg-surface-2/40 px-3 py-1.5 text-[11px] text-ink-3 lg:hidden">
              {t({ zh: '左右滑动查看完整对比', en: 'Scroll sideways to see the full comparison' })}
            </p>
            <table className="w-full min-w-[620px] table-fixed border-collapse font-mono text-[12px] leading-5">
              <colgroup>
                <col className="w-10" />
                <col />
                <col className="w-10" />
                <col />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur">
                <tr>
                  <th
                    colSpan={2}
                    scope="colgroup"
                    className="border-b border-r border-line px-3 py-2 text-left text-[11px] font-medium text-ink-2"
                  >
                    {t({ zh: '原始 JSON（左）', en: 'Original JSON (left)' })}
                  </th>
                  <th
                    colSpan={2}
                    scope="colgroup"
                    className="border-b border-line px-3 py-2 text-left text-[11px] font-medium text-ink-2"
                  >
                    {t({ zh: '对比 JSON（右）', en: 'Compared JSON (right)' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ node, depth }) => (
                  <tr key={node.id} className="border-b border-line/60 last:border-b-0">
                    <td className="select-none px-2 py-1 text-right align-top text-[11px] tabular-nums text-ink-3">
                      {node.left?.line ?? ''}
                    </td>
                    <td className={cn('border-r border-line px-2 py-1 align-top', sideToneClass(node, 'left'))}>
                      <DiffCell
                        node={node}
                        side="left"
                        depth={depth}
                        collapsed={collapsed.has(node.id)}
                        onToggle={handleToggle}
                      />
                    </td>
                    <td className="select-none px-2 py-1 text-right align-top text-[11px] tabular-nums text-ink-3">
                      {node.right?.line ?? ''}
                    </td>
                    <td className={cn('px-2 py-1 align-top', sideToneClass(node, 'right'))}>
                      <DiffCell
                        node={node}
                        side="right"
                        depth={depth}
                        collapsed={collapsed.has(node.id)}
                        onToggle={handleToggle}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-center text-[11px] leading-5 text-ink-3">
        {t({
          zh: '左右输入经解析后按结构递归比较，缩进、换行与空白差异自动忽略；所有数据仅在本地浏览器处理。',
          en: 'Both inputs are parsed and compared recursively by structure; indentation, line breaks, and whitespace differences are ignored. All data stays in your browser.',
        })}
      </p>
    </div>
  );
}
