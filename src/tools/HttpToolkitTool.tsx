import { useEffect, useState, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FlaskConical, Gauge, FileText, Link2, Search, ShieldCheck, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Zap } from 'lucide-react';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { useI18n } from '@/i18n/I18nProvider';
import { foldSubMode } from '@/lib/apiworkbench/subAddress';
import { RequestWorkspace } from './http-toolkit/RequestWorkspace';
import { OpenApiPanel } from './http-toolkit/OpenApiPanel';
import { MockPanel } from './http-toolkit/MockPanel';
import { StressPanel } from './http-toolkit/StressPanel';
import { ProxySourcePopover } from './http-toolkit/ProxySourcePopover';
import './http-toolkit/workbench.css';
import { WorkbenchProvider, useWorkbench } from './http-toolkit/WorkbenchContext';

// 「实时」页签内聚四个协议（WebSocket / SSE / Socket.IO / MQTT），
// 协议栈各自懒加载：socket.io-client 与 mqtt.js 只在进入对应协议 tab 时才拉取。
const RealtimeWorkspace = lazy(() => import('./http-toolkit/RealtimeWorkspace'));

type HttpToolkitMode = 'request' | 'realtime' | 'openapi' | 'mock' | 'stress';

export default function HttpToolkitTool() {
  const { t } = useI18n();
  // 主题跟随工具箱全局设置：这里只读全局 dark 类，不再自带切换按钮。
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  // 左侧页签导航的开合。会话内有效，不进存档：页签布局偏好与请求数据是两回事。
  // 默认收起（只露图标），与 Hoppscotch 一致；展开时名称显示在图标下方。
  const [navCollapsed, setNavCollapsed] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  // 页签解析与 URL 折叠同源：搜索面板写的 ?mode=<协议> 或 ?mode=graphql 在解析成
  // 页签状态的同时一次性折进干净 URL（?mode=realtime&proto=… / ?sub=…），
  // 视图不闪烁、也不存在两次 setSearchParams 基于过期闭包相互覆盖的问题。
  const requestedMode = searchParams.get('mode');
  const folded = foldSubMode(requestedMode);
  const resolvedMode: HttpToolkitMode = folded
    ? (folded.mode as HttpToolkitMode)
    : (['request', 'realtime', 'openapi', 'mock', 'stress'].includes(requestedMode ?? '')
        ? (requestedMode as HttpToolkitMode)
        : 'request');
  const mode = resolvedMode;
  const setMode = (next: HttpToolkitMode) => {
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      if (next === 'request') nextParams.delete('mode');
      else nextParams.set('mode', next);
      return nextParams;
    });
  };

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
  }, []);

  useEffect(() => {
    if (!folded) return;
    // 折叠结果写回干净 URL（语义与解析处同源，这里只做写回）。
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (folded.mode === 'request') {
        next.delete('mode');
        if (folded.sub) next.set('sub', folded.sub);
        next.delete('proto');
      } else {
        next.set('mode', folded.mode);
        if (folded.sub) next.set('sub', folded.sub);
        if (folded.proto && folded.proto !== 'websocket') next.set('proto', folded.proto);
        else next.delete('proto');
      }
      return next;
    }, { replace: true });
  }, [folded, setSearchParams]);

  return (
    <WorkbenchProvider>
      <div className={`api-workbench hopp-workbench${dark ? ' wb-dark' : ''}`}>
      <header className="wb-titlebar">
        <Link to="/tools" className="wb-brand" title={t({ zh: '返回工具箱', en: 'Back to toolbox' })}>DEVTOOLBOX <span>⌄</span></Link>
        <button type="button" className="wb-command" onClick={() => { setMode('request'); requestAnimationFrame(() => window.dispatchEvent(new Event('wb:search'))); }}><Search size={15} />{t({ zh: '搜索请求与集合', en: 'Search requests and collections' })}<kbd>⌘ K</kbd></button>
        <span className="wb-header-actions">
          <span className="wb-local"><ShieldCheck size={14} />{t({ zh: '本地工作区', en: 'Local workspace' })}</span>
        </span>
      </header>
      <div className="wb-app-body">
      <nav className={`wb-navigation${navCollapsed ? ' wb-nav-collapsed' : ''}`} aria-label={t({ zh: 'API 工作台页签', en: 'API workbench tab' })}>
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
            ['realtime', t({ zh: '实时', en: 'Realtime' }), Zap],
            ['openapi', 'OpenAPI', FileText],
            ['mock', 'Mock', FlaskConical],
            ['stress', t({ zh: '压测', en: 'Stress' }), Gauge],
          ] as const).map(([value, label, Icon]) => (
            <button key={value} type="button" role="tab" aria-selected={mode === value} tabIndex={mode === value ? 0 : -1} title={label} aria-label={label} onClick={() => setMode(value)}>
              <Icon size={17} />
              <span className="wb-nav-label">{label}</span>
            </button>
          ))}
        </div>
      </nav>
      <div className="wb-content">
      <LazyPanel active={mode === 'request'}>
        <RequestWorkspace active={mode === 'request'} />
      </LazyPanel>
      <LazyPanel active={mode === 'realtime'}>
        <Suspense fallback={null}>
          <RealtimeWorkspace active={mode === 'realtime'} />
        </Suspense>
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
      <footer className="wb-statusbar">
        {/* 折叠/展开左侧页签导航（含 REST、实时、OpenAPI、Mock、压测五个一级页签）。 */}
        <button type="button" className="wb-icon" onClick={() => setNavCollapsed((collapsed) => !collapsed)} title={navCollapsed ? t({ zh: '展开页签导航', en: 'Expand tab navigation' }) : t({ zh: '折叠页签导航', en: 'Collapse tab navigation' })} aria-label={navCollapsed ? t({ zh: '展开页签导航', en: 'Expand tab navigation' }) : t({ zh: '折叠页签导航', en: 'Collapse tab navigation' })} aria-expanded={!navCollapsed}>
          {/* 图标语义：收起时露「展开」，展开时露「收起」。 */}
          {navCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
        {/* 取数通道入口：点击弹出代理源选择（浏览器/网络/程序/浏览器扩展）。 */}
        <StatusbarChannelButton />
        {/* 占满中段把右侧按钮顶到最右：专门开合右侧集合侧栏。 */}
        <span className="wb-statusbar-spacer" />
        <StatusbarSidebarToggle />
      </footer>
      </div>
    </WorkbenchProvider>
  );
}

/** 状态栏的取数通道按钮：本地图标 + 通道弹层，通道状态经 WorkbenchContext 与请求面板共享。
 *  气泡相对按钮定位在正上方，不贴状态栏边缘。 */
function StatusbarChannelButton() {
  const { t } = useI18n();
  const { sendChannel, setSendChannel } = useWorkbench();
  const [open, setOpen] = useState(false);
  const label = t({ zh: '取数通道（浏览器 / 网络 / 程序 / 浏览器扩展）', en: 'Request channel (browser / network / program / extension)' });
  return (
    <span className="wb-statusbar-anchor">
      <button
        type="button"
        className="wb-icon"
        onClick={() => setOpen((value) => !value)}
        // pointerdown 先于 click：若不停播，文档级的外部点击关闭会把
        // 「再次点击触发按钮」当成外部点击，紧接着的 click 又把它翻回来，
        // 于是气泡永远关不掉。停播后开合全交给 click 的切换。
        onPointerDown={(event) => event.stopPropagation()}
        title={label}
        aria-label={label}
        aria-expanded={open}
      >
        <ShieldCheck size={14} />
      </button>
      <ProxySourcePopover open={open} onClose={() => setOpen(false)} channel={sendChannel} onChange={setSendChannel} />
    </span>
  );
}

/** 状态栏右侧的集合侧栏开关：与请求面板内的切换按钮共用同一份 context 状态。 */
function StatusbarSidebarToggle() {
  const { t } = useI18n();
  const { collectionSidebarOpen, toggleCollectionSidebar } = useWorkbench();
  const label = t({ zh: '切换集合侧栏', en: 'Toggle collection sidebar' });
  return (
    <button type="button" className="wb-icon" onClick={toggleCollectionSidebar} title={label} aria-label={label} aria-expanded={collectionSidebarOpen}>
      {collectionSidebarOpen ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
    </button>
  );
}
