import { useState } from 'react';
import { ChevronDown, ChevronRight, FilePlus2, FolderPlus, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { Input } from '@/components/ui/Input';
import { useI18n } from '@/i18n/I18nProvider';
import { newId } from '@/lib/apiworkbench/id';
import { removeFolder, updateFolder } from '@/lib/apiworkbench/tree';
import type { L10n } from '@/i18n/locale';
import type { WbCollection, WbFolder, WbRequest, WorkbenchDoc } from '@/lib/apiworkbench/types';

interface TreeProps {
  doc: WorkbenchDoc;
  update: (fn: (doc: WorkbenchDoc) => WorkbenchDoc) => void;
  selectedRequestId: string | null;
  onSelectRequest: (collectionId: string, request: WbRequest) => void;
  onNewRequest: (collectionId: string, folderId: string) => void;
}

interface FolderProps extends TreeProps {
  collection: WbCollection;
  folder: WbFolder;
  depth: number;
}

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
        className="h-6 min-w-0 flex-1 text-xs"
      />
      <Button size="sm" variant="primary" onClick={() => onDone(value.trim() || null)}>OK</Button>
    </span>
  );
}

function RowMenu({ onRename, onDelete, label, hideDelete }: { onRename: () => void; onDelete: () => void; label: L10n; hideDelete?: boolean }) {
  const { t } = useI18n();
  return (
    <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
      <div className="group flex items-center gap-1 rounded-lg py-1 pr-1 text-xs hover:bg-surface-2" style={{ paddingLeft: depth * 12 }}>
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
        <span className="ml-1 flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
              style={{ paddingLeft: (depth + 1) * 12 + 14 }}
            >
              <span className={`w-12 shrink-0 font-mono text-[10px] ${METHOD_TONE[request.method] ?? 'text-ink-3'}`}>
                {request.method}
              </span>
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

const METHOD_TONE: Record<string, string> = {
  GET: 'text-ok',
  POST: 'text-accent',
  PUT: 'text-warn',
  DELETE: 'text-danger',
  PATCH: 'text-warn',
  HEAD: 'text-ink-3',
  OPTIONS: 'text-ink-3',
};

export function CollectionTree(props: TreeProps) {
  const { t } = useI18n();
  const { doc, update } = props;
  const [renamingId, setRenamingId] = useState<string | null>(null);

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink">{t({ zh: '集合', en: 'Collections' })}</span>
        <Button variant="ghost" size="sm" onClick={addCollection} aria-label={t({ zh: '新建集合', en: 'New collection' })}>
          <Plus className="h-3 w-3" aria-hidden="true" />
          {t({ zh: '集合', en: 'Add' })}
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto">
        {doc.collections.length === 0 ? (
          <p className="px-1 text-[11px] leading-5 text-ink-3">
            {t({
              zh: '还没有集合。新建集合后可把请求存进去，也可以从 OpenAPI 页签一键生成。',
              en: 'No collections yet. Create one to save requests, or generate them from the OpenAPI tab.',
            })}
          </p>
        ) : null}
        {doc.collections.map((collection) => (
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
                <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => props.onNewRequest(collection.id, collection.root.id)}
                    aria-label={t({ zh: '集合内新建请求', en: 'New request in collection' })}
                  >
                    <FilePlus2 className="h-3 w-3" aria-hidden="true" />
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
            <FolderNode {...props} collection={collection} folder={collection.root} depth={0} />
          </div>
        ))}
      </div>
    </div>
  );
}
