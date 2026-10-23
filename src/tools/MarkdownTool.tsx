import { useEffect, useMemo, useRef, useState } from 'react';
import { Columns2, Download, Eye, Pencil, ShieldCheck } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Segmented, type SegmentedOption } from '@/components/ui/Segmented';
import { MarkdownToolbar, type MarkdownAction } from '@/components/tool/MarkdownToolbar';
import { ClearButton, CopyButton, DownloadButton, SampleButton } from '@/components/tool/ToolActions';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useToast } from '@/components/ui/Toast';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useHotkey } from '@/hooks/useHotkey';
import { useAppStore } from '@/store/appStore';
import { useI18n } from '@/i18n/I18nProvider';
import { renderMarkdown, renderMarkdownDocument } from '@/lib/markdown';
import { countLines, countTextStats, offsetToLineColumn } from '@/lib/text';
import { copyText } from '@/lib/clipboard';
import { downloadText } from '@/lib/download';
import { SAMPLE_MARKDOWN } from '@/data/samples';
import { cn } from '@/lib/cn';

type Mode = 'edit' | 'split' | 'preview';

const MAX_DRAFT_LENGTH = 500_000;

const CODE_BLOCK = '```js\nconsole.log("Hello world");\n```';
const TABLE_BLOCK = `| 列 1 | 列 2 | 列 3 |
| --- | --- | --- |
| 内容 | 内容 | 内容 |`;

export default function MarkdownTool() {
  const { t, locale } = useI18n();
  const draftEnabled = useAppStore((state) => state.draftEnabled);
  const savedDraft = useAppStore((state) => state.markdownDraft);
  const setMarkdownDraft = useAppStore((state) => state.setMarkdownDraft);
  const clearMarkdownDraft = useAppStore((state) => state.clearMarkdownDraft);
  const toast = useToast();

  const [content, setContent] = useState(draftEnabled ? savedDraft : '');
  const [mode, setMode] = useState<Mode>('split');
  const [syncScroll, setSyncScroll] = useState(true);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showRestored, setShowRestored] = useState(draftEnabled && savedDraft.length > 0);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const isMobile = useMediaQuery('(max-width: 1023px)');
  const debouncedContent = useDebouncedValue(content, 200);
  const html = useMemo(() => renderMarkdown(debouncedContent), [debouncedContent]);
  const stats = useMemo(() => countTextStats(content), [content]);
  const lineCount = useMemo(() => Math.max(1, countLines(content)), [content]);
  const lineNumbers = useMemo(
    () => Array.from({ length: Math.min(lineCount, 10_000) }, (_, index) => index + 1),
    [lineCount],
  );

  const isTooLarge = content.length > MAX_DRAFT_LENGTH;

  useEffect(() => {
    if (!draftEnabled || isTooLarge) {
      setIsSaving(false);
      return;
    }

    setIsSaving(true);
    const timer = window.setTimeout(() => {
      setMarkdownDraft(content);
      setSavedAt(new Date());
      setIsSaving(false);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [content, draftEnabled, isTooLarge, setMarkdownDraft]);

  const view: 'edit' | 'split' | 'preview' = isMobile
    ? mode === 'preview'
      ? 'preview'
      : 'edit'
    : mode;

  const modeOptions: Array<SegmentedOption<Mode>> = isMobile
    ? [
        { value: 'edit', label: t({ zh: '编辑', en: 'Edit' }), icon: <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> },
        { value: 'preview', label: t({ zh: '预览', en: 'Preview' }), icon: <Eye className="h-3.5 w-3.5" aria-hidden="true" /> },
      ]
    : [
        { value: 'edit', label: t({ zh: '编辑', en: 'Edit' }), icon: <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> },
        { value: 'split', label: t({ zh: '分栏', en: 'Split' }), icon: <Columns2 className="h-3.5 w-3.5" aria-hidden="true" /> },
        { value: 'preview', label: t({ zh: '预览', en: 'Preview' }), icon: <Eye className="h-3.5 w-3.5" aria-hidden="true" /> },
      ];

  const segmentedValue: Mode = isMobile ? (mode === 'preview' ? 'preview' : 'edit') : mode;

  const updateCursor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    setCursor(offsetToLineColumn(editor.value, editor.selectionStart));
  };

  const wrapSelection = (before: string, after: string, placeholder: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    const next = `${content.slice(0, start)}${before}${selected}${after}${content.slice(end)}`;
    setContent(next);

    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start + before.length, start + before.length + selected.length);
      updateCursor();
    });
  };

  const prefixLines = (prefix: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const blockStart = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    let blockEnd = end;
    if (end === start) {
      const nextNewline = content.indexOf('\n', start);
      blockEnd = nextNewline === -1 ? content.length : nextNewline;
    }

    const block = content.slice(blockStart, blockEnd);
    const prefixed = block
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');
    const next = `${content.slice(0, blockStart)}${prefixed}${content.slice(blockEnd)}`;
    setContent(next);

    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(blockStart + prefixed.length, blockStart + prefixed.length);
      updateCursor();
    });
  };

  const insertBlock = (block: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const before = content.slice(0, start);
    const after = content.slice(end);

    const leading = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const trailing = after.length === 0 || after.startsWith('\n') ? '\n' : '\n\n';
    const inserted = `${leading}${block}${trailing}`;
    const next = `${before}${inserted}${after}`;
    setContent(next);

    window.requestAnimationFrame(() => {
      editor.focus();
      const position = start + inserted.length;
      editor.setSelectionRange(position, position);
      updateCursor();
    });
  };

  const applyAction = (action: MarkdownAction) => {
    switch (action) {
      case 'h1':
        prefixLines('# ');
        break;
      case 'h2':
        prefixLines('## ');
        break;
      case 'h3':
        prefixLines('### ');
        break;
      case 'bold':
        wrapSelection('**', '**', t({ zh: '加粗文本', en: 'bold text' }));
        break;
      case 'italic':
        wrapSelection('*', '*', t({ zh: '斜体文本', en: 'italic text' }));
        break;
      case 'strike':
        wrapSelection('~~', '~~', t({ zh: '删除线', en: 'strikethrough' }));
        break;
      case 'link':
        wrapSelection('[', '](https://example.com)', t({ zh: '链接文本', en: 'link text' }));
        break;
      case 'image':
        wrapSelection('![', '](https://example.com/image.png)', t({ zh: '图片描述', en: 'image description' }));
        break;
      case 'code':
        insertBlock(CODE_BLOCK);
        break;
      case 'table':
        insertBlock(TABLE_BLOCK);
        break;
      case 'list':
        prefixLines('- ');
        break;
      case 'quote':
        prefixLines('> ');
        break;
      case 'hr':
        insertBlock('---');
        break;
      default:
        break;
    }
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const modifier = event.metaKey || event.ctrlKey;
    if (event.key === 'Tab') {
      event.preventDefault();
      wrapSelection('  ', '', '');
      return;
    }
    if (modifier && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      applyAction('bold');
      return;
    }
    if (modifier && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      applyAction('italic');
    }
  };

  const handleEditorScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    const editor = event.currentTarget;
    if (gutterRef.current) gutterRef.current.scrollTop = editor.scrollTop;

    if (!syncScroll || view !== 'split' || !previewRef.current) return;
    const editorRange = editor.scrollHeight - editor.clientHeight;
    if (editorRange <= 0) return;
    const ratio = editor.scrollTop / editorRange;
    const preview = previewRef.current;
    preview.scrollTop = ratio * Math.max(0, preview.scrollHeight - preview.clientHeight);
  };

  const saveMarkdown = () => {
    downloadText('document.md', content, 'text/markdown;charset=utf-8');
    toast.success(t({ zh: '已开始下载 .md', en: 'Download of .md started' }));
  };

  useHotkey({ key: 's', metaOrCtrl: true }, (event) => {
    event.preventDefault();
    saveMarkdown();
  });

  const copyHtml = async () => {
    const ok = await copyText(renderMarkdown(content));
    toast[ok ? 'success' : 'error'](
      ok ? t({ zh: '已复制渲染后的 HTML', en: 'Rendered HTML copied' }) : t({ zh: '复制失败，请重试', en: 'Copy failed. Try again.' }),
    );
  };

  const downloadHtml = () => {
    downloadText('document.html', renderMarkdownDocument(content), 'text/html;charset=utf-8');
    toast.success(t({ zh: '已开始下载 .html', en: 'Download of .html started' }));
  };

  const saveStatus = !draftEnabled
    ? t({ zh: '自动保存已关闭', en: 'Autosave is off' })
    : isTooLarge
      ? t({ zh: '内容超过 500KB，已暂停自动保存', en: 'Content exceeds 500KB; autosave paused' })
      : isSaving
        ? t({ zh: '保存中…', en: 'Saving…' })
        : savedAt
          ? t({
              zh: `已自动保存 ${savedAt.toLocaleTimeString('zh-CN', { hour12: false })}`,
              en: `Autosaved ${savedAt.toLocaleTimeString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false })}`,
            })
          : t({ zh: '尚未保存', en: 'Not saved yet' });

  return (
    <div className="space-y-3">
      {showRestored ? (
        <ToolAlert
          tone="info"
          title={{ zh: '已恢复上次编辑的 Markdown 内容', en: 'Your last Markdown draft was restored' }}
          hint={{ zh: '内容会自动保存在本机浏览器，清空后会同步删除草稿。', en: 'Content is autosaved in this browser; clearing it also deletes the draft.' }}
        >
          <button
            type="button"
            onClick={() => setShowRestored(false)}
            className="mt-1.5 text-xs font-medium underline underline-offset-2"
          >
            {t({ zh: '知道了', en: 'Got it' })}
          </button>
        </ToolAlert>
      ) : null}

      <div className="card-surface space-y-2 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={segmentedValue}
            options={modeOptions}
            onChange={(value) => setMode(value)}
            ariaLabel={t({ zh: 'Markdown 编辑模式', en: 'Markdown editing mode' })}
          />

          <span className="mx-0.5 hidden h-5 w-px bg-line sm:block" />

          <MarkdownToolbar onAction={applyAction} />

          {view === 'split' ? (
            <div className="ml-auto">
              <Checkbox checked={syncScroll} onChange={setSyncScroll} label={t({ zh: '同步滚动', en: 'Sync scroll' })} className="text-xs" />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
          <CopyButton text={content} label={{ zh: '复制 Markdown', en: 'Copy Markdown' }} />
          <Button variant="secondary" size="sm" onClick={() => void copyHtml()}>
            {t({ zh: '复制 HTML', en: 'Copy HTML' })}
          </Button>
          <DownloadButton filename="document.md" content={content} mime="text/markdown;charset=utf-8" label={{ zh: '下载 .md', en: 'Download .md' }} />
          <Button variant="secondary" size="sm" onClick={downloadHtml}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {t({ zh: '下载 .html', en: 'Download .html' })}
          </Button>
          <div className="ml-auto flex items-center gap-1.5">
            <SampleButton onClick={() => setContent(SAMPLE_MARKDOWN)} />
            <ClearButton
              onClick={() => {
                setContent('');
                clearMarkdownDraft();
                setSavedAt(null);
                setShowRestored(false);
                toast.success(t({ zh: '已清空 Markdown 内容', en: 'Markdown cleared' }));
              }}
            />
          </div>
        </div>
      </div>

      <div className={cn('grid gap-4', view === 'split' && 'lg:grid-cols-2')}>
        {view !== 'preview' ? (
          <Panel
            title={t({ zh: 'Markdown 源码', en: 'Markdown source' })}
            subtitle={t({ zh: `${stats.lines} 行 · ${stats.chars} 字符`, en: `${stats.lines} lines · ${stats.chars} characters` })}
            className="h-[min(68vh,680px)] min-h-[420px]"
            bodyClassName="p-0"
            actions={
              <span className="font-mono text-[10px] text-ink-3">
                {t({ zh: `光标 ${cursor.line}:${cursor.column}`, en: `Ln ${cursor.line}, Col ${cursor.column}` })}
              </span>
            }
          >
            <div className="flex h-full min-h-0">
              <div
                ref={gutterRef}
                aria-hidden="true"
                className="w-11 shrink-0 select-none overflow-hidden border-r border-line bg-surface-2/40 py-4 text-right font-mono text-[12px] leading-6 text-ink-3"
              >
                {lineNumbers.map((line) => (
                  <div key={line} className="pr-2">
                    {line}
                  </div>
                ))}
              </div>
              <textarea
                ref={editorRef}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  updateCursor();
                }}
                onKeyDown={handleEditorKeyDown}
                onKeyUp={updateCursor}
                onClick={updateCursor}
                onSelect={updateCursor}
                onScroll={handleEditorScroll}
                spellCheck={false}
                placeholder={t({ zh: '# 从这里开始编写 Markdown…', en: '# Start writing Markdown here…' })}
                aria-label={t({ zh: 'Markdown 源码', en: 'Markdown source' })}
                className="code-scroll h-full min-h-0 w-full flex-1 resize-none border-0 bg-transparent p-4 pl-3 font-mono text-[13px] leading-6 text-ink outline-none placeholder:text-ink-3"
              />
            </div>
          </Panel>
        ) : null}

        {view !== 'edit' ? (
          <Panel
            title={t({ zh: '实时预览', en: 'Live preview' })}
            subtitle={view === 'split' ? t({ zh: '输入后自动刷新', en: 'Refreshes as you type' }) : t({ zh: '最终渲染效果', en: 'Final rendered output' })}
            className="h-[min(68vh,680px)] min-h-[420px]"
            bodyClassName="p-0"
            actions={<Badge tone="success">{t({ zh: '已过滤脚本', en: 'Scripts sanitized' })}</Badge>}
          >
            {html ? (
              <div
                ref={previewRef}
                className="md-body code-scroll h-full overflow-y-auto p-5 sm:p-6"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-3">
                {t({ zh: '输入 Markdown 后，这里会实时渲染预览', en: 'Rendered preview of your Markdown appears here' })}
              </div>
            )}
          </Panel>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-surface px-3.5 py-2 text-[11px] text-ink-3">
        <span>{t({ zh: '字数', en: 'Characters' })} <span className="font-medium text-ink-2">{stats.chars}</span></span>
        <span>{t({ zh: '行数', en: 'Lines' })} <span className="font-medium text-ink-2">{stats.lines}</span></span>
        <span>{t({ zh: '单词', en: 'Words' })} <span className="font-medium text-ink-2">{stats.words}</span></span>
        <span>{t({ zh: '光标', en: 'Cursor' })} <span className="font-medium text-ink-2">{cursor.line}:{cursor.column}</span></span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              !draftEnabled
                ? 'bg-ink-3'
                : isTooLarge
                  ? 'bg-warn'
                  : isSaving
                    ? 'bg-accent'
                    : 'bg-ok',
            )}
          />
          {saveStatus}
        </span>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-[11px] leading-5 text-ink-3">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden="true" />
        {t({
          zh: '预览内容已通过 DOMPurify 安全过滤，不会执行脚本、iframe 或事件属性。自动保存仅写入本机 localStorage。',
          en: 'Preview is sanitized with DOMPurify; scripts, iframes, and event attributes are never executed. Autosave only writes to your local localStorage.',
        })}
      </div>
    </div>
  );
}
