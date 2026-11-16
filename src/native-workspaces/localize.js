import { translateChinese } from './locales/zh.js';
const textSources = new WeakMap();
const attributeSources = new WeakMap();
const excluded = '[data-user-content],textarea,input,[contenteditable],script,style,canvas,.textLayer,.page-text,.page-text-input,.text-draft-background,.board-info h3,#board-outline,.comment-body,.comment-text,.note-content,.document-name,.file-open,.account-label';
/** Translate UI nodes in place without replacing elements or their event handlers. */
export function localizeWorkspace(host, locale) {
  host.lang = locale === 'zh' ? 'zh-CN' : 'en';
  host.dataset.locale = locale;
  const translate = value => locale === 'zh' ? translateChinese(value) : value;
  const watched = new WeakSet();
  const options={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder']};
  const run = () => {
    const roots=[host];
    for(const root of roots)for(const element of root.querySelectorAll('puter-user-menu'))if(element.shadowRoot)roots.push(element.shadowRoot);
    for(const root of roots){
    if(!watched.has(root)){observer.observe(root,options);watched.add(root);}
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {
      const node = walker.currentNode;
      if(node.parentElement?.closest(excluded)) continue;
      const old = textSources.get(node);
      const source = old?.rendered === node.textContent ? old.source : node.textContent;
      if(node.parentElement?.tagName==='OPTION'&&!node.parentElement.hasAttribute('value'))node.parentElement.setAttribute('value',source);
      const rendered = translate(source);
      if(rendered !== node.textContent) node.textContent = rendered;
      textSources.set(node,{source,rendered});
    }
    for(const element of root.querySelectorAll('[aria-label],[title],[placeholder]')) {
      if(element.closest('[data-user-content],.textLayer,.page-text,[contenteditable]')) continue;
      let sources=attributeSources.get(element);if(!sources)attributeSources.set(element,sources={});
      for(const key of ['aria-label','title','placeholder']) {
        const current=element.getAttribute(key);if(current===null)continue;
        if(key==='title'&&element.matches('.document-name,.file-open,.account-label'))continue;
        const source=sources[key]?.rendered===current?sources[key].source:current;
        const rendered=translate(source);
        if(rendered!==current)element.setAttribute(key,rendered);
        sources[key]={source,rendered};
      }
    }
    }
    observer.takeRecords();
  };
  let pending=false,closed=false;
  const observer=new MutationObserver(()=>{
    if(pending)return;pending=true;
    queueMicrotask(()=>{pending=false;if(!closed)run();});
  });
  observer.observe(host,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder']});
  run();
  return ()=>{closed=true;observer.disconnect();};
}
