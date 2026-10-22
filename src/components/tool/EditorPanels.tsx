import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from 'react';
import { Panel } from '@/components/ui/Panel';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { cn } from '@/lib/cn';
import { measureLineCount } from '@/lib/text';

/** 与 `leading-6` 一致的行高；行号窗口化后靠它换算，必须与 textarea/pre 严格相同。 */
const LINE_HEIGHT = 24;
/** 可视区上下各多渲染的行数，避免快速滚动时露白。 */
const OVERSCAN = 8;
/** 与输入框/输出区 `p-4` 一致的内容内边距，行号必须从同一条基线起算。 */
const CONTENT_PAD = 16;

interface LineWindow {
  firstLine: number;
  lastLine: number;
  /** 当前滚动位置，供行号槽在每次渲染时重新写入 transform，防止被重渲染抹掉。 */
  scrollTop: number;
  reportScroll: (scrollTop: number, translateTarget: HTMLElement | null) => void;
  bindViewport: (element: HTMLElement | null) => void;
}

/**
 * 只渲染可视区间的行号。
 *
 * 直接对整篇文本 `split('\n')` 再逐行建 DOM，在 5 万行输入下会让每次按键 reconcile 5 万个节点；
 * 而把 scrollTop 放进 state 又会让每帧滚动都触发一次全量重渲染。
 * 因此滚动位置先由调用方直接写 transform 保证跟手，只有「可见行区间」真正变化时才触发重渲染。
 */
function useLineWindow(minHeight: number, lineCount: number): LineWindow {
  const [origin, setOrigin] = useState({ scrollTop: 0, row: 0 });
  const [viewport, setViewport] = useState(minHeight);
  const viewportElRef = useRef<HTMLElement | null>(null);

  const visibleRows = Math.ceil(viewport / LINE_HEIGHT) + OVERSCAN * 2;

  const reportScroll = useCallback((scrollTop: number, translateTarget: HTMLElement | null) => {
    if (translateTarget) {
      translateTarget.style.transform = `translateY(${-scrollTop}px)`;
    }
    const row = Math.floor(scrollTop / LINE_HEIGHT);
    setOrigin((current) =>
      current.row === row && current.scrollTop === scrollTop ? current : { scrollTop, row },
    );
  }, []);

  // 面板高度可被用户拖拽改变（textarea 是 resize-y），用 ResizeObserver 保持窗口大小正确。
  const bindViewport = useCallback((element: HTMLElement | null) => {
    viewportElRef.current = element;
    if (!element) return;
    if (element.clientHeight > 0) setViewport(element.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (element.clientHeight > 0) setViewport(element.clientHeight);
    });
    observer.observe(element);
    // 同一个 DOM 节点重复挂载时（例如父级重渲染）避免同时挂多个观察者。
    const previous = (element as HTMLElement & { __lineGutterObserver?: ResizeObserver }).__lineGutterObserver;
    previous?.disconnect();
    (element as HTMLElement & { __lineGutterObserver?: ResizeObserver }).__lineGutterObserver = observer;
    return () => {
      observer.disconnect();
      delete (element as HTMLElement & { __lineGutterObserver?: ResizeObserver }).__lineGutterObserver;
    };
  }, []);

  useEffect(() => {
    const element = viewportElRef.current;
    if (element && element.clientHeight > 0) setViewport(element.clientHeight);
  }, [lineCount, minHeight]);

  const firstLine = Math.min(Math.max(0, origin.row - OVERSCAN), lineCount);
  return {
    firstLine,
    lastLine: firstLine + visibleRows,
    scrollTop: origin.scrollTop,
    reportScroll,
    bindViewport,
  };
}

function lineNumbers(
  start: number,
  end: number,
  lineCount: number,
  errorLine: number | null | undefined,
  rowClassName: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const last = Math.min(end, lineCount);
  for (let line = start; line < last; line += 1) {
    nodes.push(
      <div
        key={line}
        className={cn(rowClassName, line + 1 === errorLine && 'bg-danger-soft font-semibold text-danger')}
      >
        {line + 1}
      </div>,
    );
  }
  return nodes;
}

interface InputPanelProps {
  value: string;
  onChange: (value: string) => void;
  label?: Localized;
  placeholder?: Localized;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  minHeight?: number;
  disabled?: boolean;
  ariaLabel?: Localized;
  showLineNumbers?: boolean;
  /** 1-based line number to highlight in the gutter, e.g. from a JSON parse error. */
  errorLine?: number | null;
}

export function InputPanel({
  value,
  onChange,
  label = { zh: '输入', en: 'Input' },
  placeholder = { zh: '请在此输入内容…', en: 'Type your content here…' },
  actions,
  footer,
  className,
  minHeight = 240,
  disabled,
  ariaLabel,
  showLineNumbers = false,
  errorLine = null,
}: InputPanelProps) {
  const { t } = useI18n();
  const resolvedLabel = t(label);
  const linesRef = useRef<HTMLDivElement>(null);
  // 空输入时 textarea 仍占着一行，行号槽要显示「1」，与改造前的 split('\n') 行为一致。
  const lineCount = Math.max(1, measureLineCount(value));
  const { firstLine, lastLine, scrollTop, reportScroll, bindViewport } = useLineWindow(
    minHeight,
    lineCount,
  );

  const gutter = (
    <div
      ref={bindViewport}
      aria-hidden="true"
      className="relative shrink-0 select-none overflow-hidden border-r border-line bg-surface-2/60 font-mono text-[13px] leading-6 text-ink-3"
      style={{ width: `${Math.max(2, String(lineCount).length) + 2}ch` }}
    >
      {/* 行号容器脱离文档流：作为 flex 子项时它的内容高度会撑开整行，
          让 overflow-hidden 变成摆设（面板会被撑到几万像素高），窗口化也会因
          clientHeight 反向增大而退化成全量渲染。 */}
      <div
        ref={linesRef}
        className="absolute inset-x-0 top-0"
        style={{
          paddingTop: CONTENT_PAD + firstLine * LINE_HEIGHT,
          transform: `translateY(${-scrollTop}px)`,
        }}
      >
        {lineNumbers(firstLine, lastLine, lineCount, errorLine, 'px-2 text-right tabular-nums')}
      </div>
    </div>
  );

  const textarea = (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onScroll={
        showLineNumbers
          ? (event) => reportScroll(event.currentTarget.scrollTop, linesRef.current)
          : undefined
      }
      placeholder={t(placeholder)}
      disabled={disabled}
      aria-label={ariaLabel ? t(ariaLabel) : resolvedLabel}
      aria-invalid={errorLine ? true : undefined}
      spellCheck={false}
      wrap={showLineNumbers ? 'off' : 'soft'}
      style={{ minHeight }}
      className={cn(
        'code-scroll block h-full w-full resize-y rounded-b-[var(--radius-card)] rounded-t-none border-0 bg-transparent p-4 font-mono text-[13px] leading-6 text-ink outline-none placeholder:text-ink-3 disabled:opacity-60',
        showLineNumbers && 'min-w-0 flex-1 whitespace-pre',
      )}
    />
  );

  return (
    <Panel
      title={resolvedLabel}
      actions={actions}
      footer={footer}
      noPadding
      className={cn('h-full transition-colors duration-300 focus-within:border-accent/40', className)}
    >
      {showLineNumbers ? (
        <div className="flex" style={{ minHeight }}>
          {gutter}
          {textarea}
        </div>
      ) : (
        textarea
      )}
    </Panel>
  );
}

interface OutputPanelProps {
  value: string;
  /** 已转义并带语法高亮的 HTML，由 highlightJson 等安全函数生成。 */
  html?: string;
  label?: Localized;
  actions?: ReactNode;
  footer?: ReactNode;
  emptyText?: Localized;
  className?: string;
  minHeight?: number;
  showLineNumbers?: boolean;
}

export function OutputPanel({
  value,
  html,
  label = { zh: '结果', en: 'Result' },
  actions,
  footer,
  emptyText = { zh: '结果将在这里显示', en: 'Results will appear here' },
  className,
  minHeight = 240,
  showLineNumbers = false,
}: OutputPanelProps) {
  const { t } = useI18n();
  const lineCount = showLineNumbers && value ? outputLineCount(value) : 0;
  const { firstLine, lastLine, reportScroll, bindViewport } = useLineWindow(minHeight, lineCount);

  // 输出侧行号槽位于滚动容器内，会随内容一起滚动，因此不需要反向平移，只按容器 scrollTop 取窗口。
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    reportScroll(event.currentTarget.scrollTop, null);
  };

  const bodyClassName =
    'code-scroll block h-full w-full overflow-auto whitespace-pre-wrap break-words rounded-b-[var(--radius-card)] bg-transparent p-4 font-mono text-[13px] leading-6 text-ink';

  return (
    <Panel
      title={t(label)}
      actions={actions}
      footer={footer}
      noPadding
      className={cn('h-full', className)}
    >
      {value ? (
        showLineNumbers ? (
          <div
            ref={bindViewport}
            onScroll={handleScroll}
            className="code-scroll flex h-full overflow-auto"
            style={{ height: minHeight, minHeight }}
          >
            <div
              aria-hidden="true"
              className="sticky left-0 z-10 shrink-0 select-none border-r border-line bg-surface-2 px-3 py-4 text-right font-mono text-[13px] leading-6 text-ink-3"
            >
              <div style={{ paddingTop: firstLine * LINE_HEIGHT }}>
                {lineNumbers(firstLine, lastLine, lineCount, null, 'tabular-nums')}
              </div>
            </div>
            {html ? (
              <pre
                className="min-w-max flex-1 bg-transparent p-4 font-mono text-[13px] leading-6 text-ink"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <pre className="min-w-max flex-1 bg-transparent p-4 font-mono text-[13px] leading-6 text-ink">
                {value}
              </pre>
            )}
          </div>
        ) : html ? (
          <pre className={bodyClassName} style={{ minHeight }} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className={bodyClassName} style={{ minHeight }}>
            {value}
          </pre>
        )
      ) : (
        <div
          className="flex items-center justify-center rounded-b-[var(--radius-card)] px-4 text-center text-xs text-ink-3"
          style={{ minHeight }}
        >
          {t(emptyText)}
        </div>
      )}
    </Panel>
  );
}

/**
 * 与 `value.replace(/\n$/, '').split('\n').length` 等价，但不复制整段结果再切分。
 */
function outputLineCount(value: string): number {
  if (!value.endsWith('\n')) return measureLineCount(value);
  return Math.max(1, measureLineCount(value) - 1);
}

export interface StatItem {
  label: string;
  value: ReactNode;
}

export function StatsBar({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3', className)}>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1 tabular-nums">
          <span>{item.label}</span>
          <span className="font-medium text-ink-2">{item.value}</span>
        </span>
      ))}
    </div>
  );
}
