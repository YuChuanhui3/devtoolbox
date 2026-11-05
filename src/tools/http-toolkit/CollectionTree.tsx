import { useRef, useState, type RefObject } from 'react';
import { ChevronDown, ChevronRight, Download, FilePlus2, FileUp, FolderOpen, PackageOpen, FolderPlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { useI18n } from '@/i18n/I18nProvider';
import { newId } from '@/lib/apiworkbench/id';
import { filterFolder, removeFolder, updateFolder } from '@/lib/apiworkbench/tree';
import type { L10n } from '@/i18n/locale';
import type { WbCollection, WbFolder, WbRequest, WorkbenchDoc } from '@/lib/apiworkbench/types';
import { CollectionExportModal } from './CollectionExportModal';

interface TreeProps {
  doc: WorkbenchDoc;
  update: (fn: (doc: WorkbenchDoc) => WorkbenchDoc) => void;
  selectedRequestId: string | null;
  onSelectRequest: (collectionId: string, request: WbRequest) => void;
  onNewRequest: (collectionId: string, folderId: string) => void;
  onImport?: () => void;
  /** 侧栏搜索框，快捷键 Cmd/Ctrl+K 聚焦的是同一个节点。 */
  searchRef?: RefObject<HTMLInputElement | null>;
}

interface FolderProps extends TreeProps {
  collection: WbCollection;
  folder: WbFolder;
  depth: number;
}

/** 缩进量只由 --depth 决定，单位统一在 index.css 的 --tree-indent。 */
const indent = (depth: number) => ({ paddingLeft: `calc(${depth} * var(--tree-indent))` });

function InlineRename({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onDone(value.trim() || null);
          if (e.key === 'Escape') onDone(null);
        }}
        onBlur={() => onDone(value.trim() || null)}
        size="sm"
        className="min-w-0 flex-1"
      />
      <Button size="sm" variant="primary" onClick={() => onDone(value.trim() || null)}>OK</Button>
    </span>
  );
}

function RowMenu({ onRename, onDelete, label, hideDelete }: { onRename: () => void; onDelete: () => void; label: L10n; hideDelete?: boolean }) {
  const { t } = useI18n();
  return (
    <span className="ml-auto flex shrink-0 items-center focus-within:opacity-100 opacity-70 transition-opacity group-hover:opacity-100">
      <Button variant="ghost" size="sm" onClick={onRename} aria-label={t({ zh: `重命名${label.zh}`, en: `Rename ${label.en}` })}>
        <Pencil className="h-3 w-3" aria-hidden="true" />
      </Button>
      {hideDelete ? null : (
        <ConfirmButton
          size="sm"
          confirmLabel={{ zh: '再次点击删除', en: 'Click again to delete' }}
          onConfirm={onDelete}
          aria-label={t({ zh: `删除${label.zh}`, en: `Delete ${label.en}` })}
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </ConfirmButton>
      )}
    </span>
  );
}

function FolderNode(props: FolderProps) {
  const { collection, folder, depth, selectedRequestId, onSelectRequest, onNewRequest } = props;
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);

  const renameNode = (name: string | null) => {
    setRenaming(false);
    if (name && name !== folder.name) {
      props.update((d) => ({
        ...d,
        collections: d.collections.map((c) =>
          c.id === collection.id ? updateFolder(c, folder.id, (f) => ({ ...f, name })) : c,
        ),
      }));
    }
  };

  const deleteNode = () => {
    props.update((d) => ({
      ...d,
      collections: d.collections.map((c) => (c.id === collection.id ? removeFolder(c, folder.id) : c)),
    }));
  };

  return (
    <div>
      <div className="group flex items-center gap-1 rounded-lg py-1 pr-1 text-xs hover:bg-surface-2" style={indent(depth)}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-ink-3 hover:text-ink"
          aria-label={t({ zh: '展开/折叠文件夹', en: 'Toggle folder' })}
        >
          {folder.folders.length > 0 || folder.requests.length > 0
            ? open
              ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            : <span className="inline-block w-3.5" />}
        </button>
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
        {renaming ? (
          <InlineRename initial={folder.name} onDone={renameNode} />
        ) : (
          <span className="min-w-0 truncate font-medium text-ink-2">{folder.name}</span>
        )}
        <span className="ml-1 flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNewRequest(collection.id, folder.id)}
            aria-label={t({ zh: '在此新建请求', en: 'New request here' })}
          >
            <FilePlus2 className="h-3 w-3" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              props.update((d) => ({
                ...d,
                collections: d.collections.map((c) =>
                  c.id === collection.id
                    ? updateFolder(c, folder.id, (f) => ({
                        ...f,
                        folders: [
                          ...f.folders,
                          { id: newId(), name: t({ zh: '新文件夹', en: 'New folder' }), folders: [], requests: [] },
                        ],
                      }))
                    : c,
                ),
              }))
            }
            aria-label={t({ zh: '在此新建文件夹', en: 'New folder here' })}
          >
            <FolderPlus className="h-3 w-3" aria-hidden="true" />
          </Button>
          {!renaming ? (
            <RowMenu
              label={{ zh: '文件夹', en: 'folder' }}
              onRename={() => setRenaming(true)}
              onDelete={deleteNode}
              hideDelete={folder.id === collection.root.id}
            />
          ) : null}
        </span>
      </div>
      {open ? (
        <div>
          {folder.requests.map((request) => (
            <button
              key={request.id}
              type="button"
              onClick={() => onSelectRequest(collection.id, request)}
              className={`group flex w-full items-center gap-2 rounded-lg py-1 pr-1 text-left text-xs hover:bg-surface-2 ${
                selectedRequestId === request.id ? 'bg-accent-soft text-accent-strong' : 'text-ink-2'
              }`}
              style={indent(depth + 1)}
            >
              <Badge tone={METHOD_TONE[request.method] ?? 'neutral'} className="w-14 shrink-0 justify-center px-1 py-0 text-[10px] leading-4">
                {request.method}
              </Badge>
              <span className="min-w-0 truncate">{request.name}</span>
            </button>
          ))}
          {folder.folders.map((child) => (
            <FolderNode key={child.id} {...props} folder={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const METHOD_TONE: Record<string, 'success' | 'accent' | 'warning' | 'danger' | 'neutral'> = {
  GET: 'success',
  POST: 'accent',
  PUT: 'warning',
  PATCH: 'warning',
  DELETE: 'danger',
  HEAD: 'neutral',
  OPTIONS: 'neutral',
};

export function CollectionTree(props: TreeProps) {
  const { t } = useI18n();
  const { doc, update } = props;
  const fallbackRef = useRef<HTMLInputElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState<WbCollection | null>(null);

  const addCollection = () => {
    const name = t({ zh: '新集合', en: 'New collection' });
    update((d) => ({
      ...d,
      collections: [
        ...d.collections,
        { id: newId(), name, root: { id: newId(), name, folders: [], requests: [] }, variables: [] },
      ],
    }));
  };

  const shown = doc.collections.flatMap((collection) => {
    const root = filterFolder(collection.root, query);
    return root ? [{ collection, root }] : [];
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink">{t({ zh: '集合', en: 'Collections' })}</span>
        <span className="flex items-center gap-1">
          {props.onImport ? (
            <Button variant="ghost" size="sm" onClick={props.onImport} aria-label={t({ zh: '导入集合（Postman / Hoppscotch / HAR）', en: 'Import collections (Postman / Hoppscotch / HAR)' })}>
              <FileUp className="h-3 w-3" aria-hidden="true" />
              {t({ zh: '导入', en: 'Import' })}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={addCollection} aria-label={t({ zh: '新建集合', en: 'New collection' })}>
            <Plus className="h-3 w-3" aria-hidden="true" />
            {t({ zh: '集合', en: 'Add' })}
          </Button>
        </span>
      </div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <Input
          ref={props.searchRef ?? fallbackRef}
          size="sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t({ zh: '搜名称或 URL', en: 'Search name or URL' })}
          mono
          className="pl-8 pr-8"
          aria-label={t({ zh: '搜索集合内请求', en: 'Search requests' })}
        />
        {query ? (
          <IconButton
            label={t({ zh: '清空搜索', en: 'Clear search' })}
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={() => setQuery('')}
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto">
        {doc.collections.length === 0 ? (
          <div className="wb-collections-empty">
            <PackageOpen size={64} strokeWidth={.6} aria-hidden="true" />
            <span>{t({ zh: '集合为空', en: 'Collections are empty' })}</span>
            <p>{t({ zh: '导入或创建一个集合', en: 'Import or create a collection' })}</p>
            {props.onImport ? <Button variant="primary" size="sm" onClick={props.onImport} aria-label={t({ zh: '从空集合导入', en: 'Import into empty collections' })}><FileUp size={14} />{t({ zh: '导入', en: 'Import' })}</Button> : null}
            <Button variant="secondary" size="sm" onClick={addCollection}><Plus size={14} />{t({ zh: '新建', en: 'Add new' })}</Button>
          </div>
        ) : null}
        {doc.collections.length > 0 && shown.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong px-2.5 py-3 text-[11px] leading-5 text-ink-3">
            {t({ zh: `没有匹配「${query}」的请求。`, en: `Nothing matches "${query}".` })}
          </p>
        ) : null}
        {shown.map(({ collection, root }) => (
          <div key={collection.id} className="group rounded-xl border border-line bg-surface-2/40 p-1.5">
            <div className="flex items-center gap-1 px-1">
              {renamingId === collection.id ? (
                <InlineRename
                  initial={collection.name}
                  onDone={(name) => {
                    setRenamingId(null);
                    if (name) {
                      update((d) => ({
                        ...d,
                        collections: d.collections.map((c) => (c.id === collection.id ? { ...c, name } : c)),
                      }));
                    }
                  }}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{collection.name}</span>
              )}
              {renamingId !== collection.id ? (
                <span className="flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => props.onNewRequest(collection.id, collection.root.id)}
                    aria-label={t({ zh: '集合内新建请求', en: 'New request in collection' })}
                  >
                    <FilePlus2 className="h-3 w-3" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t({ zh: '导出集合', en: 'Export collection' })}
                    onClick={() => setExporting(collection)}
                  >
                    <Download className="h-3 w-3" aria-hidden="true" />
                  </Button>
                  <RowMenu
                    label={{ zh: '集合', en: 'collection' }}
                    onRename={() => setRenamingId(collection.id)}
                    onDelete={() =>
                      update((d) => ({ ...d, collections: d.collections.filter((c) => c.id !== collection.id) }))
                    }
                  />
                </span>
              ) : null}
            </div>
            <FolderNode {...props} collection={collection} folder={root} depth={0} />
          </div>
        ))}
      </div>
      <CollectionExportModal open={exporting !== null} collection={exporting} onClose={() => setExporting(null)} />
    </div>
  );
}
