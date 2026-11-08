import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useI18n } from '@/i18n/I18nProvider';
import { useWorkbench } from './WorkbenchContext';
import { newCollection, putRequest, walkFolders } from '@/lib/apiworkbench/tree';
import { newId } from '@/lib/apiworkbench/id';
import type { WbRequest } from '@/lib/apiworkbench/types';

/**
 * 「另存为到集合」目标选择：选集合（没有就新建）→ 选该集合里的文件夹
 * （根或任意子层）→ 放一份换 id 的副本。选中目标后由 onSaved 收尾。
 */
export function SaveAsPickerModal({ open, onClose, request, onSaved }: {
  open: boolean;
  onClose: () => void;
  request: WbRequest;
  onSaved: (next: WbRequest) => void;
}) {
  const { t } = useI18n();
  const { doc, update } = useWorkbench();
  const [collectionId, setCollectionId] = useState<string | null>(doc.collections[0]?.id ?? null);
  const [folderId, setFolderId] = useState<string | null>(null);

  // 每次打开重置到第一个集合与根文件夹；集合切换后文件夹重置为根。
  useEffect(() => {
    if (!open) return;
    const first = doc.collections[0]?.id ?? null;
    setCollectionId(first);
    setFolderId(null);
  }, [open, doc.collections]);

  const collection = doc.collections.find((c) => c.id === collectionId) ?? null;
  const folders = collection ? walkFolders(collection.root) : [];
  const targetFolderId = folderId ?? collection?.root.id ?? null;

  const createCollection = () => {
    const created = newCollection(t({ zh: '我的集合', en: 'My collection' }));
    update((d) => ({ ...d, collections: [...d.collections, created] }));
    setCollectionId(created.id);
    setFolderId(null);
  };

  const confirm = () => {
    if (!collection || !targetFolderId) return;
    const copy = { ...request, id: newId() };
    update((d) => ({
      ...d,
      collections: d.collections.map((c) => (c.id === collection.id ? putRequest(c, copy, targetFolderId) : c)),
    }));
    onSaved(copy);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t({ zh: '另存为到集合', en: 'Save as to collection' })}
      description={t({ zh: '选一个集合与文件夹，放一份换 id 的副本；原请求不动。', en: 'Pick a collection and folder for a copy with a new id; the original stays put.' })}
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-3">{t({ zh: '目标集合', en: 'Target collection' })}</span>
          <Select
            value={collectionId ?? ''}
            onChange={(e) => { setCollectionId(e.target.value); setFolderId(null); }}
            aria-label={t({ zh: '目标集合', en: 'Target collection' })}
          >
            {doc.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new__">{t({ zh: '＋ 新建集合', en: '＋ New collection' })}</option>
          </Select>
        </label>
        {collectionId === '__new__' ? (
          <Button variant="secondary" size="sm" onClick={createCollection}>{t({ zh: '创建并选中', en: 'Create and select' })}</Button>
        ) : null}

        {collection ? (
          <label className="block">
            <span className="mb-1 block text-xs text-ink-3">{t({ zh: '目标文件夹', en: 'Target folder' })}</span>
            <Select
              value={targetFolderId ?? ''}
              onChange={(e) => setFolderId(e.target.value)}
              aria-label={t({ zh: '目标文件夹', en: 'Target folder' })}
            >
              {folders.map(({ folder, depth }) => (
                <option key={folder.id} value={folder.id}>
                  {`${'　'.repeat(depth)}${depth > 0 ? '└ ' : ''}${folder.name === collection.root.name ? t({ zh: '（根）', en: '(root)' }) : folder.name}`}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        <p className="text-xs text-ink-3">
          {t({
            zh: `副本名「${request.name}」，与原请求同名但 id 不同。`,
            en: `The copy keeps the name "${request.name}" but gets a new id.`,
          })}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>{t({ zh: '取消', en: 'Cancel' })}</Button>
          <Button variant="primary" size="sm" onClick={confirm} disabled={!collection || !targetFolderId}>
            {t({ zh: '另存为', en: 'Save as' })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
