import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Maximize2 } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { localizeWorkspace } from '../native-workspaces/localize.js';
import { getScope, loadCloudSdk } from '../native-workspaces/runtime.js';

export default function NativeWorkspace({ name }: { name: 'whiteboard' | 'pdf' }) {
  const { locale, setLocale } = useI18n();
  const mount=useRef<HTMLDivElement>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const scope=getScope(name);
    scope.host.dataset.locale = locale;
    mount.current!.append(scope.host);
    let current=true;
    scope.started ||= (async()=>{
      void loadCloudSdk();
      const module=name==='whiteboard' ? await import('../native-workspaces/whiteboard/main.js') : await import('../native-workspaces/pdf/main.js');
      await module.mountWorkspace();
    })();
    scope.started.then(()=>{if(current)setLoading(false);}).catch((e: unknown)=>{if(current){setError(e instanceof Error?e.message:String(e));setLoading(false);}});
    // React StrictMode and route changes reattach the same editor and document.
    return ()=>{current=false;scope.host.remove();};
  },[name]);
  useEffect(()=>{
    const host=getScope(name).host;
    const stop=localizeWorkspace(host,locale);
    const changed=(event: Event)=>{const value=(event as CustomEvent).detail;if(value==='zh'||value==='en')setLocale(value);};
    host.addEventListener('native-language-change',changed);
    const select=host.querySelector<HTMLSelectElement>('#language');
    if(select&&select.value!==locale){select.value=locale;select.dispatchEvent(new Event('change',{bubbles:true}));}
    return ()=>{stop();host.removeEventListener('native-language-change',changed);};
  },[name,locale,setLocale,loading]);
  return <div className="fixed inset-0 z-[100] flex flex-col bg-surface text-ink">
    <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 text-xs">
      <Link to="/tools" className="inline-flex items-center gap-2 hover:text-accent"><ArrowLeft size={14}/>{locale==='zh'?'返回工具箱':'Back to tools'}</Link>
      <span>{locale==='zh'?(name==='whiteboard'?'白板工作区':'PDF 工作区'):(name==='whiteboard'?'Whiteboard':'PDF workspace')}</span><label className="flex items-center gap-1"><span className="sr-only">界面语言 / Language</span><select aria-label="界面语言 / Language" value={locale} onChange={e=>setLocale(e.target.value as 'zh'|'en')} className="bg-surface text-ink"><option value="zh">中文</option><option value="en">English</option></select></label>
      <button type="button" aria-label={locale==='zh'?'全屏工作区':'Fullscreen workspace'} onClick={()=>void mount.current?.parentElement?.requestFullscreen()}><Maximize2 size={15}/></button>
    </header>
    <div ref={mount} className="relative min-h-0 flex-1"/>
    {loading&&<div role="status" className="absolute inset-x-0 top-16 text-center text-sm text-ink-3">正在加载完整工作区…</div>}
    {error&&<div role="alert" className="absolute inset-x-4 top-16 rounded border border-danger bg-surface p-4 text-danger">工作区加载失败：{error}<button className="ml-4 underline" onClick={()=>location.reload()}>重新加载</button></div>}
  </div>;
}
