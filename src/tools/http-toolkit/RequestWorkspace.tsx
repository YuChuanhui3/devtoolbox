import { useCallback, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { useI18n } from '@/i18n/I18nProvider';
import { RequestPanel } from './RequestPanel';

/** Each mounted document owns its editor, response and in-flight request. */
export function RequestWorkspace({ active }: { active: boolean }) {
  const { t } = useI18n();
  const [labels, setLabels] = useState<Record<number, { name: string; method: string }>>({});
  const updateLabel = useCallback((id: number, name: string, method: string) => {
    setLabels((current) => current[id]?.name === name && current[id]?.method === method ? current : { ...current, [id]: { name, method } });
  }, []);
  const [tabs, setTabs] = useState([1]);
  const [selected, setSelected] = useState(1);
  const [nextId, setNextId] = useState(2);
  const add = () => {
    setTabs((current) => [...current, nextId]);
    setSelected(nextId);
    setNextId(nextId + 1);
  };
  const close = (id: number) => {
    const remaining = tabs.filter((tab) => tab !== id);
    if (!remaining.length) return;
    setTabs(remaining);
    if (selected === id) setSelected(remaining[Math.max(0, tabs.indexOf(id) - 1)]);
  };
  return <div className="wb-documents-shell">
    <div className="wb-open-documents" aria-label={t({ zh: '已打开的请求', en: 'Open requests' })}>
      {tabs.map((id) => <div key={id} className={selected === id ? 'wb-document-selected' : ''}>
        <button type="button" aria-pressed={selected === id} onClick={() => setSelected(id)}>{labels[id] ? <><span className="wb-tab-method">{labels[id].method}</span>{labels[id].name}</> : <>{t({ zh: '请求', en: 'Request' })} {id}</>}</button>
        {tabs.length > 1 ? <button type="button" onClick={() => close(id)} aria-label={t({ zh: `关闭请求 ${id}`, en: `Close request ${id}` })}><X size={12} /></button> : null}
      </div>)}
      <button type="button" className="wb-icon" onClick={add} aria-label={t({ zh: '打开新请求标签', en: 'Open new request tab' })}><Plus size={14} /></button>
    </div>
    {tabs.map((id) => <div key={id} hidden={selected !== id}><LazyPanel active={selected === id}><RequestPanel documentId={id} onDocumentChange={updateLabel} active={active && selected === id} onNewTab={add} /></LazyPanel></div>)}
  </div>;
}
