import whiteboardShell from './whiteboard/shell.js';
import pdfShell from './pdf/shell.js';
/** Route-owned DOM scopes for the migrated native editors. No frame or remote UI is used.
 * Detached workspaces keep unsaved documents while the user visits another tool.
 */
const scopes = new Map();
export function getScope(name) {
  if (scopes.has(name)) return scopes.get(name);
  const nativeDocument = globalThis.document;
  if (!nativeDocument) {
    const dynamic = name => new Proxy({}, { get(_target, key) {
      const owner = globalThis[name]; const value = owner?.[key];
      return typeof value === 'function' && !/^[A-Z]/.test(String(key)) ? value.bind(owner) : value;
    }});
    return { document: dynamic('document'), window: dynamic('window') };
  }
  const nativeWindow = globalThis.window;
  const host = nativeDocument.createElement('section');
  host.dataset.nativeWorkspace = name;
  host.style.cssText = 'position:relative;height:100%;width:100%;overflow:hidden;isolation:isolate;contain:layout style;--native-height:calc(100dvh - 44px)';
  host.innerHTML = name === 'whiteboard' ? whiteboardShell : pdfShell;
  const lookup = selector => host.matches(selector) ? host : host.querySelector(selector);
  const listeners = new Map();
  const scopedDocument = new Proxy(nativeDocument, {
    get(target, key) {
      if (key === 'body' || key === 'documentElement' || key === 'scrollingElement' || key === 'head') return host;
      if (key === 'querySelector') return lookup;
      if (key === 'querySelectorAll') return selector => host.querySelectorAll(selector);
      if (key === 'getElementById') return id => host.querySelector(`#${CSS.escape(id)}`);
      if (key === 'getElementsByClassName') return value => host.getElementsByClassName(value);
      if (key === 'getElementsByTagName') return value => host.getElementsByTagName(value);
      if (key === 'addEventListener') return (type, listener, options) => {
        if (!['selectionchange', 'visibilitychange', 'fullscreenchange'].includes(type)) return host.addEventListener(type, listener, options);
        const wrapped = event => { if (host.isConnected) typeof listener === 'function' ? listener(event) : listener.handleEvent(event); };
        let entries = listeners.get(listener); if (!entries) listeners.set(listener, entries = []);
        entries.push({ type, wrapped, options });
        target.addEventListener(type, wrapped, options);
      };
      if (key === 'removeEventListener') return (type, listener, options) => {
        host.removeEventListener(type, listener, options);
        for (const entry of listeners.get(listener) || []) if (entry.type === type) target.removeEventListener(type, entry.wrapped, options);
        listeners.set(listener, (listeners.get(listener) || []).filter(entry => entry.type !== type));
      };
      if (key === 'activeElement') return host.contains(target.activeElement) ? target.activeElement : host;
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, key, value) {
      // Document titles and site metadata belong to the surrounding React router.
      if (key === 'title') return true;
      return Reflect.set(target, key, value, target);
    },
  });
  const scopedWindow = new Proxy(nativeWindow, {
    get(target, key) {
      if (key === 'document') return scopedDocument;
      if (key === 'history') return new Proxy(target.history, { get(history, method) {
        if (method === 'pushState' || method === 'replaceState') return (state, title, url) => {
          if (!host.isConnected) return;
          const { idx, key, usr } = history.state || {};
          history[method]({ idx, key, usr, ...state }, title, url);
        };
        const value = Reflect.get(history, method, history);
        return typeof value === 'function' ? value.bind(history) : value;
      }});
      if (key === 'innerHeight') return host.clientHeight || target.innerHeight - 44;
      if (key === 'innerWidth') return host.clientWidth || target.innerWidth;
      if (key === 'addEventListener') return (type, listener, options) => {
        const wrapped = event => {
          if (!host.isConnected && type !== 'beforeunload') return;
          if (typeof listener === 'function') listener.call(scopedWindow, event);
          else listener?.handleEvent(event);
        };
        let entries=listeners.get(listener);if(!entries)listeners.set(listener,entries=[]);
        entries.push({type,wrapped,options});
        target.addEventListener(type,wrapped,options);
      };
      if (key === 'removeEventListener') return (type, listener, options) => {
        const entries=listeners.get(listener)||[];
        for(const entry of entries)if(entry.type===type)target.removeEventListener(type,entry.wrapped,options);
        listeners.set(listener,entries.filter(entry=>entry.type!==type));
      };
      const value=Reflect.get(target,key,target);
      // Native constructors must keep their [[Construct]] behavior.
      return typeof value==='function' && !/^[A-Z]/.test(String(key)) ? value.bind(target) : value;
    },
    set(target,key,value){return Reflect.set(target,key,value,target);},
  });
  const scope={host,document:scopedDocument,window:scopedWindow,started:null};
  scopes.set(name,scope);
  return scope;
}
let sdkPromise;
export function loadCloudSdk() {
  if(globalThis.puter)return Promise.resolve();
  return sdkPromise ||= new Promise(resolve=>{
    const script=globalThis.document.createElement('script');
    script.src='https://js.puter.com/v2/';script.async=true;
    script.onload=()=>{globalThis.window.dispatchEvent(new Event('webtool-puter-ready'));resolve();};
    script.onerror=()=>resolve();
    globalThis.document.head.append(script);
    // Local editing remains usable when the cloud SDK cannot be reached.
    setTimeout(resolve,4000);
  });
}
