import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FlaskConical, Gauge, FileText, Link2, Search, ShieldCheck, Globe } from 'lucide-react';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { foldSubMode } from '@/lib/apiworkbench/subAddress';
import { RequestWorkspace } from './http-toolkit/RequestWorkspace';
import { WebSocketPanel } from './http-toolkit/WebSocketPanel';
import { OpenApiPanel } from './http-toolkit/OpenApiPanel';
import { MockPanel } from './http-toolkit/MockPanel';
import { StressPanel } from './http-toolkit/StressPanel';
import './http-toolkit/workbench.css';
import { WorkbenchProvider } from './http-toolkit/WorkbenchContext';

type HttpToolkitMode = 'request' | 'websocket' | 'openapi' | 'mock' | 'stress';

export default function HttpToolkitTool() {
  const { t } = useI18n();
  // 工作台只跟随工具箱全局主题：自己的切换按钮与全局设置重复，已移除。
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const [mode, setMode] = useToolkitMode<HttpToolkitMode>(['request', 'websocket', 'openapi', 'mock', 'stress'], 'request');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || document.querySelector('[role="dialog"]')) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setMode('request');
        requestAnimationFrame(() => window.dispatchEvent(new Event('wb:search')));
      } else if (event.key === '/') {
        event.preventDefault();
        window.dispatchEvent(new Event('wb:help'));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setMode]);

  useEffect(() => {
    const folded = foldSubMode(searchParams.get('mode'));
    if (!folded) return;
    const next = new URLSearchParams(searchParams);
    // 回到默认页签就把 mode 删掉，跟 useToolkitMode 的干净链接口径一致。
    if (folded.mode === 'request') next.delete('mode');
    else next.set('mode', folded.mode);
    next.set('sub', folded.sub);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <WorkbenchProvider>
      <div className={`api-workbench${dark ? ' wb-dark' : ''}`}>
      <header className="wb-titlebar">
        <Link to="/tools" className="wb-brand" title={t({ zh: '返回工具箱', en: 'Back to toolbox' })}>DEVTOOLBOX <span>⌄</span></Link>
        <button type="button" className="wb-command" onClick={() => { setMode('request'); requestAnimationFrame(() => window.dispatchEvent(new Event('wb:search'))); }}><Search size={15} />{t({ zh: '搜索请求与集合', en: 'Search requests and collections' })}<kbd>⌘ K</kbd></button>
        <span className="wb-header-actions">
          <span className="wb-local"><ShieldCheck size={14} />{t({ zh: '本地工作区', en: 'Local workspace' })}</span>
        </span>
      </header>
      <div className="wb-app-body">
      <nav className="wb-navigation" aria-label={t({ zh: 'API 工作台页签', en: 'API workbench tab' })}>
        <div role="tablist" aria-label={t({ zh: '工作区', en: 'Workspace' })} aria-orientation="vertical" onKeyDown={(event) => {
          const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
          if (!keys.includes(event.key)) return;
          event.preventDefault();
          const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
          const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
          tabs[next]?.focus(); tabs[next]?.click();
        }}>
          {([
            ['request', 'REST', Link2],
            ['websocket', 'WebSocket', Globe],
            ['openapi', 'OpenAPI', FileText],
            ['mock', 'Mock', FlaskConical],
            ['stress', t({ zh: '压测', en: 'Stress' }), Gauge],
          ] as const).map(([value, label, Icon]) => <button key={value} type="button" role="tab" aria-selected={mode === value} tabIndex={mode === value ? 0 : -1} title={label} aria-label={label} onClick={() => setMode(value)}><Icon size={17} /></button>)}
        </div>
      </nav>
      <div className="wb-content">
      <LazyPanel active={mode === 'request'}>
        <RequestWorkspace active={mode === 'request'} />
      </LazyPanel>
      <LazyPanel active={mode === 'websocket'}>
        <WebSocketPanel active={mode === 'websocket'} />
      </LazyPanel>
      <LazyPanel active={mode === 'openapi'}>
        <OpenApiPanel active={mode === 'openapi'} onJumpToRequest={() => setMode('request')} />
      </LazyPanel>
      <LazyPanel active={mode === 'mock'}>
        <MockPanel active={mode === 'mock'} />
      </LazyPanel>
      <LazyPanel active={mode === 'stress'}>
        <StressPanel active={mode === 'stress'} />
      </LazyPanel>

      </div>
      </div>
      <footer className="wb-statusbar"><ShieldCheck size={14} /><span>{t({ zh: '请求、集合与环境保存在本机浏览器。', en: 'Requests, collections and environments stay in this browser.' })}</span></footer>
      </div>
    </WorkbenchProvider>
  );
}
